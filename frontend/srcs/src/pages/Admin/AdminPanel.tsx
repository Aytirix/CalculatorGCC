import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  adminService,
  type AdminConfig,
  type PasskeyInfo,
  type DelegateInfo,
} from '@/services/admin.service';
import './Admin.scss';

const AdminPanel: React.FC = () => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [delegates, setDelegates] = useState<DelegateInfo[]>([]);
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
      const [cfg, pk, dl] = await Promise.all([
        adminService.getConfig(),
        adminService.listPasskeys(),
        adminService.listDelegates(),
      ]);
      setConfig(cfg);
      setPasskeys(pk);
      setDelegates(dl);
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
      </motion.div>
    </div>
  );
};

export default AdminPanel;
