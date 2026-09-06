import React, { createContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  backendAuthService,
  sessionMustBeCleared,
  type MeResponse,
  type SessionCheck,
  type User,
} from '@/services/backend-auth.service';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /**
   * Renseigné quand un jeton est présent mais n'a PAS pu être vérifié (serveur
   * injoignable, quota dépassé…). La session est conservée : l'interface doit
   * le dire et proposer de réessayer, pas renvoyer vers l'écran de connexion
   * comme si l'utilisateur s'était déconnecté.
   */
  sessionIssue: Exclude<SessionCheck, { status: 'valid' }> | null;
  isPublic: boolean | null | undefined; // undefined = pas encore chargé, null = pas encore choisi
  setIsPublic: (value: boolean | null) => void;
  login: () => void;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  /** Ouvre la session depuis une réponse /auth/me déjà en main. */
  adoptSession: (me: MeResponse) => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPublic, setIsPublic] = useState<boolean | null | undefined>(undefined);
  const [sessionIssue, setSessionIssue] = useState<
    Exclude<SessionCheck, { status: 'valid' }> | null
  >(null);

  useEffect(() => {
    initializeAuth();
  }, []);

  /**
   * Installe la session à partir d'une réponse /auth/me déjà obtenue.
   *
   * Référence STABLE (`useCallback`) : `adoptSession` figure dans les
   * dépendances de l'effet du callback OAuth. Une référence recréée à chaque
   * rendu y relancerait l'effet en boucle, puisqu'il pose lui-même des états.
   */
  const applyMe = useCallback((me: MeResponse) => {
    const userInfo = backendAuthService.getUser();
    if (userInfo) {
      userInfo.is_public = me.is_public;
      userInfo.is_admin = me.is_admin;
      userInfo.credentials_invalid = me.credentials_invalid;
      userInfo.next_secret_missing = me.next_secret_missing;
      if (userInfo.image_url) {
        userInfo.image = { link: userInfo.image_url };
      }
    }
    setUser(userInfo);
    setIsPublic(me.is_public);
    setSessionIssue(null);
    setIsLoading(false);
  }, []);

  /**
   * Ouvre la session avec une réponse /auth/me que l'appelant vient d'obtenir.
   *
   * Évite le second appel que faisait le callback OAuth juste après avoir
   * validé le jeton : cette requête en trop pouvait échouer (quota, réseau) et
   * faire rater une connexion pourtant déjà réussie.
   */
  const adoptSession = applyMe;

  const initializeAuth = async () => {
    try {
      const isAuth = backendAuthService.isAuthenticated();

      if (isAuth) {
        const check = await backendAuthService.validateToken();

        if (check.status === 'valid') {
          applyMe(check.me);
        } else if (sessionMustBeCleared(check)) {
          // Jeton refusé, ou serveur à reconfigurer : dans les deux cas il faut
          // l'effacer. Le garder sur un « not-configured » bloquerait à jamais
          // la redirection vers l'assistant de configuration, puisque le reste
          // de l'application déduit « jeton présent donc instance configurée ».
          await backendAuthService.logout();
          setSessionIssue(null);
        } else {
          // Serveur injoignable ou saturé : on GARDE le jeton — l'effacer
          // déconnectait au moindre hoquet réseau. On expose la situation pour
          // que l'interface le dise, au lieu d'afficher un écran de connexion
          // muet impossible à distinguer d'une vraie déconnexion.
          console.warn('[AuthContext] Session non vérifiable :', check.status);
          setSessionIssue(check);
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

  const refreshAuth = async () => {
    setIsLoading(true);
    await initializeAuth();
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    sessionIssue,
    isPublic,
    setIsPublic,
    login,
    logout,
    refreshAuth,
    adoptSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
