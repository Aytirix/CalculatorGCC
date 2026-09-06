import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { KIND_LABELS, type ChangeKind, type ChangelogEntry } from '@/data/changelog.data';
import './Changelog.scss';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: ChangelogEntry[];
  latestVersion: string;
  /** true si la dernière entrée n'a pas encore été acquittée (affiche un badge « Nouveau »). */
  highlightUnseen: boolean;
}

/** Ordre d'affichage : ce qui est nouveau d'abord, les correctifs en dernier. */
const KIND_ORDER: ChangeKind[] = ['new', 'improved', 'fixed'];

/**
 * Les nouveautés, présentées comme un vrai journal de version.
 *
 * Une note de mise à jour a deux lecteurs : celui qui veut savoir en trois
 * secondes s'il s'est passé quelque chose d'intéressant, et celui qui veut le
 * détail. D'où le regroupement par nature de changement, le repli des versions
 * anciennes, et un compteur qui donne l'ampleur au premier coup d'œil.
 */
const ChangelogModal: React.FC<ChangelogModalProps> = ({
  isOpen,
  onClose,
  entries,
  latestVersion,
  highlightUnseen,
}) => {
  // Seule la version la plus récente est dépliée : les précédentes restent
  // accessibles sans noyer ce qui vient de sortir.
  const [expanded, setExpanded] = useState<string | null>(latestVersion);

  // Le composant reste monté en permanence : sans cette remise à zéro, replier
  // la dernière version la laissait repliée à toutes les ouvertures suivantes.
  useEffect(() => {
    if (isOpen) setExpanded(latestVersion);
  }, [isOpen, latestVersion]);

  // Échap ferme, comme les autres fenêtres de l'application.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const grouped = useMemo(
    () =>
      entries.map((entry) => ({
        entry,
        groups: KIND_ORDER.map((kind) => ({
          kind,
          items: entry.changes.filter((c) => c.kind === kind),
        })).filter((g) => g.items.length > 0),
      })),
    [entries]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="changelog-overlay"
          /* `mousedown` bouton gauche : un glissé de sélection relâché sur le
             fond ne doit pas fermer la fenêtre (ni acquitter la version). */
          onMouseDown={(e) => e.target === e.currentTarget && e.button === 0 && onClose()}
        >
          <motion.div
            className="changelog-content"
            initial={{ opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 14 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Nouveautés"
          >
            <header className="changelog-header">
              <div>
                <span className="changelog-eyebrow">CalculatorGCC</span>
                <h2>Nouveautés</h2>
              </div>
              <button className="changelog-close" onClick={onClose} aria-label="Fermer">
                ✕
              </button>
            </header>

            <div className="changelog-body">
              {grouped.length === 0 && (
                <p className="changelog-empty">Aucune nouveauté pour le moment.</p>
              )}

              {grouped.map(({ entry, groups }, index) => {
                const isOpenEntry = expanded === entry.version;
                const isLatest = entry.version === latestVersion;
                const total = entry.changes.length;

                return (
                  <section
                    className={`changelog-release${isOpenEntry ? ' is-open' : ''}`}
                    key={entry.version}
                  >
                    {/* La pastille et le trait forment la frise verticale. */}
                    <div className="changelog-rail" aria-hidden="true">
                      <span className={`changelog-dot${isLatest ? ' is-latest' : ''}`} />
                      {index < grouped.length - 1 && <span className="changelog-line" />}
                    </div>

                    <div className="changelog-release__main">
                      <div className="changelog-release__head">
                        <span className="changelog-release__meta">
                          <time className="changelog-date" dateTime={entry.version}>
                            {entry.date}
                          </time>
                          {highlightUnseen && isLatest && (
                            <span className="changelog-badge">Nouveau</span>
                          )}
                          <span className="changelog-count">
                            {total} changement{total > 1 ? 's' : ''}
                          </span>
                        </span>
                        {/* Le titre reste un vrai <h3> : dans un <button>, il
                            sortait de la navigation par en-têtes et le nom
                            accessible devenait une phrase illisible. */}
                        <h3>
                          <button
                            type="button"
                            className="changelog-release__toggle"
                            onClick={() => setExpanded(isOpenEntry ? null : entry.version)}
                            aria-expanded={isOpenEntry}
                          >
                            {entry.title}
                            <span className="changelog-chevron" aria-hidden="true">
                              {isOpenEntry ? '▾' : '▸'}
                            </span>
                          </button>
                        </h3>
                        {entry.summary && <p className="changelog-summary">{entry.summary}</p>}
                      </div>

                      <AnimatePresence initial={false}>
                        {isOpenEntry && (
                          <motion.div
                            className="changelog-groups"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.18 }}
                          >
                            {groups.map((group) => (
                              <div className="changelog-group" key={group.kind}>
                                <span className={`changelog-kind kind-${group.kind}`}>
                                  {KIND_LABELS[group.kind]}
                                </span>
                                <ul className="changelog-list">
                                  {group.items.map((item, i) => (
                                    <li key={i}>{item.text}</li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </section>
                );
              })}
            </div>

            <footer className="changelog-footer">
              <button className="changelog-ok" onClick={onClose}>
                J'ai compris
              </button>
            </footer>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ChangelogModal;
