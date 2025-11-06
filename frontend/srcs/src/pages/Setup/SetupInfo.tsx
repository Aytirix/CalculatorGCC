import React from 'react';
import { motion } from 'framer-motion';
import { config } from '../../config/config';
import { Button } from '../../components/ui/button';
import './Setup.scss';

/**
 * Page d'information affichée quand l'utilisateur tente d'accéder à la configuration
 * depuis une connexion distante (non-localhost)
 */
const SetupInfo: React.FC = () => {
  const currentUrl = window.location.href;
  const localhostUrl = currentUrl.replace(window.location.hostname, 'localhost');
  const callbackUrl = `${config.appUrl}/api/auth/callback`;

  return (
    <div className="setup-page">
      <motion.div
        className="setup-info-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header avec icône */}
        <div className="info-header">
          <div className="lock-icon">🔒</div>
          <h1>Configuration Requise</h1>
          <p className="subtitle">
            L'API 42 n'est pas encore configurée pour cette application
          </p>
        </div>

        {/* Section principale - Pourquoi */}
        <div className="warning-section">
          <div className="warning-icon">⚠️</div>
          <div className="warning-content">
            <h3>Accès Restreint à Localhost</h3>
            <p>
              Pour des raisons de <strong>sécurité</strong>, la configuration initiale 
              n'est accessible que depuis <code className="inline-code">localhost</code>.
            </p>
          </div>
        </div>

        {/* Instructions claires */}
        <div className="instructions-section">
          <h3>🚀 Comment configurer l'application</h3>
          
          <div className="step">
            <div className="step-number">1</div>
            <div className="step-content">
              <h4>Accédez via localhost</h4>
              <p>Utilisez cette URL depuis le serveur :</p>
              <div className="url-box">
                <code>{localhostUrl}</code>
                <button 
                  className="copy-btn"
                  onClick={() => navigator.clipboard.writeText(localhostUrl)}
                  title="Copier l'URL"
                >
                  📋
                </button>
              </div>
            </div>
          </div>

          <div className="step">
            <div className="step-number">2</div>
            <div className="step-content">
              <h4>Créez une application 42 OAuth</h4>
              <p>
                Rendez-vous sur{' '}
                <a 
                  href="https://profile.intra.42.fr/oauth/applications" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="external-link"
                >
                  42 OAuth Applications ↗
                </a>
              </p>
            </div>
          </div>

          <div className="step">
            <div className="step-number">3</div>
            <div className="step-content">
              <h4>Configurez le Redirect URI</h4>
              <p>Utilisez exactement cette URL :</p>
              <div className="url-box">
                <code>{callbackUrl}</code>
                <button 
                  className="copy-btn"
                  onClick={() => navigator.clipboard.writeText(callbackUrl)}
                  title="Copier l'URL"
                >
                  📋
                </button>
              </div>
            </div>
          </div>

          <div className="step">
            <div className="step-number">4</div>
            <div className="step-content">
              <h4>Entrez vos identifiants</h4>
              <p>Copiez votre <strong>Client ID</strong> et <strong>Client Secret</strong> dans le formulaire</p>
            </div>
          </div>
        </div>

        {/* Section alternative */}
        <div className="alternative-section">
          <h4>💡 Configuration manuelle</h4>
          <p>
            Si vous êtes administrateur système et ne pouvez pas accéder à localhost, 
            configurez manuellement ces variables dans le fichier <code className="inline-code">.env</code> du backend :
          </p>
          <ul className="env-list">
            <li><code>API42_CLIENT_ID</code></li>
            <li><code>API42_CLIENT_SECRET</code></li>
          </ul>
          <p className="small-text">
            Redémarrez ensuite l'application pour appliquer les changements.
          </p>
        </div>

        {/* Bouton d'action */}
        <div className="action-section">
          <motion.a
            href={localhostUrl}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button size="lg" className="primary-action">
              Ouvrir en Localhost
            </Button>
          </motion.a>
        </div>
      </motion.div>
    </div>
  );
};

export default SetupInfo;
