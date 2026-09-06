import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  backendAuthService,
  sessionCheckMessage,
  sessionMustBeCleared,
  sessionRetryIsWorthIt,
} from '@/services/backend-auth.service';
import { useAuth } from '@/contexts/useAuth';
import { Button } from '@/components/ui/button';
import './Callback.scss';

const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

/** Une erreur de credentials 42 (clé invalide) est réparable via le setup en local. */
const isCredentialError = (reason: string | null): boolean =>
  reason === 'invalid_client' || reason === 'unauthorized_client';

/**
 * Traduit la raison technique renvoyée par 42 en message lisible.
 */
const messageForReason = (reason: string | null): string => {
  switch (reason) {
    case 'invalid_client':
    case 'unauthorized_client':
      // En local on redirige vers /setup avant d'arriver ici (voir useEffect).
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
  // « login » repart de l'intra 42 ; « revalidate » se contente de retenter la
  // vérification, quand le jeton reçu est toujours valable.
  const [retryMode, setRetryMode] = useState<'login' | 'revalidate'>('login');
  // Incrémenté par le bouton « Réessayer » : relance l'effet sans recharger la
  // page — un rechargement réinscrivait le JWT complet dans les journaux du
  // serveur et le laissait dans la barre d'adresse.
  const [attempt, setAttempt] = useState(0);
  // Vrai seulement quand un retour automatique vers l'accueil est réellement
  // armé : l'annoncer sans l'avoir programmé laissait l'utilisateur attendre
  // une redirection qui ne venait jamais.
  const [autoRedirect, setAutoRedirect] = useState(false);
  const { adoptSession, login } = useAuth();

  useEffect(() => {
    // Les redirections différées doivent mourir avec le composant, sinon elles
    // happent l'utilisateur qui a navigué ailleurs entre-temps.
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;

    const processCallback = async () => {
      console.log('[Callback] Processing OAuth callback');

      // Récupérer le token et l'erreur depuis l'URL. Au deuxième essai, l'URL a
      // déjà été nettoyée : on reprend alors le jeton mis de côté, sinon un
      // « Token manquant » s'afficherait alors que la session est bien là.
      const token = searchParams.get('token') ?? backendAuthService.getToken();
      const urlError = searchParams.get('error');
      const reason = searchParams.get('reason');

      console.log('[Callback] URL params:', { hasToken: !!token, hasError: !!urlError, reason });

      if (urlError) {
        console.error('[Callback] Authentication error:', urlError, 'reason:', reason);
        // En local, une clé API 42 invalide se répare via le setup : on y redirige
        // automatiquement au lieu d'afficher une impasse.
        if (isLocalhost && isCredentialError(reason)) {
          console.log('[Callback] Clé 42 invalide en local → redirection vers /setup');
          navigate('/setup', { replace: true });
          return;
        }
        setError(messageForReason(reason));
        setShowRetry(true);
        return;
      }

      if (!token) {
        console.error('[Callback] No token in URL');
        setError('Token manquant');
        setAutoRedirect(true);
        redirectTimer = setTimeout(() => navigate('/', { replace: true }), 3000);
        return;
      }

      try {
        // Sauvegarder le token
        console.log('[Callback] Saving token');
        backendAuthService.saveToken(token);

        // Le jeton est en sécurité : on le retire de la barre d'adresse. Il y
        // reste sinon indéfiniment — visible, copiable, et déjà inscrit dans
        // l'historique et les journaux du serveur.
        window.history.replaceState(null, '', window.location.pathname);

        // Valider le token auprès du backend
        console.log('[Callback] Validating token with backend');
        const check = await backendAuthService.validateToken();

        if (check.status === 'valid') {
          console.log('[Callback] Token valid, ouverture de la session');
          // On installe la session avec la réponse qu'on vient d'obtenir, au
          // lieu de redemander /auth/me : cet appel en double pouvait échouer
          // (quota, réseau) et faire rater une connexion déjà réussie.
          adoptSession(check.me);

          console.log('[Callback] Session ouverte, redirection vers le dashboard');
          navigate('/dashboard', { replace: true });
        } else {
          console.error('[Callback] Session non validée :', check.status);
          setError(sessionCheckMessage(check));

          // Une panne serveur n'invalide pas la session : on n'efface le jeton
          // que si le serveur l'a réellement refusé, ou s'il réclame son
          // assistant de configuration.
          if (sessionMustBeCleared(check)) {
            await backendAuthService.logout();
          }

          // On ne propose « réessayer » que quand cela peut aboutir. Sur une
          // cause durable (jeton refusé, serveur mal configuré), le bouton ne
          // ferait que rejouer la même erreur : seul le retour à l'accueil a du
          // sens, et sans redirection automatique, pour laisser lire le message.
          setRetryMode('revalidate');
          setShowRetry(sessionRetryIsWorthIt(check));
        }
      } catch (err) {
        console.error('[Callback] Error processing callback:', err);
        setError('Erreur lors du traitement de l\'authentification');
        setAutoRedirect(true);
        redirectTimer = setTimeout(() => navigate('/', { replace: true }), 3000);
      }
    };

    processCallback();
    return () => clearTimeout(redirectTimer);
  }, [navigate, searchParams, attempt, adoptSession]);

  return (
    <div className="callback-page">
      <motion.div
        className="callback-card"
        role="status"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {error ? (
          <>
            <div className="error-icon" aria-hidden="true">❌</div>
            <h2>Erreur</h2>
            <p>{error}</p>
            {/* Une porte de sortie est toujours offerte : sans elle, une erreur
                durable laissait l'utilisateur bloqué sur cet écran, à cliquer
                un bouton qui rejouait indéfiniment la même panne. */}
            <div className="callback-actions">
              {showRetry && (
                <Button
                  onClick={
                    retryMode === 'revalidate' ? () => setAttempt((n) => n + 1) : login
                  }
                  size="lg"
                  autoFocus
                >
                  {retryMode === 'revalidate' ? 'Vérifier à nouveau' : 'Réessayer la connexion'}
                </Button>
              )}
              {!autoRedirect && (
                <Button variant="outline" size="lg" onClick={() => navigate('/', { replace: true })}>
                  Retour à l'accueil
                </Button>
              )}
            </div>
            {autoRedirect && (
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
