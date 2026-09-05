import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  adminService,
  type AdminConfig,
  type PasskeyInfo,
  type DelegateInfo,
  type GlobalRefreshState,
  type AllowedOriginInfo,
} from '@/services/admin.service';
import './Admin.scss';
import './AdminLogin.scss';


/** Onglets du panneau : chacun n'affiche qu'une chose, au lieu de tout empiler. */
const TABS = [
  { id: 'secrets', label: 'Secrets API 42', icon: '🔑' },
  { id: 'passkeys', label: 'Passkeys', icon: '🛡️' },
  { id: 'delegates', label: 'Délégués', icon: '👥' },
  { id: 'origins', label: 'Origines autorisées', icon: '🌐' },
  { id: 'refresh', label: 'Données 42 partagées', icon: '🔄' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const AdminPanel: React.FC = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [delegates, setDelegates] = useState<DelegateInfo[]>([]);
  const [refresh, setRefresh] = useState<GlobalRefreshState | null>(null);
  const [secretForm, setSecretForm] = useState({ client_id: '', client_secret: '', client_secret_next: '' });
  const [newDelegate, setNewDelegate] = useState('');
  const [newPasskeyLabel, setNewPasskeyLabel] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabId>('secrets');
  const [origins, setOrigins] = useState<AllowedOriginInfo[]>([]);
  const [originsSelf, setOriginsSelf] = useState('');
  const [originsSelfAllowed, setOriginsSelfAllowed] = useState(true);
  const [mirrorUrl, setMirrorUrl] = useState<string | null>(null);
  const [mirrorInput, setMirrorInput] = useState('');
  const [newOrigin, setNewOrigin] = useState('');
  const [newOriginLabel, setNewOriginLabel] = useState('');

  // Session admin expirée/invalide → on repart proprement vers l'écran d'auth.
  const onAuthError = useCallback((e: any): boolean => {
    if (e?.response?.status === 401) {
      adminService.clearToken();
      navigate('/admin/login');
      return true;
    }
    return false;
  }, [navigate]);

  const reload = useCallback(async () => {
    try {
      const [cfg, pk, dl, gr, og, mi] = await Promise.all([
        adminService.getConfig(),
        adminService.listPasskeys(),
        adminService.listDelegates(),
        adminService.getGlobalRefresh(),
        adminService.listOrigins(),
        adminService.getMirror(),
      ]);
      setConfig(cfg);
      setPasskeys(pk);
      setDelegates(dl);
      setRefresh(gr);
      setOrigins(og.origins);
      setOriginsSelf(og.self);
      setOriginsSelfAllowed(og.self_allowed);
      setMirrorUrl(mi.mirror_api_url);
      setMirrorInput(mi.mirror_api_url ?? '');
      setSecretForm((f) => ({ ...f, client_id: cfg.client_id || f.client_id }));
    } catch (e) {
      if (!onAuthError(e)) setMsg({ kind: 'err', text: 'Chargement impossible.' });
    } finally {
      setLoading(false);
    }
  }, [onAuthError]);

  useEffect(() => {
    if (!adminService.isAuthenticated()) {
      navigate('/admin/login');
      return;
    }
    reload();
  }, [navigate, reload]);

  // Tant qu'un refresh global tourne, on suit sa progression (le bouton doit
  // rester désactivé jusqu'à la fin, y compris après un rechargement de page).
  useEffect(() => {
    if (!refresh?.running) return;
    const timer = setInterval(async () => {
      try {
        setRefresh(await adminService.getGlobalRefresh());
      } catch {
        /* on réessaiera au tick suivant */
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh?.running]);

  const saveMirror = async (url: string | null) => {
    setMsg(null);
    setBusy(true);
    try {
      await adminService.setMirror(url);
      await reload();
      setMsg({
        kind: 'ok',
        text: url ? `Cette instance relaie désormais ${url}.` : 'Cette instance sert de nouveau ses propres données.',
      });
    } catch (e: unknown) {
      if (!onAuthError(e)) {
        const detail = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setMsg({ kind: 'err', text: detail || 'Réglage impossible.' });
      }
    } finally {
      setBusy(false);
    }
  };

  const addOrigin = async () => {
    setMsg(null);
    setBusy(true);
    try {
      await adminService.addOrigin(newOrigin.trim(), newOriginLabel.trim() || undefined);
      setNewOrigin('');
      setNewOriginLabel('');
      await reload();
      setMsg({ kind: 'ok', text: 'Origine autorisée.' });
    } catch (e: unknown) {
      if (!onAuthError(e)) {
        const detail = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setMsg({ kind: 'err', text: detail || 'Origine invalide.' });
      }
    } finally {
      setBusy(false);
    }
  };

  const removeOrigin = async (origin: string) => {
    setMsg(null);
    setBusy(true);
    try {
      await adminService.removeOrigin(origin);
      await reload();
      setMsg({ kind: 'ok', text: 'Origine révoquée.' });
    } catch (e: unknown) {
      if (!onAuthError(e)) setMsg({ kind: 'err', text: 'Révocation impossible.' });
    } finally {
      setBusy(false);
    }
  };

  const startGlobalRefresh = async () => {
    setMsg(null);
    setBusy(true);
    try {
      const { started, state } = await adminService.startGlobalRefresh();
      setRefresh(state);
      setMsg(
        started
          ? { kind: 'ok', text: 'Refresh global lancé. Les requêtes partent progressivement.' }
          : { kind: 'err', text: 'Un refresh global est déjà en cours.' }
      );
    } catch (e) {
      if (!onAuthError(e)) setMsg({ kind: 'err', text: 'Impossible de lancer le refresh global.' });
    } finally {
      setBusy(false);
    }
  };

  const saveSecrets = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const next = secretForm.client_secret_next.trim();
      await adminService.updateSecrets({
        client_id: secretForm.client_id.trim(),
        client_secret: secretForm.client_secret,
        ...(next ? { client_secret_next: next } : {}),
      });
      setMsg({ kind: 'ok', text: 'Secrets 42 mis à jour et validés auprès de 42.' });
      setSecretForm((f) => ({ ...f, client_secret: '', client_secret_next: '' }));
      await reload();
    } catch (e: any) {
      if (!onAuthError(e)) setMsg({ kind: 'err', text: e?.response?.data?.error || 'Échec de la mise à jour.' });
    } finally {
      setBusy(false);
    }
  };

  const addPasskey = async () => {
    setMsg(null);
    setBusy(true);
    try {
      await adminService.enrollPasskey(newPasskeyLabel.trim() || undefined);
      setNewPasskeyLabel('');
      setMsg({ kind: 'ok', text: 'Passkey enrôlée.' });
      await reload();
    } catch (e: any) {
      if (!onAuthError(e)) setMsg({ kind: 'err', text: e?.response?.data?.error || e?.message || 'Enrôlement annulé ou échoué.' });
    } finally {
      setBusy(false);
    }
  };

  const removePasskey = async (id: number) => {
    setMsg(null);
    setBusy(true);
    try {
      const res = await adminService.deletePasskey(id);
      const revoked = res?.sessions_revoked ?? 0;
      // Retirer une passkey coupe les autres sessions owner : on le dit explicitement,
      // sinon rien ne confirme que l'accès de l'authenticator retiré est bien mort.
      setMsg({
        kind: 'ok',
        text: revoked > 0
          ? `Passkey supprimée — ${revoked} session(s) admin révoquée(s).`
          : 'Passkey supprimée.',
      });
      await reload();
    } catch (e: any) {
      if (!onAuthError(e)) setMsg({ kind: 'err', text: 'Suppression impossible.' });
    } finally {
      setBusy(false);
    }
  };

  const addDelegate = async () => {
    setMsg(null);
    setBusy(true);
    try {
      await adminService.addDelegate(newDelegate.trim().toLowerCase());
      setNewDelegate('');
      await reload();
    } catch (e: any) {
      if (!onAuthError(e)) setMsg({ kind: 'err', text: e?.response?.data?.error || 'Ajout impossible.' });
    } finally {
      setBusy(false);
    }
  };

  const removeDelegate = async (login: string) => {
    setMsg(null);
    setBusy(true);
    try {
      await adminService.removeDelegate(login);
      await reload();
    } catch (e: any) {
      if (!onAuthError(e)) setMsg({ kind: 'err', text: 'Retrait impossible.' });
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await adminService.logout();
    navigate('/admin/login');
  };

  if (loading) {
    return (
      <div className="admin-page">
        <div className="admin-card"><p className="muted">Chargement…</p></div>
      </div>
    );
  }

  return (
    <div className="admin-page admin-panel">
      <motion.div className="admin-shell" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <aside className="admin-sidebar">
          <div className="admin-sidebar__brand">
            <span className="auth-badge">Administration</span>
            <h1>CalculatorGCC</h1>
          </div>

          <nav className="admin-sidebar__nav">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`admin-tab${tab === entry.id ? ' admin-tab--active' : ''}`}
                onClick={() => setTab(entry.id)}
                aria-current={tab === entry.id ? 'page' : undefined}
              >
                <span className="admin-tab__icon" aria-hidden="true">{entry.icon}</span>
                {entry.label}
              </button>
            ))}
          </nav>

          <button className="admin-link admin-sidebar__logout" onClick={logout}>
            Déconnexion
          </button>
        </aside>

        <main className="admin-main">

        {msg && (
          <div className={msg.kind === 'ok' ? 'admin-ok' : 'admin-error'}>
            <p>{msg.text}</p>
          </div>
        )}

        {/* ===== Secrets API 42 ===== */}
        {tab === 'secrets' && (
        <section className="admin-section">
          <h2>Secrets API 42</h2>
          {config && (
            <div className="admin-status">
              <span>Client ID : <code>{config.client_id || '—'}</code></span>
              <span>Secret courant : {config.current_secret_set ? '✓' : '✗'}</span>
              <span>Next Secret : {config.next_secret_set ? '✓' : '— (à préparer)'}</span>
              {config.credentials_invalid && (
                <span className="warn">⚠️ Credentials invalides — mise à jour requise</span>
              )}
            </div>
          )}
          <form onSubmit={saveSecrets} className="admin-form">
            <div className="form-group">
              <label htmlFor="client_id">Client ID</label>
              <input
                id="client_id"
                type="text"
                value={secretForm.client_id}
                onChange={(e) => setSecretForm({ ...secretForm, client_id: e.target.value })}
                placeholder="Client ID 42"
                required
                disabled={busy}
              />
            </div>
            <div className="form-group">
              <label htmlFor="client_secret">Client Secret</label>
              <input
                id="client_secret"
                type="password"
                value={secretForm.client_secret}
                onChange={(e) => setSecretForm({ ...secretForm, client_secret: e.target.value })}
                placeholder="Secret courant 42"
                autoComplete="off"
                required
                disabled={busy}
              />
            </div>
            <div className="form-group">
              <label htmlFor="client_secret_next">
                Next Secret <span className="optional">(optionnel — relais automatique)</span>
              </label>
              <input
                id="client_secret_next"
                type="password"
                value={secretForm.client_secret_next}
                onChange={(e) => setSecretForm({ ...secretForm, client_secret_next: e.target.value })}
                placeholder="Next secret affiché par l'intra"
                autoComplete="off"
                disabled={busy}
              />
            </div>
            <Button type="submit" className="admin-btn" disabled={busy}>Enregistrer les secrets</Button>
          </form>
        </section>
        )}

        {/* ===== Passkeys ===== */}
        {tab === 'passkeys' && (
        <section className="admin-section">
          <h2>Passkeys ({passkeys.length})</h2>
          <ul className="admin-list">
            {passkeys.map((p) => (
              <li key={p.id}>
                <span>
                  {p.label || 'Passkey'} · créée le {new Date(p.created_at).toLocaleDateString()}
                  {p.last_used_at ? ` · utilisée le ${new Date(p.last_used_at).toLocaleDateString()}` : ''}
                </span>
                <button className="admin-link danger" onClick={() => removePasskey(p.id)} disabled={busy}>
                  Supprimer
                </button>
              </li>
            ))}
            {passkeys.length === 0 && (
              <li className="muted">Aucune passkey. Enrôlez-en une pour ne plus dépendre du token console.</li>
            )}
          </ul>
          <div className="admin-inline">
            <input
              type="text"
              value={newPasskeyLabel}
              onChange={(e) => setNewPasskeyLabel(e.target.value)}
              placeholder="Libellé (optionnel)"
              disabled={busy}
            />
            <Button onClick={addPasskey} className="admin-btn" disabled={busy}>+ Ajouter une passkey</Button>
          </div>
        </section>
        )}

        {/* ===== Admins délégués ===== */}
        {tab === 'delegates' && (
        <section className="admin-section">
          <h2>Admins délégués ({delegates.length})</h2>
          <p className="muted">Ces logins 42 peuvent éditer les secrets 42 — rien d'autre.</p>
          <ul className="admin-list">
            {delegates.map((d) => (
              <li key={d.login}>
                <span><code>{d.login}</code></span>
                <button className="admin-link danger" onClick={() => removeDelegate(d.login)} disabled={busy}>
                  Retirer
                </button>
              </li>
            ))}
            {delegates.length === 0 && <li className="muted">Aucun délégué.</li>}
          </ul>
          <div className="admin-inline">
            <input
              type="text"
              value={newDelegate}
              onChange={(e) => setNewDelegate(e.target.value)}
              placeholder="login 42"
              disabled={busy}
            />
            <Button onClick={addDelegate} className="admin-btn" disabled={busy || !newDelegate.trim()}>+ Ajouter</Button>
          </div>
        </section>
        )}

        {/* ===== Refresh global des données 42 ===== */}
        {tab === 'origins' && (
        <section className="admin-section">
          <h2>Origines autorisées</h2>
          <p className="muted">
            Une autre instance peut servir le frontend et proxifier <code>/api</code> vers ce
            backend : une seule base, un seul serveur, aucun secret partagé. Seules les origines
            listées ici peuvent appeler l'API depuis un autre domaine et recevoir le retour de
            connexion 42. Une révocation prend effet immédiatement.
          </p>

          <div className="admin-status">
            <span>
              Source des données :{' '}
              <code>{mirrorUrl || 'base de données locale'}</code>
            </span>
            <span className="muted">
              {mirrorUrl
                ? "Mode miroir : cette instance ne sert plus ses propres données, elle relaie tout vers l'instance ci-dessus, qui doit avoir autorisé ce domaine. Le panneau admin, lui, reste local."
                : 'Cette instance sert ses propres données. Renseigne ci-dessous l’API d’une autre instance pour relayer vers elle — sans rien reconstruire.'}
            </span>
          </div>

          <div className="admin-inline">
            <input
              value={mirrorInput}
              onChange={(e) => setMirrorInput(e.target.value)}
              placeholder="https://theomouty.fr/api"
              disabled={busy}
            />
            <Button
              onClick={() => saveMirror(mirrorInput.trim() || null)}
              className="admin-btn"
              disabled={busy || mirrorInput.trim() === (mirrorUrl ?? '')}
            >
              {mirrorInput.trim() ? 'Relayer vers cette API' : 'Revenir à la base locale'}
            </Button>
          </div>

          <ul className="admin-list">
            <li>
              <span><code>{originsSelf || '—'}</code></span>
              <span className="muted">
                {originsSelfAllowed
                  ? 'cette instance — toujours autorisée'
                  : 'origine locale en production — non auto-autorisée'}
              </span>
            </li>
            {origins.map((o) => (
              <li key={o.origin}>
                <span>
                  <code>{o.origin}</code>
                  {o.label && <span className="muted"> — {o.label}</span>}
                </span>
                <button className="admin-link danger" onClick={() => removeOrigin(o.origin)} disabled={busy}>
                  Révoquer
                </button>
              </li>
            ))}
            {origins.length === 0 && (
              <li className="muted">Aucune autre origine autorisée.</li>
            )}
          </ul>

          <div className="admin-inline">
            <input
              value={newOrigin}
              onChange={(e) => setNewOrigin(e.target.value)}
              placeholder="https://calculator.42nice.fr"
              disabled={busy}
            />
            <input
              value={newOriginLabel}
              onChange={(e) => setNewOriginLabel(e.target.value)}
              placeholder="Libellé (facultatif)"
              disabled={busy}
            />
            <Button onClick={addOrigin} className="admin-btn" disabled={busy || !newOrigin.trim()}>
              + Autoriser
            </Button>
          </div>
        </section>
        )}

        {tab === 'refresh' && (
        <section className="admin-section">
          <h2>Données 42 partagées</h2>
          <p className="muted">
            Renouvelle le catalogue des projets et le layout du Holy Graph, puis remet à jour
            l'instantané 42 de tous les utilisateurs. Les requêtes partent au compte-gouttes
            pour respecter les limites de l'API 42 : l'opération peut durer longtemps.
          </p>

          <ul className="admin-list">
            <li>
              <span>Dernier lancement</span>
              <span className="muted">
                {refresh?.startedAt
                  ? `${new Date(refresh.startedAt).toLocaleString('fr-FR')}${refresh.startedBy ? ` — par ${refresh.startedBy}` : ''}`
                  : 'jamais'}
              </span>
            </li>
            {refresh?.finishedAt && !refresh.running && (
              <li>
                <span>Terminé le</span>
                <span className="muted">{new Date(refresh.finishedAt).toLocaleString('fr-FR')}</span>
              </li>
            )}
            {refresh?.running && (
              <li>
                <span>En cours</span>
                <span className="muted">{refresh.usersDone} / {refresh.usersTotal} utilisateurs</span>
              </li>
            )}
            {refresh?.cacheEntries.map((entry) => (
              <li key={entry.key}>
                <span><code>{entry.key}</code></span>
                <span className="muted">mis en cache le {new Date(entry.fetchedAt).toLocaleString('fr-FR')}</span>
              </li>
            ))}
            {refresh && refresh.cacheEntries.length === 0 && (
              <li className="muted">Aucune donnée de référence en cache pour le moment.</li>
            )}
            {refresh?.lastError && (
              <li>
                <span>Dernière erreur</span>
                <span className="muted">{refresh.lastError}</span>
              </li>
            )}
          </ul>

          <Button
            onClick={startGlobalRefresh}
            className="admin-btn"
            disabled={busy || !refresh || refresh.running}
          >
            {refresh?.running ? 'Refresh en cours…' : 'Lancer un refresh global'}
          </Button>
        </section>
        )}
        </main>
      </motion.div>
    </div>
  );
};

export default AdminPanel;
