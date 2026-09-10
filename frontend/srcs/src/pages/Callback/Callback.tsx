import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  backendAuthService,
  sessionCheckMessage,
  sessionMustBeCleared,
  sessionRetryIsWorthIt,
} from '@/services/backend-auth.service';
import { adminService, type AdminStatus } from '@/services/admin.service';
import { useAuth } from '@/contexts/useAuth';
import { Button } from '@/components/ui/button';
import './Callback.scss';

/** Clé d'application 42 invalide : le site entier est hors service, pas cette session. */
const isCredentialError = (reason: string | null): boolean =>
  reason === 'invalid_client' || reason === 'unauthorized_client';

/**
 * Traduit la raison technique renvoyée par 42 en message lisible.
 */
const messageForReason = (reason: string | null): string => {
  switch (reason) {
    case 'invalid_client':
    case 'unauthorized_client':
      return "La clé d'API 42 a expiré ou n'est plus valide.";
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
  /** La clé d'application 42 est morte : écran dédié, pas un simple message d'erreur. */
  const [credentialFailure, setCredentialFailure] = useState(false);
  /** Délégués habilités à remplacer les identifiants 42. Vide = personne de déclaré. */
  const [contacts, setContacts] = useState<string[]>([]);
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
        // Clé d'application 42 morte : cas à part. Réessayer ne peut pas marcher —
        // c'est la configuration du site qui est en cause, pas cette tentative — et
        // l'utilisateur doit savoir à qui s'adresser. On affiche donc une explication
        // dédiée plutôt qu'un « Erreur » suivi d'un bouton qui rejoue la panne.
        if (isCredentialError(reason)) {
          setCredentialFailure(true);
          setError(messageForReason(reason));
          adminService.getStatus()
            .then((s: AdminStatus) => setContacts(s.contacts ?? []))
            // Silencieux : l'explication doit s'afficher même si la liste est
            // injoignable. C'est un complément, pas le message.
            .catch(() => {});
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

  if (credentialFailure) {
    return (
      <div className="auth-page">
        <div className="auth-aurora" aria-hidden="true" />
        <motion.main
          className="service-down"
          role="alert"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="service-down__header">
            <span className="service-down__icon" aria-hidden="true">🔑</span>
            <div>
              <span className="auth-badge">Service indisponible</span>
              <h1 className="auth-title service-down__title">Connexion 42 impossible</h1>
            </div>
          </div>

          <p className="service-down__lead">
            La clé d'application&nbsp;42 de ce site a expiré ou a été révoquée.
          </p>

          {/* Dit explicitement que ce n'est pas la faute du visiteur : sans ça, on
              croit à un problème de compte et on réessaie en boucle. */}
          <p className="service-down__reassure">
            Ce n'est pas un problème avec votre compte&nbsp;: tant que la clé n'est pas
            remplacée, <strong>personne ne peut se connecter</strong>.
          </p>

          <div className="service-down__fix">
            <h2>Ce qu'il faut faire</h2>
            <p>
              Un administrateur doit renseigner de nouveaux identifiants&nbsp;42 dans le
              panneau d'administration.
            </p>
            {contacts.length > 0 && (
              <>
                <p className="service-down__contacts-label">Personnes habilitées&nbsp;:</p>
                <ul className="service-down__contacts">
                  {contacts.map((login) => (
                    <li key={login}>{login}</li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="service-down__actions">
            <button type="button" className="auth-cta" onClick={() => navigate('/admin/login')} autoFocus>
              Accès au panneau admin
            </button>
            <button
              type="button"
              className="service-down__link"
              onClick={() => navigate('/', { replace: true })}
            >
              Retour à l'accueil
            </button>
          </div>
        </motion.main>
      </div>
    );
  }

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
