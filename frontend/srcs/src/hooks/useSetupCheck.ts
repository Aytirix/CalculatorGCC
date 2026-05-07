import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { setupService } from '../services/setup.service';
import { backendAuthService } from '../services/backend-auth.service';

/**
 * Hook qui vérifie si l'application est configurée.
 *
 * Règle: si l'utilisateur possède un JWT, l'application est forcément déjà
 * configurée (sinon le backend refuserait toute requête authentifiée). Dans
 * ce cas on ne touche jamais /setup/status. La route n'est interrogée qu'une
 * seule fois, lors de la toute première visite anonyme.
 */
export function useSetupCheck() {
  const hasToken = backendAuthService.isAuthenticated();
  const [isConfigured, setIsConfigured] = useState<boolean | null>(hasToken ? true : null);
  const [isChecking, setIsChecking] = useState(!hasToken);
  const location = useLocation();

  useEffect(() => {
    checkSetupStatus();
  }, []);

  const checkSetupStatus = async () => {
    // Token présent → app configurée par construction, aucune requête nécessaire
    if (backendAuthService.isAuthenticated()) {
      setIsConfigured(true);
      setIsChecking(false);
      return;
    }

    // Sur la page /setup, on n'a pas besoin de vérifier
    if (location.pathname === '/setup') {
      setIsConfigured(null);
      setIsChecking(false);
      return;
    }

    try {
      const status = await setupService.getStatus();
      setIsConfigured(status.configured);
    } catch (error: any) {
      if (error.response?.data?.setupRequired) {
        setIsConfigured(false);
      } else {
        setIsConfigured(false);
      }
    } finally {
      setIsChecking(false);
    }
  };

  return { isConfigured, isChecking, checkSetupStatus };
}
