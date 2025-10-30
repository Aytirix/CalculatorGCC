# Intégration Frontend

Guide pour intégrer le backend simplifié dans votre application frontend.

## Installation côté Frontend

Aucune dépendance spéciale n'est nécessaire. Vous pouvez utiliser `fetch` natif ou une bibliothèque comme `axios`.

## Service d'authentification

Créez un service pour gérer l'authentification :

```typescript
// services/backend-auth.service.ts

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:7000';
const JWT_STORAGE_KEY = 'gcc_jwt_token';

interface JWTPayload {
  api_token: string;
  refresh_token?: string;
  token_expires_at?: number;
  user_id_42: number;
  login: string;
  email: string;
  image_url?: string;
}

export class BackendAuthService {
  /**
   * Initialise la connexion OAuth 42
   */
  static login() {
    window.location.href = `${BACKEND_URL}/api/auth/42`;
  }

  /**
   * Récupère le JWT depuis l'URL après redirection OAuth
   */
  static handleCallback(): boolean {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const error = urlParams.get('error');

    if (error) {
      console.error('Authentication error:', error);
      return false;
    }

    if (token) {
      this.saveToken(token);
      // Nettoyer l'URL
      window.history.replaceState({}, document.title, window.location.pathname);
      return true;
    }

    return false;
  }

  /**
   * Sauvegarde le JWT
   */
  static saveToken(token: string) {
    localStorage.setItem(JWT_STORAGE_KEY, token);
  }

  /**
   * Récupère le JWT stocké
   */
  static getToken(): string | null {
    return localStorage.getItem(JWT_STORAGE_KEY);
  }

  /**
   * Décode le JWT et retourne le payload
   */
  static getPayload(): JWTPayload | null {
    const token = this.getToken();
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
  }

  /**
   * Récupère le token de l'API 42
   */
  static getApiToken(): string | null {
    const payload = this.getPayload();
    return payload?.api_token || null;
  }

  /**
   * Vérifie si l'utilisateur est connecté
   */
  static isAuthenticated(): boolean {
    return this.getToken() !== null;
  }

  /**
   * Vérifie la validité du JWT auprès du backend
   */
  static async validateToken(): Promise<boolean> {
    const token = this.getToken();
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
  }

  /**
   * Récupère les infos utilisateur depuis le JWT
   */
  static getUserInfo() {
    const payload = this.getPayload();
    if (!payload) return null;

    return {
      user_id_42: payload.user_id_42,
      login: payload.login,
      email: payload.email,
      image_url: payload.image_url,
    };
  }

  /**
   * Déconnexion
   */
  static async logout() {
    const token = this.getToken();
    
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
    localStorage.removeItem(JWT_STORAGE_KEY);
  }
}
```

## Service pour l'API 42

Créez un service pour appeler directement l'API 42 :

```typescript
// services/api42-direct.service.ts

import { BackendAuthService } from './backend-auth.service';

const API_42_BASE_URL = 'https://api.intra.42.fr/v2';

export class API42DirectService {
  /**
   * Effectue une requête vers l'API 42
   */
  private static async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const apiToken = BackendAuthService.getApiToken();
    
    if (!apiToken) {
      throw new Error('No API token available. Please login first.');
    }

    const response = await fetch(`${API_42_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${apiToken}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token expiré, déconnecter l'utilisateur
        await BackendAuthService.logout();
        throw new Error('Token expired. Please login again.');
      }
      throw new Error(`API request failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Récupère les infos de l'utilisateur connecté
   */
  static async getMe() {
    return this.request<any>('/me');
  }

  /**
   * Récupère les projets de l'utilisateur
   */
  static async getUserProjects() {
    return this.request<any[]>('/me/projects_users');
  }

  /**
   * Récupère un projet spécifique
   */
  static async getProject(projectId: number) {
    return this.request<any>(`/projects/${projectId}`);
  }

  /**
   * Récupère les cursus de l'utilisateur
   */
  static async getUserCursus() {
    return this.request<any[]>('/me/cursus_users');
  }

  /**
   * Effectue une recherche générique
   */
  static async search<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const queryString = params
      ? '?' + new URLSearchParams(params).toString()
      : '';
    return this.request<T>(`${endpoint}${queryString}`);
  }
}
```

## Utilisation dans un composant React

```typescript
// App.tsx ou Login.tsx

import { useEffect, useState } from 'react';
import { BackendAuthService } from './services/backend-auth.service';
import { API42DirectService } from './services/api42-direct.service';

function App() {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Vérifier si on revient du callback OAuth
    const hasToken = BackendAuthService.handleCallback();
    
    if (hasToken || BackendAuthService.isAuthenticated()) {
      loadUserData();
    } else {
      setIsLoading(false);
    }
  }, []);

  const loadUserData = async () => {
    try {
      // Valider le token
      const isValid = await BackendAuthService.validateToken();
      
      if (isValid) {
        // Récupérer les infos depuis le JWT
        const userInfo = BackendAuthService.getUserInfo();
        setUser(userInfo);
        
        // Optionnel : récupérer des données depuis l'API 42
        const fullUserData = await API42DirectService.getMe();
        console.log('Full user data:', fullUserData);
      } else {
        // Token invalide, déconnecter
        await BackendAuthService.logout();
      }
    } catch (error) {
      console.error('Error loading user data:', error);
      await BackendAuthService.logout();
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = () => {
    BackendAuthService.login();
  };

  const handleLogout = async () => {
    await BackendAuthService.logout();
    setUser(null);
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return (
      <div>
        <h1>Calculator GCC</h1>
        <button onClick={handleLogin}>Login with 42</button>
      </div>
    );
  }

  return (
    <div>
      <h1>Welcome, {user.login}!</h1>
      <img src={user.image_url} alt={user.login} />
      <button onClick={handleLogout}>Logout</button>
    </div>
  );
}

export default App;
```

## Context React pour l'authentification

```typescript
// contexts/AuthContext.tsx

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { BackendAuthService } from '../services/backend-auth.service';

interface AuthContextType {
  user: any | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => Promise<void>;
  getApiToken: () => string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    // Gérer le callback OAuth
    BackendAuthService.handleCallback();

    if (BackendAuthService.isAuthenticated()) {
      const isValid = await BackendAuthService.validateToken();
      
      if (isValid) {
        const userInfo = BackendAuthService.getUserInfo();
        setUser(userInfo);
      } else {
        await BackendAuthService.logout();
      }
    }
    
    setIsLoading(false);
  };

  const login = () => {
    BackendAuthService.login();
  };

  const logout = async () => {
    await BackendAuthService.logout();
    setUser(null);
  };

  const getApiToken = () => {
    return BackendAuthService.getApiToken();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        getApiToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

## Variables d'environnement Frontend

```bash
# .env
VITE_BACKEND_URL=http://localhost:7000
```

## Notes importantes

1. **Stockage du JWT** : Le JWT est stocké dans `localStorage`. Vous pouvez utiliser `sessionStorage` pour plus de sécurité.

2. **Expiration du token** : Le JWT du backend expire après 7 jours. Le token de l'API 42 peut avoir une durée différente.

3. **Rafraîchissement** : Si nécessaire, vous pouvez utiliser le `refresh_token` pour obtenir un nouveau `api_token` de l'API 42.

4. **Sécurité** : Ne jamais exposer le JWT ou le token API dans des logs ou des URLs publiques.

5. **Appels directs** : Tous les appels à l'API 42 se font directement depuis le frontend, le backend ne sert que pour l'authentification.
