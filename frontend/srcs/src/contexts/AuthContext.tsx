import React, { createContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { backendAuthService, type User } from '@/services/backend-auth.service';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isPublic: boolean | null | undefined; // undefined = pas encore chargé, null = pas encore choisi
  setIsPublic: (value: boolean | null) => void;
  login: () => void;
  logout: () => Promise<void>;
  getApiToken: () => string | null;
  refreshAuth: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublic, setIsPublic] = useState<boolean | null | undefined>(undefined);

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      const isAuth = backendAuthService.isAuthenticated();

      if (isAuth) {
        const me = await backendAuthService.validateToken();

        if (me) {
          const userInfo = backendAuthService.getUser();
          if (userInfo) {
            userInfo.is_public = me.is_public;
            if (userInfo.image_url) {
              userInfo.image = { link: userInfo.image_url };
            }
          }
          setUser(userInfo);
          setIsPublic(me.is_public);
        } else {
          await backendAuthService.logout();
        }
      }
    } catch (error) {
      console.error('[AuthContext] Auth initialization error:', error);
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

  const refreshAuth = async () => {
    setIsLoading(true);
    await initializeAuth();
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    isPublic,
    setIsPublic,
    login,
    logout,
    getApiToken,
    refreshAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
