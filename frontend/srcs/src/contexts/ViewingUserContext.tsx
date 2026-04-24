import React, { createContext, useState, useCallback, useEffect } from 'react';
import { setViewUserId } from '@/services/backend-api42.service';
import { setSimulationViewUserId } from '@/services/simulation.service';

export interface ViewingUser {
  userId42: number;
  login: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
}

interface ViewingUserContextValue {
  viewingUser: ViewingUser | null;
  setViewingUser: (user: ViewingUser | null) => void;
  clearViewingUser: () => void;
  isViewingOther: boolean;
}

export const ViewingUserContext = createContext<ViewingUserContextValue>({
  viewingUser: null,
  setViewingUser: () => {},
  clearViewingUser: () => {},
  isViewingOther: false,
});

export const ViewingUserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [viewingUser, setViewingUserState] = useState<ViewingUser | null>(null);

  const setViewingUser = useCallback((user: ViewingUser | null) => {
    setViewingUserState(user);
    setViewUserId(user ? user.userId42 : null);
    setSimulationViewUserId(user ? user.userId42 : null);
  }, []);

  const clearViewingUser = useCallback(() => {
    setViewingUserState(null);
    setViewUserId(null);
    setSimulationViewUserId(null);
  }, []);

  // Nettoyer au démontage
  useEffect(() => {
    return () => {
      setViewUserId(null);
      setSimulationViewUserId(null);
    };
  }, []);

  return (
    <ViewingUserContext.Provider value={{
      viewingUser,
      setViewingUser,
      clearViewingUser,
      isViewingOther: viewingUser !== null,
    }}>
      {children}
    </ViewingUserContext.Provider>
  );
};
