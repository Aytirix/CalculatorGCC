import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { backendAuthService } from '@/services/backend-auth.service';
import './Callback.scss';

/**
 * Page de callback OAuth
 * Traite le token JWT reçu du backend et redirige vers le dashboard
 */
const Callback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const processCallback = async () => {
      console.log('[Callback] Processing OAuth callback');
      
      // Récupérer le token et l'erreur depuis l'URL
      const token = searchParams.get('token');
      const urlError = searchParams.get('error');

      console.log('[Callback] URL params:', { hasToken: !!token, hasError: !!urlError });

      if (urlError) {
        console.error('[Callback] Authentication error:', urlError);
        setError('Erreur lors de l\'authentification');
        setTimeout(() => navigate('/', { replace: true }), 3000);
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
        const isValid = await backendAuthService.validateToken();

        if (isValid) {
          console.log('[Callback] Token valid, redirecting to dashboard');
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
            <p className="redirect-info">Redirection vers la page de connexion...</p>
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
