import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import Header from '@/components/Header/Header';
import {
  BackendAPI42Service,
  type ApiUsageStats,
  type AppStats,
  type PeriodCounts,
} from '@/services/backend-api42.service';
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

type Period = keyof PeriodCounts;

const PERIOD_LABELS: Record<Period, string> = {
  day: '24 h',
  week: '7 jours',
  month: '30 jours',
  year: '1 an',
};

const ApiUsage: React.FC = () => {
  const [stats, setStats] = useState<ApiUsageStats | null>(null);
  const [app, setApp] = useState<AppStats | null>(null);
  const [period, setPeriod] = useState<Period>('week');
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

  // Les statistiques d'usage bougent lentement : une seule lecture au montage,
  // contrairement au budget API qu'on suit en direct.
  useEffect(() => {
    let cancelled = false;
    BackendAPI42Service.getStats()
      .then((s) => !cancelled && setApp(s))
      .catch(() => !cancelled && setApp(null));
    return () => {
      cancelled = true;
    };
  }, []);

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

  const renderAppStats = () => {
    if (!app) return null;

    const maxTop = Math.max(1, ...app.simulation.topProjects.map((p) => p.count));
    const maxLevel = Math.max(1, ...app.levels.map((l) => l.users));

    return (
      <section className="app-stats">
        <div className="app-stats__head">
          <h2>Utilisation de l'application</h2>
          <div className="app-stats__periods">
            {(Object.keys(PERIOD_LABELS) as Period[]).map((key) => (
              <button
                key={key}
                className={key === period ? 'active' : ''}
                onClick={() => setPeriod(key)}
              >
                {PERIOD_LABELS[key]}
              </button>
            ))}
          </div>
        </div>

        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-card__label">Personnes actives</span>
            <span className="stat-card__value">{app.users.active[period].toLocaleString('fr-FR')}</span>
            <span className="stat-card__hint">Ont ouvert l'application sur {PERIOD_LABELS[period]}</span>
          </div>

          <div className="stat-card">
            <span className="stat-card__label">Nouveaux comptes</span>
            <span className="stat-card__value">{app.users.joined[period].toLocaleString('fr-FR')}</span>
            <span className="stat-card__hint">Première connexion sur {PERIOD_LABELS[period]}</span>
          </div>

          <div className="stat-card">
            <span className="stat-card__label">Synchros 42</span>
            <span className="stat-card__value">{app.sync.refreshed[period].toLocaleString('fr-FR')}</span>
            <span className="stat-card__hint">Instantanés rafraîchis sur {PERIOD_LABELS[period]}</span>
          </div>

          <div className="stat-card">
            <span className="stat-card__label">Comptes au total</span>
            <span className="stat-card__value">{app.users.total.toLocaleString('fr-FR')}</span>
            <span className="stat-card__hint">
              {app.users.withData} synchronisés · {app.users.publicProfiles} profils publics
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-card__label">Simulations en cours</span>
            <span className="stat-card__value">{app.simulation.usersSimulating.toLocaleString('fr-FR')}</span>
            <span className="stat-card__hint">
              {app.simulation.projectsSimulated.toLocaleString('fr-FR')} projets simulés au total
            </span>
          </div>

          <div className="stat-card">
            <span className="stat-card__label">Équipes déclarées</span>
            <span className="stat-card__value">{app.simulation.usersWithTeam.toLocaleString('fr-FR')}</span>
            <span className="stat-card__hint">Ont annoncé avoir leur team sur un projet</span>
          </div>
        </div>

        <div className="app-stats__charts">
          <div className="app-stats__panel">
            <h3>Projets les plus simulés</h3>
            {app.simulation.topProjects.length === 0 ? (
              <p className="app-stats__empty">Personne n'a encore simulé de projet.</p>
            ) : (
              <ul className="app-stats__bars">
                {app.simulation.topProjects.map((project) => (
                  <li key={project.projectId}>
                    <span className="app-stats__bar-label">{project.name}</span>
                    <span className="app-stats__bar">
                      <span style={{ width: `${(project.count / maxTop) * 100}%` }} />
                    </span>
                    <span className="app-stats__bar-value">{project.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="app-stats__panel">
            <h3>Répartition des niveaux</h3>
            <ul className="app-stats__bars">
              {app.levels.map((bucket) => (
                <li key={bucket.label}>
                  <span className="app-stats__bar-label">Niveau {bucket.label}</span>
                  <span className="app-stats__bar">
                    <span style={{ width: `${(bucket.users / maxLevel) * 100}%` }} />
                  </span>
                  <span className="app-stats__bar-value">{bucket.users}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
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
            <h1>Statistiques &amp; conso API</h1>
            <p>Usage de l'application et budget de requêtes vers l'API de 42.</p>
          </div>
          <span className={`live-badge ${live ? 'on' : 'off'}`}>
            <span className="live-dot" />
            {live ? 'En direct' : 'Hors ligne'}
          </span>
        </motion.div>

        {renderAppStats()}
        {renderBody()}
      </div>
    </div>
  );
};

export default ApiUsage;
