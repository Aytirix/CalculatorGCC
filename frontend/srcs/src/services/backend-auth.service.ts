import { storage } from '@/utils/storage';
import { config } from '@/config/config';

// Le backend est accessible via Nginx reverse proxy
const BACKEND_URL = config.backendUrl;
const JWT_STORAGE_KEY = 'gcc_jwt_token';

export interface JWTPayload {
  api_token: string;
  // Le refresh_token 42 ne circule plus dans le JWT : il vit chiffré côté
  // serveur. Un JWT n'est que du base64 — l'y laisser exposait le secret qui
  // régénère des accès 42 sans limite.
  token_expires_at?: number;
  user_id_42: number;
  login: string;
  email: string;
  image_url?: string;
  /** Expiration UNIX (secondes), posée par le backend à la signature. */
  exp?: number;
}

export interface User {
  user_id_42: number;
  login: string;
  email: string;
  image_url?: string;
  is_public?: boolean | null;
  is_admin?: boolean;
  credentials_invalid?: boolean;
  next_secret_missing?: boolean;
  // Propriétés optionnelles pour compatibilité
  image?: {
    link?: string;
  };
  level?: number;
}

export interface MeResponse {
  user_id_42: number;
  login: string;
  email: string;
  image_url?: string;
  api_token?: string;
  is_public: boolean | null;
  is_admin: boolean;
  credentials_invalid: boolean;
  next_secret_missing: boolean;
}

/**
 * Résultat d'une vérification de session.
 *
 * Un simple `null` mélangeait des situations qui n'ont rien à voir : un jeton
 * refusé, un serveur injoignable et un quota dépassé donnaient tous « Token
 * invalide » à l'écran — et, pire, provoquaient tous une déconnexion alors
 * qu'une coupure réseau d'une seconde ne devrait rien effacer.
 */
export type SessionCheck =
  | { status: 'valid'; me: MeResponse }
  /** Aucun jeton en mémoire : il n'y a rien à vérifier. */
  | { status: 'no-token' }
  /** Le serveur refuse le jeton (signé ailleurs), ou il a expiré. */
  | { status: 'rejected' }
  /**
   * Le serveur réclame son assistant de configuration.
   *
   * Doit rester distinct des autres 5xx : le reste de l'application déduit
   * « jeton présent donc instance configurée » (voir `useSetupCheck`). Garder le
   * jeton dans ce cas empêcherait à jamais la redirection vers le setup, et
   * l'instance resterait bloquée sur un écran de connexion inopérant.
   */
  | { status: 'not-configured' }
  /** Backend injoignable ou en panne : la session, elle, reste valable. */
  | { status: 'unreachable' }
  /** Quota de requêtes dépassé : il suffit d'attendre. */
  | { status: 'throttled' }
  | { status: 'unexpected'; code: number };

/** Faut-il effacer la session ? Seuls un refus et un serveur à reconfigurer l'imposent. */
export function sessionMustBeCleared(check: SessionCheck): boolean {
  return check.status === 'rejected' || check.status === 'not-configured';
}

/** Réessayer a-t-il une chance d'aboutir, ou l'état est-il durable ? */
export function sessionRetryIsWorthIt(check: SessionCheck): boolean {
  return check.status === 'unreachable' || check.status === 'throttled';
}

/**
 * Message lisible pour l'utilisateur.
 *
 * Le vouvoiement est celui déjà employé par l'écran de callback, qui est le
 * principal consommateur de ces textes.
 */
export function sessionCheckMessage(check: Exclude<SessionCheck, { status: 'valid' }>): string {
  switch (check.status) {
    case 'no-token':
      return "Aucune session n'a été reçue. Relancez la connexion.";
    case 'rejected':
      return "La connexion 42 a bien abouti, mais ce serveur n'a pas reconnu la session créée — le plus souvent parce qu'il ne relaie pas la même instance qu'au moment de la connexion. Se reconnecter donnera le même résultat tant que la configuration n'a pas changé.";
    case 'not-configured':
      return "Ce serveur n'a pas terminé sa configuration initiale. Un administrateur doit la reprendre avant que la connexion puisse fonctionner.";
    case 'unreachable':
      return 'Le serveur est injoignable pour le moment. Votre session est conservée, réessayez dans un instant.';
    case 'throttled':
      return 'Trop de requêtes en peu de temps. Patientez quelques secondes puis réessayez.';
    case 'unexpected':
      return `Le serveur a renvoyé une réponse inattendue (code ${check.code}). C'est probablement une erreur de configuration côté serveur : réessayer n'y changera sans doute rien.`;
  }
}

export const backendAuthService = {
  /**
   * Redirige vers le backend pour initier l'authentification OAuth 42
   */
  login: (): void => {
    // On indique d'où part la connexion : sur un déploiement miroir (frontend
    // servi ailleurs, /api proxifié vers le backend principal), c'est ici qu'il
    // faut revenir à la fin. Le backend ne l'accepte que si l'origine figure
    // dans sa liste blanche, et retombe sinon sur son propre domaine.
    const origin = encodeURIComponent(window.location.origin);
    window.location.href = `${BACKEND_URL}/auth/42?origin=${origin}`;
  },

  /**
   * Sauvegarde le JWT
   */
  saveToken: (token: string): void => {
    console.log('[Auth] Saving token to storage');
    storage.set(JWT_STORAGE_KEY, token);
  },

  /**
   * Récupère le JWT stocké
   */
  getToken: (): string | null => {
    return storage.get(JWT_STORAGE_KEY);
  },

  /**
   * Décode le JWT et retourne le payload
   */
  getPayload: (): JWTPayload | null => {
    const token = backendAuthService.getToken();
    if (!token) return null;

    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('Error decoding JWT:', error);
      return null;
    }
  },

  /**
   * Récupère le token de l'API 42 depuis le JWT
   */
  getApiToken: (): string | null => {
    const payload = backendAuthService.getPayload();
    return payload?.api_token || null;
  },

  /**
   * Vérifie si l'utilisateur est connecté
   */
  isAuthenticated: (): boolean => {
    return backendAuthService.getToken() !== null;
  },

  /**
   * Vérifie la validité du JWT auprès du backend.
   *
   * Seul `rejected` justifie d'effacer la session : sur un serveur injoignable
   * ou un quota dépassé, le jeton reste bon et l'utilisateur doit pouvoir
   * réessayer sans avoir à refaire toute la connexion 42.
   */
  validateToken: async (): Promise<SessionCheck> => {
    const token = backendAuthService.getToken();
    if (!token) return { status: 'no-token' };

    // Expiration lue localement AVANT tout appel : sans ce contrôle, un jeton
    // périmé survivait indéfiniment tant que le serveur restait injoignable —
    // et il transporte les jetons 42 de l'utilisateur.
    if (backendAuthService.isExpired()) return { status: 'rejected' };

    let response: Response;
    try {
      response = await fetch(`${BACKEND_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (error) {
      console.error('[Auth] validateToken - serveur injoignable:', error);
      return { status: 'unreachable' };
    }

    if (response.status === 401) return { status: 'rejected' };
    if (response.status === 429) return { status: 'throttled' };

    // 503 « setupRequired » : le serveur réclame son assistant de configuration.
    // À traiter à part, surtout pas comme une panne passagère.
    if (response.status === 503) {
      const body = await response.json().catch(() => null);
      if (body && (body as { setupRequired?: boolean }).setupRequired) {
        return { status: 'not-configured' };
      }
      return { status: 'unreachable' };
    }

    // 502/504 : c'est le relais ou le backend qui est en panne, pas le jeton.
    if (response.status >= 500) return { status: 'unreachable' };

    if (!response.ok) {
      // 403 compris : aucune route de l'API n'en émet sur /auth/me, il vient
      // donc d'un intermédiaire (pare-feu applicatif, anti-bot). Déconnecter
      // l'utilisateur pour ça serait précisément l'erreur qu'on veut éviter.
      console.error('[Auth] validateToken - statut inattendu:', response.status);
      return { status: 'unexpected', code: response.status };
    }

    try {
      return { status: 'valid', me: (await response.json()) as MeResponse };
    } catch (error) {
      // Réponse 200 illisible : typiquement une page HTML servie à la place de
      // l'API (mauvaise configuration de relais), pas un problème de session.
      console.error('[Auth] validateToken - réponse illisible:', error);
      return { status: 'unreachable' };
    }
  },

  /** Le jeton stocké a-t-il dépassé sa date d'expiration ? */
  isExpired: (): boolean => {
    const payload = backendAuthService.getPayload();
    if (!payload?.exp) return false; // Pas de date : on laisse le serveur trancher.
    return payload.exp * 1000 <= Date.now();
  },

  /**
   * Récupère les infos utilisateur depuis le JWT
   */
  getUser: (): User | null => {
    const payload = backendAuthService.getPayload();
    if (!payload) return null;

    return {
      user_id_42: payload.user_id_42,
      login: payload.login,
      email: payload.email,
      image_url: payload.image_url,
    };
  },

  /**
   * Déconnexion
   */
  logout: async (): Promise<void> => {
    const token = backendAuthService.getToken();

    // Appel optionnel au backend
    if (token) {
      try {
        await fetch(`${BACKEND_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (error) {
        console.error('Logout error:', error);
      }
    }

    // Supprimer le token
    storage.remove(JWT_STORAGE_KEY);
  },
};
