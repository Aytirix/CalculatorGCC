import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import Header from '@/components/Header/Header';
import { BackendAPI42Service, type ApiUsageStats } from '@/services/backend-api42.service';
import './ApiUsage.scss';

const POLL_MS = 2000;

const relTime = (iso: string | null): string => {
  if (!iso) return 'aucune pour le moment';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(diff / 1000));
  if (s < 60) return `il y a ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  return `il y a ${Math.round(m / 60)} h`;
};

const ApiUsage: React.FC = () => {
  const [stats, setStats] = useState<ApiUsageStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await BackendAPI42Service.getUsage();
      setStats(s);
      setError(null);
      setLive(true);
    } catch {
      setLive(false);
      setError("Impossible de récupérer l'usage de l'API pour le moment.");
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [load]);

  const renderBody = () => {
    if (!stats && error) {
      return <div className="api-usage-error">{error}</div>;
    }
    if (!stats) {
      return (
        <div className="api-usage-loading">
          <motion.div
            className="spinner"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
          <p>Lecture de l'usage de l'API…</p>
        </div>
      );
    }

    // Tant qu'aucune requête 42 n'a été observée, on affiche les valeurs « à vide »
    // (budget plein) plutôt que « — » : rien consommé = tout disponible.
    const hourlyRemaining =
      stats.hourlyRemaining ?? Math.max(0, stats.hourlyLimit - stats.requestsLastHour);
    const hourlyUsed = Math.max(0, stats.hourlyLimit - hourlyRemaining);
    const hourlyPct = Math.min(100, Math.max(0, Math.round((hourlyUsed / stats.hourlyLimit) * 100)));
    const level = hourlyRemaining > 300 ? 'ok' : hourlyRemaining > 50 ? 'warn' : 'crit';

    const secRem = stats.secondlyRemaining ?? stats.secondlyLimit;

    return (
      <>
        {/* Budget horaire — carte principale */}
        <div className={`budget-card level-${level}`}>
          <div className="budget-top">
            <span className="budget-label">Budget horaire restant</span>
            <span className="budget-limit">/ {stats.hourlyLimit.toLocaleString()} req·h</span>
          </div>
          <div className="budget-value">
            {hourlyRemaining.toLocaleString()}
            <span className="budget-unit">restantes</span>
          </div>
          <div className="budget-bar">
            <div className="budget-bar__fill" style={{ width: `${hourlyPct}%` }} />
          </div>
          <div className="budget-foot">
            <span>{hourlyPct}% consommé</span>
            <span>fenêtre glissante sur 1 h</span>
          </div>
        </div>

        {/* Grille de stats */}
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-card__label">Débit disponible</span>
            <span className="stat-card__value">
              {secRem}
              <span className="stat-card__unit">/ {stats.secondlyLimit} req·s</span>
            </span>
            <span className="stat-card__hint">Limite 42 : {stats.secondlyLimit} requêtes par seconde</span>
          </div>

          <div className="stat-card">
            <span className="stat-card__label">Requêtes émises (1 h)</span>
            <span className="stat-card__value">{stats.requestsLastHour.toLocaleString()}</span>
            <span className="stat-card__hint">Par l'application, fenêtre glissante</span>
          </div>

          <div className="stat-card">
            <span className="stat-card__label">File de refresh</span>
            <span className="stat-card__value">
              {stats.refresh.running}
              <span className="stat-card__unit">en cours</span>
            </span>
            <span className="stat-card__hint">{stats.refresh.waiting} en attente · {stats.queueDepth} requêtes en file</span>
          </div>

          <div className={`stat-card ${stats.paused ? 'stat-card--alert' : ''}`}>
            <span className="stat-card__label">État de la file</span>
            <span className="stat-card__value">
              {stats.paused ? `En pause ${stats.pausedForSeconds}s` : 'Actif'}
            </span>
            <span className="stat-card__hint">
              Délai mini {stats.minDelayMs} ms · dernière requête {relTime(stats.lastRequestAt)}
            </span>
          </div>
        </div>

        <p className="api-usage-note">
          Limites de l'API 42 : <b>2 requêtes/seconde</b> et <b>1200 requêtes/heure</b> par application.
          Cette page lit l'état en mémoire du serveur — l'ouvrir ne consomme aucune requête.
        </p>
      </>
    );
  };

  return (
    <div className="api-usage-page">
      <Header />
      <div className="api-usage-container">
        <motion.div
          className="api-usage-header"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div>
            <h1>Consommation API 42</h1>
            <p>Suivi en temps réel du budget de requêtes vers l'API de 42.</p>
          </div>
          <span className={`live-badge ${live ? 'on' : 'off'}`}>
            <span className="live-dot" />
            {live ? 'En direct' : 'Hors ligne'}
          </span>
        </motion.div>

        {renderBody()}
      </div>
    </div>
  );
};

export default ApiUsage;
