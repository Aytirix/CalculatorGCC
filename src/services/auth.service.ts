import { config } from '@/config/config';
import { storage } from '@/utils/storage';

export interface User {
  id: number;
  login: string;
  email: string;
  image: {
    link: string;
  };
  level?: number;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  created_at: number;
}

const STORAGE_KEYS = {
  TOKENS: 'auth_tokens',
  USER: 'user_data',
};

export const authService = {
  // Generate OAuth URL for 42 login
  getAuthUrl: (): string => {
    const params = new URLSearchParams({
      client_id: config.oauth.clientId,
      redirect_uri: config.oauth.redirectUri,
      response_type: 'code',
      scope: 'public',
    });
    return `${config.oauth.authUrl}?${params.toString()}`;
  },

  // Exchange authorization code for access token
  exchangeCodeForToken: async (code: string): Promise<AuthTokens> => {
    const response = await fetch(config.oauth.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: config.oauth.clientId,
        client_secret: config.oauth.clientSecret,
        code,
        redirect_uri: config.oauth.redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to exchange code for token');
    }

    const tokens: AuthTokens = await response.json();
    storage.set(STORAGE_KEYS.TOKENS, tokens);
    return tokens;
  },

  // Fetch user info from 42 API
  fetchUserInfo: async (accessToken: string): Promise<User> => {
    const response = await fetch(`${config.oauth.apiUrl}/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user info');
    }

    const user: User = await response.json();
    storage.set(STORAGE_KEYS.USER, user);
    return user;
  },

  // Get stored tokens
  getTokens: (): AuthTokens | null => {
    return storage.get(STORAGE_KEYS.TOKENS);
  },

  // Get stored user
  getUser: (): User | null => {
    return storage.get(STORAGE_KEYS.USER);
  },

  // Check if token is expired
  isTokenExpired: (tokens: AuthTokens): boolean => {
    const expirationTime = tokens.created_at + tokens.expires_in;
    return Date.now() / 1000 > expirationTime;
  },

  // Logout
  logout: (): void => {
    storage.remove(STORAGE_KEYS.TOKENS);
    storage.remove(STORAGE_KEYS.USER);
  },

  // Check if user is authenticated
  isAuthenticated: (): boolean => {
    const tokens = authService.getTokens();
    if (!tokens) return false;
    return !authService.isTokenExpired(tokens);
  },
};
