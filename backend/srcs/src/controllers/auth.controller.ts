import { FastifyReply, FastifyRequest } from 'fastify';
import axios from 'axios';
import { config } from '../config/config.js';
import { prisma } from '../db/connection.js';
import { simulationRepository } from '../db/simulationRepository.js';
import { userToken42Repository } from '../db/userToken42Repository.js';
import { requestOAuth42Token } from '../services/oauth42.service.js';
import { getAdminConfigStatus } from '../db/configRepository.js';
import { isDelegate } from '../db/adminRepository.js';
import { allowedOriginRepository, normalizeOrigin } from '../db/allowedOriginRepository.js';
import { createOAuthState, readOAuthState } from '../services/oauthState.service.js';

export class AuthController {
  /**
   * Redirige vers la page d'authentification 42
   */
  static async initiateOAuth(request: FastifyRequest, reply: FastifyReply) {
    // Toujours utiliser APP_DOMAIN comme source de vérité pour le redirect_uri.
    // Si on dérive depuis les headers (x-forwarded-proto/host), le moindre écart
    // entre init et callback (proto manquant, port suffixé, etc.) provoque un
    // invalid_grant à l'échange du code → l'auth échoue silencieusement.
    const redirectUri = config.oauth42.redirectUri;

    // Origine d'où part la connexion : un frontend miroir proxifie /api vers ce
    // backend, et c'est chez LUI qu'il faut revenir à la fin. On la valide dès
    // maintenant, et on la scelle dans le `state` pour la retrouver au retour.
    const { origin } = request.query as { origin?: string };
    const requested = origin ? normalizeOrigin(origin) : null;
    const target =
      requested && (await allowedOriginRepository.isAllowed(requested))
        ? requested
        : normalizeOrigin(config.frontendUrl) ?? config.frontendUrl;

    const authUrl = new URL(config.oauth42.authUrl);
    authUrl.searchParams.append('client_id', config.oauth42.clientId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'public');
    authUrl.searchParams.append('state', createOAuthState(target));

    return reply.redirect(authUrl.toString());
  }

  /**
   * Origine vers laquelle renvoyer l'utilisateur à la fin du flux.
   *
   * La signature du `state` prouve que NOUS l'avons émise ; on revalide quand
   * même contre la liste d'origines autorisées, pour qu'une révocation dans le
   * panneau admin prenne effet immédiatement, même sur un flux déjà commencé.
   */
  private static async resolveReturnOrigin(request: FastifyRequest): Promise<string> {
    const { state } = request.query as { state?: string };
    const origin = readOAuthState(state);
    if (origin && (await allowedOriginRepository.isAllowed(origin))) return origin;
    return config.frontendUrl;
  }

  /**
   * Redirige vers la page /callback du frontend avec une erreur exploitable.
   * Important : on cible /callback (et pas la racine), sinon aucun composant
   * ne lit le paramètre ?error et l'utilisateur reste bloqué sur Login.
   */
  private static redirectWithError(reply: FastifyReply, reason?: string, origin?: string) {
    const errorUrl = new URL(`${origin ?? config.frontendUrl}/callback`);
    errorUrl.searchParams.append('error', 'authentication_failed');
    if (reason) {
      errorUrl.searchParams.append('reason', reason);
    }
    return reply.redirect(errorUrl.toString());
  }

  /**
   * Callback OAuth 42 - échange le code contre un token et crée un JWT
   */
  static async handleCallback(request: any, reply: FastifyReply) {
    const { code, error: oauthError } = request.query as { code?: string; error?: string };
    const redirectUri = config.oauth42.redirectUri;

    // Domaine à qui rendre la main : celui d'où la connexion est partie, scellé
    // dans le `state`. Résolu AVANT tout traitement, pour que même les erreurs
    // ramènent la personne sur son propre site.
    const returnOrigin = await AuthController.resolveReturnOrigin(request);

    console.log('[Auth Controller] OAuth callback received with code:', code);
    console.log('[Auth Controller] Using redirect_uri:', redirectUri);

    // 42 peut rediriger ici sans code mais avec ?error= (app révoquée, accès refusé,
    // clé OAuth expirée...). On redirige vers le front au lieu d'un JSON 400 cul-de-sac.
    if (!code) {
      console.error('[Auth Controller] No authorization code in callback. 42 error:', oauthError);
      return AuthController.redirectWithError(reply, oauthError || 'missing_code', returnOrigin);
    }

    try {
      // Échange du code contre un access token — via le helper qui bascule
      // automatiquement sur le « Next Secret 42 » si le secret courant a été
      // révoqué côté intra (invalid_client).
      const tokenResponse = await requestOAuth42Token({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      });

      const { access_token, expires_in, refresh_token } = tokenResponse.data;

      // Récupérer les informations utilisateur
      const userResponse = await axios.get(`${config.oauth42.apiUrl}/me`, {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      const userData = userResponse.data;

      // Stocker les tokens 42 côté serveur (chiffrés) : source de vérité pour
      // les rafraîchir plus tard sans dépendre du token gelé dans le JWT (qui
      // expire en ~2h alors que la session dure 7j).
      if (refresh_token) {
        await userToken42Repository.save(userData.id, {
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt: new Date(expires_in ? Date.now() + expires_in * 1000 : Date.now() + 2 * 60 * 60 * 1000),
        });
      }

      // Le campus est DÉJÀ dans la réponse /me : on le mémorise ici plutôt que
      // d'aller le redemander à l'API 42 plus tard (le Holy Graph s'en sert pour
      // n'afficher que les projets réellement proposés sur ce campus).
      const primaryCampus = (userData.campus_users ?? []).find((c: any) => c?.is_primary);
      const campusId: number | null = primaryCampus?.campus_id ?? userData.campus?.[0]?.id ?? null;
      if (campusId != null) {
        await prisma.userSimulation.upsert({
          where: { userId42: userData.id },
          create: { userId42: userData.id, login: userData.login, campusId },
          update: { campusId },
        });
      }

      // Générer un JWT contenant le token de l'API 42 et les infos utilisateur
      const payload = {
        api_token: access_token,
        refresh_token: refresh_token,
        token_expires_at: expires_in ? Date.now() + expires_in * 1000 : undefined,
        user_id_42: userData.id,
        login: userData.login,
        email: userData.email,
        image_url: userData.image?.link || userData.image?.versions?.medium,
        first_name: userData.first_name,
        last_name: userData.last_name,
      };
      
      console.log('[Auth Controller] Generating JWT with payload:', {
        user_id_42: payload.user_id_42,
        login: payload.login,
        email: payload.email,
      });
      
      // Secret statique (chargé avant l'enregistrement du plugin) → signature
      // synchrone qui renvoie bien la chaîne du token.
      const token = request.server.jwt.sign(payload);
      // Ne jamais logger le JWT (même tronqué) : il contient les tokens 42.
      console.log(`[Auth Controller] JWT généré pour ${payload.login} (len ${token.length})`);

      // Rediriger vers le frontend avec le token JWT
      const redirectUrl = new URL(`${returnOrigin}/callback`);
      redirectUrl.searchParams.append('token', token);

      console.log('[Auth Controller] Redirection vers le callback frontend');
      return reply.redirect(redirectUrl.toString());
    } catch (error: any) {
      console.error('OAuth error:', error.response?.data || error.message);

      // Raison réelle renvoyée par 42 (ex: invalid_client quand le secret a été
      // régénéré / la clé OAuth a expiré) pour pouvoir l'afficher côté front.
      const reason = error.response?.data?.error || error.response?.data?.message;
      return AuthController.redirectWithError(reply, reason, returnOrigin);
    }
  }

  /**
   * Récupère les informations de l'utilisateur connecté depuis le JWT
   */
  static async getMe(request: FastifyRequest) {
    const user = request.user;

    // Upsert pour pouvoir distinguer "pas encore choisi" (ligne absente → traité comme null)
    await prisma.userSimulation.upsert({
      where: { userId42: user.user_id_42 },
      create: {
        userId42: user.user_id_42,
        login: user.login,
        imageUrl: user.image_url ?? null,
        firstName: user.first_name ?? null,
        lastName: user.last_name ?? null,
      },
      update: {},
    });

    const isPublic = await simulationRepository.getPrivacyStatus(user.user_id_42);

    // Admin délégué = login 42 inscrit par l'owner dans la liste des délégués (DB).
    // Ces logins peuvent éditer les SEULS secrets 42 (voie /setup admin) et voient les
    // bannières d'alerte. L'owner, lui, s'authentifie séparément (passkey / console).
    const isAdmin = await isDelegate(user.login);
    // État de config réservé à l'admin (booléens uniquement, jamais les secrets) —
    // et on évite le hit DB pour les utilisateurs normaux.
    let credentialsInvalid = false;
    let nextSecretMissing = false;
    if (isAdmin) {
      const status = await getAdminConfigStatus();
      credentialsInvalid = status.credentialsInvalidSince !== null;
      nextSecretMissing = status.nextSecretMissing;
    }

    return {
      user_id_42: user.user_id_42,
      login: user.login,
      email: user.email,
      image_url: user.image_url,
      api_token: user.api_token,
      is_public: isPublic,
      is_admin: isAdmin,
      credentials_invalid: credentialsInvalid,
      next_secret_missing: nextSecretMissing,
    };
  }

  /**
   * Déconnexion (côté client, suppression du token)
   */
  static async logout() {
    return { message: 'Logged out successfully' };
  }
}
