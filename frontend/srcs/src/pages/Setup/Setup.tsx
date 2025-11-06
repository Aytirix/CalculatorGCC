import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { setupService } from '../../services/setup.service';
import { Button } from '../../components/ui/button';
import { config } from '../../config/config';
import SetupInfo from './SetupInfo';
import './Setup.scss';

const Setup: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [setupToken, setSetupToken] = useState('');
  const [formData, setFormData] = useState({
    clientId: '',
    clientSecret: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isRemoteAccess, setIsRemoteAccess] = useState(false);

  // Construit l'URL du callback avec le hostname configuré
  const callbackUrl = `${config.appUrl}/api/auth/callback`;

  useEffect(() => {
    checkSetupStatus();
  }, []);

  const checkSetupStatus = async () => {
    try {
      const status = await setupService.getStatus();
      
      if (status.configured) {
        navigate('/');
        return;
      }

      const token = await setupService.getSetupToken();
      setSetupToken(token);
      setLoading(false);
    } catch (err: any) {
      // Si l'erreur indique un accès distant bloqué
      if (err.response?.data?.remoteAccessBlocked) {
        setIsRemoteAccess(true);
        setLoading(false);
        return;
      }
      
      setError('Impossible de charger la configuration. Veuillez redémarrer le serveur.');
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (!formData.clientId || !formData.clientSecret) {
        setError('Tous les champs sont requis');
        setSubmitting(false);
        return;
      }

      const response = await setupService.configure({
        setupToken,
        clientId: formData.clientId,
        clientSecret: formData.clientSecret,
      });

      if (response.success) {
        setSuccess(true);
        setTimeout(() => {
          window.location.href = '/';
        }, 3000);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'La configuration a échoué. Veuillez réessayer.');
      setSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  // Si l'accès est distant (non-localhost), afficher la page d'information
  if (isRemoteAccess) {
    return <SetupInfo />;
  }

  if (loading) {
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
        <h1>🔧 Configuration Initiale</h1>
        <p className="subtitle">Configurez vos identifiants API 42 pour démarrer</p>

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

          <div className="security-note">
            <span>🔒</span>
            <p>Vos identifiants sont stockés en toute sécurité dans le fichier .env du backend. Cette page ne sera plus accessible après la configuration.</p>
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
              {submitting ? 'Configuration en cours...' : 'Terminer la configuration'}
            </Button>
          </motion.div>
        </form>
      </motion.div>
    </div>
  );
};

export default Setup;
