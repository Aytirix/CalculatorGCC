import React, { createContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { backendAuthService, type User } from '@/services/backend-auth.service';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  getApiToken: () => string | null;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      // Gérer le callback OAuth (si on revient de la redirection)
      backendAuthService.handleCallback();

      // Vérifier si l'utilisateur est authentifié
      if (backendAuthService.isAuthenticated()) {
        // Valider le token auprès du backend
        const isValid = await backendAuthService.validateToken();

        if (isValid) {
          // Récupérer les infos utilisateur depuis le JWT
          const userInfo = backendAuthService.getUser();
          
          // Enrichir avec image.link pour compatibilité
          if (userInfo && userInfo.image_url) {
            userInfo.image = { link: userInfo.image_url };
          }
          
          setUser(userInfo);
        } else {
          // Token invalide, déconnecter
          await backendAuthService.logout();
        }
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      await backendAuthService.logout();
    } finally {
      setIsLoading(false);
    }
  };

  const login = () => {
    // Redirige vers le backend pour initier l'OAuth
    backendAuthService.login();
  };

  const logout = async () => {
    await backendAuthService.logout();
    setUser(null);
  };

  const getApiToken = () => {
    return backendAuthService.getApiToken();
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    getApiToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
