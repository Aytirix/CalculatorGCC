import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { setupService } from '../services/setup.service';

/**
 * Hook qui vérifie si l'application est configurée
 * Redirige vers /setup si la configuration n'est pas terminée
 */
export function useSetupCheck() {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const location = useLocation();

  useEffect(() => {
    checkSetupStatus();
  }, []);

  const checkSetupStatus = async () => {
    // Ne vérifie pas si on est déjà sur la page de setup
    if (location.pathname === '/setup') {
      setIsConfigured(null);
      setIsChecking(false);
      return;
    }

    try {
      const status = await setupService.getStatus();
      setIsConfigured(status.configured);
    } catch (error: any) {
      // Si l'erreur indique que l'application n'est pas configurée
      if (error.response?.data?.setupRequired) {
        setIsConfigured(false);
      } else {
        // Autre erreur, on considère comme non configuré par sécurité
        setIsConfigured(false);
      }
    } finally {
      setIsChecking(false);
    }
  };

  return { isConfigured, isChecking, checkSetupStatus };
}
