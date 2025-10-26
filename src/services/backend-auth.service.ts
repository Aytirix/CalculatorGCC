import { storage } from '@/utils/storage';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:7000';
const JWT_STORAGE_KEY = 'gcc_jwt_token';

export interface JWTPayload {
  api_token: string;
  refresh_token?: string;
  token_expires_at?: number;
  user_id_42: number;
  login: string;
  email: string;
  image_url?: string;
}

export interface User {
  user_id_42: number;
  login: string;
  email: string;
  image_url?: string;
  // Propriétés optionnelles pour compatibilité
  image?: {
    link?: string;
  };
  level?: number;
}

export const backendAuthService = {
  /**
   * Redirige vers le backend pour initier l'authentification OAuth 42
   */
  login: (): void => {
    window.location.href = `${BACKEND_URL}/api/auth/42`;
  },

  /**
   * Gère le retour du callback OAuth
   * Récupère le JWT depuis l'URL et le stocke
   * @returns true si un token a été trouvé et stocké
   */
  handleCallback: (): boolean => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const error = urlParams.get('error');

    if (error) {
      console.error('Authentication error:', error);
      return false;
    }

    if (token) {
      backendAuthService.saveToken(token);
      // Nettoyer l'URL
      window.history.replaceState({}, document.title, window.location.pathname);
      return true;
    }

    return false;
  },

  /**
   * Sauvegarde le JWT
   */
  saveToken: (token: string): void => {
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
   * Vérifie la validité du JWT auprès du backend
   */
  validateToken: async (): Promise<boolean> => {
    const token = backendAuthService.getToken();
    if (!token) return false;

    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
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
   * Récupère les infos complètes depuis le backend
   */
  getUserFromBackend: async (): Promise<User | null> => {
    const token = backendAuthService.getToken();
    if (!token) return null;

    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user info');
      }

      return response.json();
    } catch (error) {
      console.error('Error fetching user from backend:', error);
      return null;
    }
  },

  /**
   * Déconnexion
   */
  logout: async (): Promise<void> => {
    const token = backendAuthService.getToken();

    // Appel optionnel au backend
    if (token) {
      try {
        await fetch(`${BACKEND_URL}/api/auth/logout`, {
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
