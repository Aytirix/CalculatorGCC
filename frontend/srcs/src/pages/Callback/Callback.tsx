import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { backendAuthService } from '@/services/backend-auth.service';
import { useAuth } from '@/contexts/useAuth';
import { Button } from '@/components/ui/button';
import './Callback.scss';

/**
 * Traduit la raison technique renvoyée par 42 en message lisible.
 */
const messageForReason = (reason: string | null): string => {
  switch (reason) {
    case 'invalid_client':
    case 'unauthorized_client':
      return "La clé d'API 42 a expiré ou n'est plus valide. Contactez l'administrateur du site.";
    case 'access_denied':
      return "Vous avez refusé l'autorisation. Réessayez pour vous connecter.";
    case 'invalid_grant':
      return "Le lien d'authentification a expiré. Veuillez réessayer.";
    default:
      return "L'authentification 42 a échoué. Veuillez réessayer.";
  }
};

/**
 * Page de callback OAuth
 * Traite le token JWT reçu du backend et redirige vers le dashboard
 */
const Callback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  // Erreur d'auth 42 explicite : on laisse l'utilisateur lire et réessayer
  // au lieu de le renvoyer en silence vers Login (effet de "boucle").
  const [showRetry, setShowRetry] = useState(false);
  const { refreshAuth, login } = useAuth();

  useEffect(() => {
    const processCallback = async () => {
      console.log('[Callback] Processing OAuth callback');

      // Récupérer le token et l'erreur depuis l'URL
      const token = searchParams.get('token');
      const urlError = searchParams.get('error');
      const reason = searchParams.get('reason');

      console.log('[Callback] URL params:', { hasToken: !!token, hasError: !!urlError, reason });

      if (urlError) {
        console.error('[Callback] Authentication error:', urlError, 'reason:', reason);
        setError(messageForReason(reason));
        setShowRetry(true);
        return;
      }

      if (!token) {
        console.error('[Callback] No token in URL');
        setError('Token manquant');
        setTimeout(() => navigate('/', { replace: true }), 3000);
        return;
      }

      try {
        // Sauvegarder le token
        console.log('[Callback] Saving token');
        backendAuthService.saveToken(token);

        // Valider le token auprès du backend
        console.log('[Callback] Validating token with backend');
        const me = await backendAuthService.validateToken();

        if (me) {
          console.log('[Callback] Token valid, refreshing auth context');
          // Rafraîchir le contexte d'authentification et attendre qu'il soit prêt
          await refreshAuth();
          
          console.log('[Callback] Auth refreshed, redirecting to dashboard');
          // Rediriger vers le dashboard
          navigate('/dashboard', { replace: true });
        } else {
          console.error('[Callback] Token validation failed');
          setError('Token invalide');
          backendAuthService.logout();
          setTimeout(() => navigate('/', { replace: true }), 3000);
        }
      } catch (err) {
        console.error('[Callback] Error processing callback:', err);
        setError('Erreur lors du traitement de l\'authentification');
        setTimeout(() => navigate('/', { replace: true }), 3000);
      }
    };

    processCallback();
  }, [navigate, searchParams]);

  return (
    <div className="callback-page">
      <motion.div
        className="callback-card"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {error ? (
          <>
            <div className="error-icon">❌</div>
            <h2>Erreur</h2>
            <p>{error}</p>
            {showRetry ? (
              <div className="callback-actions">
                <Button onClick={login} size="lg">
                  Réessayer la connexion
                </Button>
              </div>
            ) : (
              <p className="redirect-info">Redirection vers la page de connexion...</p>
            )}
          </>
        ) : (
          <>
            <div className="spinner" />
            <h2>Authentification en cours...</h2>
            <p>Veuillez patienter</p>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default Callback;
