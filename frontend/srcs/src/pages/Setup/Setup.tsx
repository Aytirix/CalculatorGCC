import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Navigate } from 'react-router-dom';
import { setupService, type Api42ConfigState } from '../../services/setup.service';
import { useAuth } from '../../contexts/useAuth';
import { Button } from '../../components/ui/button';
import { config } from '../../config/config';
import './Setup.scss';

/**
 * Reconfiguration des credentials 42 par un ADMIN DÉLÉGUÉ (login 42 inscrit par
 * l'owner dans le panneau admin). La voie de bootstrap historique — setupToken servi
 * automatiquement derrière un verrou `Host: localhost` usurpable — a été supprimée :
 * une instance vierge se configure via /admin (token console affiché au démarrage,
 * puis passkey). Tout visiteur non délégué est donc renvoyé vers cette voie-là.
 */
const Setup: React.FC = () => {
  const { user, isLoading: authLoading } = useAuth();
  const isDelegate = !!user?.is_admin;
  const [formData, setFormData] = useState({
    clientId: '',
    clientSecret: '',
    clientSecret42Next: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [current, setCurrent] = useState<Api42ConfigState | null>(null);

  // Construit l'URL du callback avec le hostname configuré
  const callbackUrl = `${config.appUrl}/api/auth/callback`;

  // Le délégué ne vient en général changer QUE le secret : on lui préremplit le Client
  // ID en place plutôt que de le lui faire retaper de mémoire, et on affiche ce qui est
  // déjà configuré. L'échec est silencieux : le formulaire reste utilisable à la main.
  useEffect(() => {
    if (authLoading || !isDelegate) return;
    setupService.getAdminConfig()
      .then((cfg) => {
        setCurrent(cfg);
        setFormData((f) => ({ ...f, clientId: f.clientId || cfg.client_id || '' }));
      })
      .catch(() => { /* préremplissage best-effort */ });
  }, [authLoading, isDelegate]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (!formData.clientId || !formData.clientSecret) {
        setError('Le Client ID et le Client Secret sont requis');
        setSubmitting(false);
        return;
      }

      const next42 = formData.clientSecret42Next.trim();
      const response = await setupService.configureAsAdmin({
        clientId: formData.clientId,
        clientSecret: formData.clientSecret,
        ...(next42 ? { clientSecret42Next: next42 } : {}),
      });

      if (response.success) {
        setSuccess(true);
        setTimeout(() => {
          window.location.href = '/';
        }, 3000);
      }
    } catch (err: any) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        // JWT expiré / login retiré des délégués → il faut se reconnecter, pas « réessayer ».
        setError('Session administrateur expirée ou droits insuffisants. Reconnectez-vous, puis réessayez.');
      } else {
        setError(err.response?.data?.message || err.response?.data?.error || 'La configuration a échoué. Veuillez réessayer.');
      }
      setSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  if (authLoading) {
    return (
      <div className="setup-page">
        <motion.div
          className="setup-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="loading-spinner"></div>
          <p>Chargement de la configuration...</p>
        </motion.div>
      </div>
    );
  }

  // Seul un délégué authentifié a quelque chose à faire ici : tout le reste (bootstrap
  // initial, owner, visiteur) relève de l'authentification admin autonome.
  if (!isDelegate) {
    return <Navigate to="/admin/login" replace />;
  }

  if (success) {
    return (
      <div className="setup-page">
        <motion.div
          className="setup-card success"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="success-icon">✓</div>
          <h2>Configuration réussie !</h2>
          <p>Redirection en cours...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="setup-page">
      <motion.div
        className="setup-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1>🔧 Reconfiguration</h1>
        <p className="subtitle">Mettez à jour vos identifiants API 42</p>

        {current && (
          <div className="current-config">
            <span>Client ID : <code>{current.client_id || '—'}</code></span>
            <span>Secret courant : {current.current_secret_set ? '✓' : '✗'}</span>
            <span>Next Secret : {current.next_secret_set ? '✓' : '— (à préparer)'}</span>
            {current.credentials_invalid && (
              <span className="warn">⚠️ Credentials invalides — mise à jour requise</span>
            )}
          </div>
        )}

        {error && (
          <div className="error-message">
            <span>⚠️</span>
            <p>{error}</p>
          </div>
        )}

        <div className="info-box">
          <h3>📝 Comment obtenir vos identifiants :</h3>
          <ol>
            <li>Rendez-vous sur <a href="https://profile.intra.42.fr/oauth/applications" target="_blank" rel="noopener noreferrer">42 OAuth Applications</a></li>
            <li>Créez une nouvelle application</li>
            <li>Définissez le Redirect URI : <code>{callbackUrl}</code></li>
            <li>Copiez votre Client ID et Client Secret</li>
          </ol>
        </div>

        <form onSubmit={handleSubmit} className="setup-form">
          <div className="form-group">
            <label htmlFor="clientId">Client ID *</label>
            <input
              id="clientId"
              name="clientId"
              type="text"
              value={formData.clientId}
              onChange={handleInputChange}
              placeholder="Votre Client ID 42"
              required
              disabled={submitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="clientSecret">Client Secret *</label>
            <input
              id="clientSecret"
              name="clientSecret"
              type="password"
              value={formData.clientSecret}
              onChange={handleInputChange}
              placeholder="Votre Client Secret 42"
              required
              disabled={submitting}
            />
          </div>

          <div className="form-group">
            <label htmlFor="clientSecret42Next">
              Next Secret 42 <span className="optional">(optionnel — rotation automatique)</span>
            </label>
            <input
              id="clientSecret42Next"
              name="clientSecret42Next"
              type="password"
              value={formData.clientSecret42Next}
              onChange={handleInputChange}
              placeholder="Le « Next secret » affiché par l'intra 42"
              disabled={submitting}
            />
            <p className="field-hint">
              Sur l'intra 42, votre application affiche un <strong>« Next secret »</strong> généré à l'avance.
              Renseignez-le ici : dès que le secret courant cessera de fonctionner, il prendra automatiquement le relais — sans coupure, sans date à gérer.
            </p>
          </div>

          <div className="security-note">
            <span>🔒</span>
            <p>
              Vos identifiants sont chiffrés en base de données. Reconfiguration réservée
              aux administrateurs délégués authentifiés.
            </p>
          </div>

          <motion.div
            whileHover={{ scale: submitting ? 1 : 1.05 }}
            whileTap={{ scale: submitting ? 1 : 0.95 }}
          >
            <Button
              type="submit"
              size="lg"
              className="submit-button"
              disabled={submitting}
            >
              {submitting ? 'Configuration en cours...' : 'Mettre à jour les identifiants'}
            </Button>
          </motion.div>
        </form>
      </motion.div>
    </div>
  );
};

export default Setup;
