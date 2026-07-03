import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ChangelogEntry } from '@/data/changelog.data';
import './Changelog.scss';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: ChangelogEntry[];
  latestVersion: string;
  /** true si la dernière entrée n'a pas encore été acquittée (affiche un badge « Nouveau »). */
  highlightUnseen: boolean;
}

const ChangelogModal: React.FC<ChangelogModalProps> = ({
  isOpen,
  onClose,
  entries,
  latestVersion,
  highlightUnseen,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="changelog-overlay" onClick={onClose}>
          <motion.div
            className="changelog-content"
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 16 }}
            transition={{ duration: 0.22 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Nouveautés"
          >
            <div className="changelog-header">
              <h2>Nouveautés</h2>
              <button className="changelog-close" onClick={onClose} aria-label="Fermer">
                ✕
              </button>
            </div>

            <div className="changelog-body">
              {entries.length === 0 && (
                <p className="changelog-empty">Aucune nouveauté pour le moment.</p>
              )}
              {entries.map((entry) => (
                <section className="changelog-entry" key={entry.version}>
                  <div className="changelog-entry__head">
                    <h3>{entry.title}</h3>
                    {highlightUnseen && entry.version === latestVersion && (
                      <span className="changelog-badge">Nouveau</span>
                    )}
                  </div>
                  <span className="changelog-date">{entry.date}</span>
                  <ul className="changelog-list">
                    {entry.changes.map((change, i) => (
                      <li key={i}>{change}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            <div className="changelog-footer">
              <button className="changelog-ok" onClick={onClose}>
                J’ai compris
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ChangelogModal;
