import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { adminService } from '@/services/admin.service';
import './Admin.scss';

const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const [passkeyEnrolled, setPasskeyEnrolled] = useState<boolean | null>(null);
  const [statusUnavailable, setStatusUnavailable] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [consoleToken, setConsoleToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminService.getStatus()
      .then((s) => {
        setPasskeyEnrolled(s.passkey_enrolled);
        // Aucune passkey (bootstrap) → on présente directement le token console.
        setShowConsole(!s.passkey_enrolled);
      })
      .catch(() => {
        // Statut indisponible ≠ « aucune passkey » : on ne doit PAS condamner la voie
        // passkey (sinon plus aucun accès sans recharger la page). On propose les deux.
        setStatusUnavailable(true);
        setPasskeyEnrolled(false);
        setShowConsole(true);
      });
  }, []);

  // Tant qu'on n'a pas la preuve du contraire (statut indisponible), la passkey reste
  // proposée : c'est la voie normale de l'owner.
  const canTryPasskey = passkeyEnrolled === true || statusUnavailable;

  const handlePasskey = async () => {
    setError('');
    setBusy(true);
    try {
      await adminService.loginWithPasskey();
      navigate('/admin');
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "Échec de l'authentification par passkey.");
    } finally {
      setBusy(false);
    }
  };

  const handleConsole = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await adminService.loginWithConsoleToken(consoleToken.trim());
      navigate('/admin');
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Token console invalide.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-page">
      <motion.div
        className="admin-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1>🔐 Accès administrateur</h1>
        <p className="subtitle">Authentification indépendante d'OAuth 42.</p>

        {error && (
          <div className="admin-error">
            <span>⚠️</span>
            <p>{error}</p>
          </div>
        )}

        {passkeyEnrolled === null ? (
          <p className="muted">Chargement…</p>
        ) : (
          <>
            {canTryPasskey && !showConsole && (
              <>
                <Button size="lg" className="admin-btn" onClick={handlePasskey} disabled={busy}>
                  {busy ? 'Authentification…' : 'Se connecter avec une passkey'}
                </Button>
                <button className="admin-link" onClick={() => setShowConsole(true)} disabled={busy}>
                  Utiliser le token console (recovery)
                </button>
              </>
            )}

            {showConsole && (
              <form onSubmit={handleConsole} className="admin-form">
                {statusUnavailable ? (
                  <div className="admin-info">
                    <p>
                      Statut du serveur indisponible : les deux voies restent proposées —
                      passkey, ou <strong>token console</strong> (affiché dans les logs au démarrage).
                    </p>
                  </div>
                ) : !passkeyEnrolled && (
                  <div className="admin-info">
                    <p>
                      Aucune passkey enrôlée. Entrez le <strong>token console</strong> affiché dans les logs
                      du serveur au démarrage, puis enrôlez une passkey depuis le panneau.
                    </p>
                  </div>
                )}
                <div className="form-group">
                  <label htmlFor="consoleToken">Token console</label>
                  <input
                    id="consoleToken"
                    type="password"
                    value={consoleToken}
                    onChange={(e) => setConsoleToken(e.target.value)}
                    placeholder="Collez le token affiché dans les logs"
                    autoComplete="off"
                    required
                    disabled={busy}
                  />
                </div>
                <Button type="submit" size="lg" className="admin-btn" disabled={busy || !consoleToken.trim()}>
                  {busy ? 'Vérification…' : 'Valider'}
                </Button>
                {canTryPasskey && (
                  <button type="button" className="admin-link" onClick={() => setShowConsole(false)} disabled={busy}>
                    ← Essayer la passkey
                  </button>
                )}
              </form>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
};

export default AdminLogin;
