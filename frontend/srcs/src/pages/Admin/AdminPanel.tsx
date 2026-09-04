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
} from '@/services/admin.service';
import './Admin.scss';

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
      const [cfg, pk, dl, gr] = await Promise.all([
        adminService.getConfig(),
        adminService.listPasskeys(),
        adminService.listDelegates(),
        adminService.getGlobalRefresh(),
      ]);
      setConfig(cfg);
      setPasskeys(pk);
      setDelegates(dl);
      setRefresh(gr);
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
      <motion.div className="admin-card wide" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="admin-head">
          <h1>🛠️ Panneau administrateur</h1>
          <button className="admin-link" onClick={logout}>Déconnexion</button>
        </div>

        {msg && (
          <div className={msg.kind === 'ok' ? 'admin-ok' : 'admin-error'}>
            <p>{msg.text}</p>
          </div>
        )}

        {/* ===== Secrets API 42 ===== */}
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

        {/* ===== Passkeys ===== */}
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

        {/* ===== Admins délégués ===== */}
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

        {/* ===== Refresh global des données 42 ===== */}
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
      </motion.div>
    </div>
  );
};

export default AdminPanel;
