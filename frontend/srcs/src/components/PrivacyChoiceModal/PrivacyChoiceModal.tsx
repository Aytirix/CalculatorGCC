import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { simulationService } from '@/services/simulation.service';
import './PrivacyChoiceModal.scss';

interface PrivacyChoiceModalProps {
  onResolved: (isPublic: boolean) => void;
}

const PrivacyChoiceModal: React.FC<PrivacyChoiceModalProps> = ({ onResolved }) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
    };
    const scrollY = window.scrollY;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.position = prev.bodyPosition;
      body.style.top = prev.bodyTop;
      body.style.width = prev.bodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);

  const choose = async (value: boolean) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await simulationService.updatePrivacy(value);
      onResolved(result.isPublic);
    } catch {
      setError('Impossible d’enregistrer votre choix. Réessayez.');
      setSubmitting(false);
    }
  };

  return (
    <div className="privacy-choice-overlay" role="dialog" aria-modal="true" aria-labelledby="privacy-choice-title">
      <motion.div
        className="privacy-choice-modal"
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <header className="privacy-choice-header">
          <h2 id="privacy-choice-title">Visibilité de votre profil</h2>
          <p>
            Avant de continuer, choisissez si votre profil est <strong>public</strong> ou{' '}
            <strong>privé</strong>. Tant que ce choix n'est pas fait, votre profil est traité
            comme privé. Vous pourrez modifier ce réglage à tout moment dans les paramètres.
          </p>
        </header>

        <div className="privacy-choice-options">
          <button
            type="button"
            className="privacy-choice-option"
            onClick={() => choose(true)}
            disabled={submitting}
          >
            <span className="privacy-choice-icon" aria-hidden="true">🌐</span>
            <strong>Profil public</strong>
            <span>
              Visible par tous les utilisateurs connectés. Recherchable et consultable en
              lecture seule.
            </span>
          </button>

          <button
            type="button"
            className="privacy-choice-option"
            onClick={() => choose(false)}
            disabled={submitting}
          >
            <span className="privacy-choice-icon" aria-hidden="true">🔒</span>
            <strong>Profil privé</strong>
            <span>
              Apparaît dans la recherche mais affiché avec un cadenas. Personne ne peut
              consulter votre simulation.
            </span>
          </button>
        </div>

        {error && <p className="privacy-choice-error">{error}</p>}
        {submitting && <p className="privacy-choice-loading">Enregistrement…</p>}
      </motion.div>
    </div>
  );
};

export default PrivacyChoiceModal;
