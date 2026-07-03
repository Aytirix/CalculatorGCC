import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { BackendAPI42Service, type RefreshJobStatus } from '@/services/backend-api42.service';
import { useViewingUser } from '@/contexts/useViewingUser';
import { useAuth } from '@/contexts/useAuth';

interface RefreshContextValue {
  /** Job de refresh actif (pour le badge file d'attente), ou null. */
  job: RefreshJobStatus | null;
  /** true tant qu'un job est en file ou en cours. */
  refreshing: boolean;
  /** Secondes restantes avant qu'un nouveau refresh soit autorisé. */
  cooldownSeconds: number;
  /** Incrémenté à chaque fin de job — le Dashboard s'y abonne pour recharger. */
  completedTick: number;
  /** Demande un refresh (met en file). No-op si déjà en file ou en consultation. */
  requestRefresh: () => Promise<void>;
  /** Adopte un job déjà connu (ex. synchro auto renvoyée par getUserData) et lance le suivi. */
  syncJob: (job: RefreshJobStatus | null) => void;
  /** Message éphémère (cooldown atteint, erreur réseau). */
  notice: string | null;
}

const DEFAULTS: RefreshContextValue = {
  job: null,
  refreshing: false,
  cooldownSeconds: 0,
  completedTick: 0,
  requestRefresh: async () => {},
  syncJob: () => {},
  notice: null,
};

export const RefreshContext = createContext<RefreshContextValue>(DEFAULTS);

const POLL_MS = 1500;
// Après ~30 s d'échecs de poll soutenus, on débloque l'UI au lieu de la figer.
const MAX_POLL_ERRORS = 20;

export const RefreshProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const { isViewingOther } = useViewingUser();

  const [job, setJob] = useState<RefreshJobStatus | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [completedTick, setCompletedTick] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobRef = useRef<RefreshJobStatus | null>(null);
  jobRef.current = job;
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollErrorsRef = useRef(0); // erreurs de poll consécutives avant abandon

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const flashNotice = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }, []);

  const poll = useCallback(async () => {
    try {
      const status = await BackendAPI42Service.getRefreshStatus();
      pollErrorsRef.current = 0;
      setCooldownSeconds(status.cooldownSeconds);
      if (status.job) {
        setJob(status.job);
      } else {
        const wasActive = jobRef.current !== null;
        setJob(null);
        stopPolling();
        if (wasActive) setCompletedTick((t) => t + 1); // job terminé -> recharger
      }
    } catch {
      // Erreur transitoire : on CONTINUE de poller (le job tourne sans doute
      // toujours côté serveur) sans vider le badge. Mais après un échec soutenu,
      // on débloque l'UI plutôt que de la laisser figée à vie : on efface le job
      // et on force le Dashboard à re-dériver son état depuis le serveur.
      pollErrorsRef.current += 1;
      if (pollErrorsRef.current >= MAX_POLL_ERRORS) {
        stopPolling();
        setJob(null);
        setCompletedTick((t) => t + 1);
      }
    }
  }, [stopPolling]);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    pollErrorsRef.current = 0;
    pollRef.current = setInterval(poll, POLL_MS);
  }, [poll]);

  // Restaure un éventuel job actif au montage / retour sur son profil
  // (permet au badge de réapparaître après un rechargement de page).
  useEffect(() => {
    if (!isAuthenticated || isViewingOther) {
      stopPolling();
      setJob(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const status = await BackendAPI42Service.getRefreshStatus();
        if (cancelled) return;
        setCooldownSeconds(status.cooldownSeconds);
        if (status.job) {
          setJob(status.job);
          startPolling();
        }
      } catch {
        /* pas authentifié / réseau : ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isViewingOther, startPolling, stopPolling]);

  // Décompte visuel du cooldown (réécrasé par le serveur à chaque poll).
  useEffect(() => {
    const id = setInterval(() => {
      setCooldownSeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Nettoyage global
  useEffect(() => () => {
    stopPolling();
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, [stopPolling]);

  // Adopte un job renvoyé par ailleurs (getUserData -> première synchro auto) et
  // démarre le suivi. Évite la course « le job existe mais personne ne le suit ».
  const syncJob = useCallback((incoming: RefreshJobStatus | null) => {
    if (!incoming || isViewingOther) return; // jamais le job d'un profil consulté
    setJob(incoming);
    startPolling();
  }, [startPolling, isViewingOther]);

  const requestRefresh = useCallback(async () => {
    if (isViewingOther) return; // on ne rafraîchit jamais un profil consulté
    if (jobRef.current) return; // déjà en file : il faut attendre
    try {
      const res = await BackendAPI42Service.requestRefresh();
      if (!res.ok && res.code === 'COOLDOWN') {
        setCooldownSeconds(res.retryInSeconds ?? 0);
        flashNotice(res.message ?? 'Réactualisation indisponible pour le moment.');
        return;
      }
      if (res.job) {
        setJob(res.job);
        startPolling();
      }
    } catch {
      flashNotice('Impossible de lancer la réactualisation.');
    }
  }, [isViewingOther, startPolling, flashNotice]);

  return (
    <RefreshContext.Provider
      value={{
        job,
        refreshing: job !== null,
        cooldownSeconds,
        completedTick,
        requestRefresh,
        syncJob,
        notice,
      }}
    >
      {children}
    </RefreshContext.Provider>
  );
};
