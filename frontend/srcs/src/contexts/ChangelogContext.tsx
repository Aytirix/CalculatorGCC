import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import { simulationService } from '@/services/simulation.service';
import { CHANGELOG, LATEST_CHANGELOG_VERSION } from '@/data/changelog.data';
import ChangelogModal from '@/components/Changelog/ChangelogModal';

interface ChangelogContextValue {
  /** Ouvre la modale des nouveautés (déclenché par le bouton de la navbar). */
  open: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const ChangelogContext = createContext<ChangelogContextValue | null>(null);

export const ChangelogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  // true tant que l'utilisateur n'a pas acquitté la dernière version.
  const [hasUnseen, setHasUnseen] = useState(false);
  const checkedRef = useRef(false);

  // À la connexion : on récupère la dernière version vue (serveur) et on affiche
  // automatiquement la modale si un changelog plus récent existe.
  useEffect(() => {
    if (!isAuthenticated) {
      checkedRef.current = false;
      return;
    }
    if (checkedRef.current) return;
    checkedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        const { lastSeenChangelog } = await simulationService.getChangelogSeen();
        if (cancelled) return;
        if (LATEST_CHANGELOG_VERSION && lastSeenChangelog !== LATEST_CHANGELOG_VERSION) {
          setHasUnseen(true);
          setIsOpen(true);
        }
      } catch {
        // Silencieux : le changelog reste accessible via le bouton de la navbar.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Acquitte la dernière version côté serveur (une seule fois).
  const markSeen = useCallback(() => {
    if (!hasUnseen) return;
    setHasUnseen(false);
    simulationService.saveChangelogSeen(LATEST_CHANGELOG_VERSION).catch(() => {
      // En cas d'échec, ce n'est pas bloquant : au pire elle se réaffichera au prochain chargement.
    });
  }, [hasUnseen]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    markSeen(); // fermer la modale = acquitter la dernière version
  }, [markSeen]);

  return (
    <ChangelogContext.Provider value={{ open }}>
      {children}
      <ChangelogModal
        isOpen={isOpen}
        onClose={close}
        entries={CHANGELOG}
        latestVersion={LATEST_CHANGELOG_VERSION}
        highlightUnseen={hasUnseen}
      />
    </ChangelogContext.Provider>
  );
};
