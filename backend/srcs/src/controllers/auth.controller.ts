import { FastifyReply, FastifyRequest } from 'fastify';
import axios from 'axios';
import { config } from '../config/config.js';
import { prisma } from '../db/connection.js';
import { simulationRepository } from '../db/simulationRepository.js';

export class AuthController {
  /**
   * Redirige vers la page d'authentification 42
   */
  static initiateOAuth(_request: FastifyRequest, reply: FastifyReply) {
    // Toujours utiliser APP_DOMAIN comme source de vérité pour le redirect_uri.
    // Si on dérive depuis les headers (x-forwarded-proto/host), le moindre écart
    // entre init et callback (proto manquant, port suffixé, etc.) provoque un
    // invalid_grant à l'échange du code → l'auth échoue silencieusement.
    const redirectUri = config.oauth42.redirectUri;

    const authUrl = new URL(config.oauth42.authUrl);
    authUrl.searchParams.append('client_id', config.oauth42.clientId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'public');

    return reply.redirect(authUrl.toString());
  }

  /**
   * Redirige vers la page /callback du frontend avec une erreur exploitable.
   * Important : on cible /callback (et pas la racine), sinon aucun composant
   * ne lit le paramètre ?error et l'utilisateur reste bloqué sur Login.
   */
  private static redirectWithError(reply: FastifyReply, reason?: string) {
    const errorUrl = new URL(`${config.frontendUrl}/callback`);
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

    console.log('[Auth Controller] OAuth callback received with code:', code);
    console.log('[Auth Controller] Using redirect_uri:', redirectUri);

    // 42 peut rediriger ici sans code mais avec ?error= (app révoquée, accès refusé,
    // clé OAuth expirée...). On redirige vers le front au lieu d'un JSON 400 cul-de-sac.
    if (!code) {
      console.error('[Auth Controller] No authorization code in callback. 42 error:', oauthError);
      return AuthController.redirectWithError(reply, oauthError || 'missing_code');
    }

    try {
      // Échanger le code contre un access token
      const tokenResponse = await axios.post(config.oauth42.tokenUrl, {
        grant_type: 'authorization_code',
        client_id: config.oauth42.clientId,
        client_secret: config.oauth42.clientSecret,
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
      console.log('[Auth Controller] JWT generated, length:', token.length);
      console.log('[Auth Controller] JWT preview:', token.substring(0, 50) + '...');

      // Rediriger vers le frontend avec le token JWT
      const redirectUrl = new URL(`${config.frontendUrl}/callback`);
      redirectUrl.searchParams.append('token', token);

      console.log('[Auth Controller] Redirecting to:', redirectUrl.toString().substring(0, 100) + '...');
      return reply.redirect(redirectUrl.toString());
    } catch (error: any) {
      console.error('OAuth error:', error.response?.data || error.message);

      // Raison réelle renvoyée par 42 (ex: invalid_client quand le secret a été
      // régénéré / la clé OAuth a expiré) pour pouvoir l'afficher côté front.
      const reason = error.response?.data?.error || error.response?.data?.message;
      return AuthController.redirectWithError(reply, reason);
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

    return {
      user_id_42: user.user_id_42,
      login: user.login,
      email: user.email,
      image_url: user.image_url,
      api_token: user.api_token,
      is_public: isPublic,
    };
  }

  /**
   * Déconnexion (côté client, suppression du token)
   */
  static async logout() {
    return { message: 'Logged out successfully' };
  }
}
