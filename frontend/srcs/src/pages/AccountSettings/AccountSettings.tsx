import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/useAuth';
import { simulationService } from '@/services/simulation.service';
import Header from '@/components/Header/Header';
import './AccountSettings.scss';

const AccountSettings: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isPublic, setIsPublic] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    loadPrivacyStatus();
  }, []);

  const loadPrivacyStatus = async () => {
    try {
      const { isPublic: value } = await simulationService.getMyPrivacy();
      setIsPublic(value);
    } catch {
      setIsPublic(null);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (value: boolean) => {
    if (saving || isPublic === value) return;
    setSaving(true);
    setFeedback(null);
    try {
      const result = await simulationService.updatePrivacy(value);
      setIsPublic(result.isPublic);
      setFeedback({ type: 'success', msg: 'Statut mis à jour avec succès.' });
    } catch {
      setFeedback({ type: 'error', msg: 'Erreur lors de la mise à jour. Réessayez.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="account-settings-page">
      <Header />
      <main className="account-settings-main">
        <motion.div
          className="settings-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="settings-header">
            <button className="back-button" onClick={() => navigate(-1)}>← Retour</button>
            <h1>Paramètres du compte</h1>
          </div>

          {user && (
            <div className="settings-user-info">
              <img
                src={user.image?.link || '/default-avatar.png'}
                alt={user.login}
                className="settings-avatar"
              />
              <div>
                <p className="settings-login">{user.login}</p>
                <p className="settings-email">{user.email}</p>
              </div>
            </div>
          )}

          <section className="settings-section" data-tour="account-settings-privacy">
            <h2>Visibilité du profil</h2>

            {!loading && isPublic === null && (
              <p className="settings-privacy-undefined">
                Aucun choix enregistré — votre profil est traité comme <strong>privé</strong> tant
                que vous n'avez pas choisi.
              </p>
            )}

            {loading ? (
              <div className="settings-loading">Chargement…</div>
            ) : (
              <div className="privacy-cards">
                <div
                  className={`privacy-option ${isPublic === true ? 'privacy-option--active' : ''} ${saving ? 'privacy-option--disabled' : ''}`}
                  onClick={() => handleToggle(true)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleToggle(true)}
                >
                  <div className="privacy-option-header">
                    <span className="privacy-icon">🌐</span>
                    <strong>Profil public</strong>
                    {isPublic === true && <span className="privacy-badge">Actif</span>}
                  </div>
                  <p>
                    Votre profil est visible par tous les utilisateurs connectés.
                    N'importe qui peut rechercher votre login, prénom ou nom et
                    consulter votre simulation en lecture seule.
                  </p>
                </div>

                <div
                  className={`privacy-option ${isPublic === false ? 'privacy-option--active' : ''} ${saving ? 'privacy-option--disabled' : ''}`}
                  onClick={() => handleToggle(false)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleToggle(false)}
                >
                  <div className="privacy-option-header">
                    <span className="privacy-icon">🔒</span>
                    <strong>Profil privé</strong>
                    {isPublic === false && <span className="privacy-badge">Actif</span>}
                  </div>
                  <p>
                    Votre profil apparaît dans les résultats de recherche mais ne peut
                    pas être consulté. Les autres utilisateurs verront votre login avec
                    un cadenas et ne pourront pas cliquer sur votre profil.
                  </p>
                </div>
              </div>
            )}

            {feedback && (
              <p className={`settings-feedback settings-feedback--${feedback.type}`}>
                {feedback.msg}
              </p>
            )}
          </section>
        </motion.div>
      </main>
    </div>
  );
};

export default AccountSettings;
