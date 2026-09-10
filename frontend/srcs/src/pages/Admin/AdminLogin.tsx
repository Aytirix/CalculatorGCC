import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { adminService } from '@/services/admin.service';
import './Admin.scss';
import './AdminLogin.scss';

/**
 * Deux façons d'entrer, qui ne s'adressent pas aux mêmes personnes :
 *
 *  - le TOKEN CONSOLE, affiché dans les logs du serveur à chaque démarrage. Il
 *    prouve l'accès à la machine et donne le panneau entier. Indépendant d'OAuth
 *    42, donc utilisable même quand 42 est injoignable.
 *  - la SESSION 42 d'un délégué, qui n'ouvre que les zones qu'on lui a accordées.
 *    Aucune action ici : s'il est déjà connecté, le panneau le reconnaît seul.
 */
const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Renvoyé ici faute d'accès : sans ce mot, un délégué dont on a décoché toutes
  // les cases se retrouvait devant un formulaire de token console, sans que rien
  // n'explique pourquoi son panneau avait disparu.
  const sansAcces = searchParams.get('raison') === 'sans-acces';
  const [consoleToken, setConsoleToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /** Le visiteur a-t-il déjà des droits via sa session 42 ? */
  const [delegateAccess, setDelegateAccess] = useState(false);

  useEffect(() => {
    // Un délégué déjà connecté à 42 n'a rien à saisir : on lui propose d'entrer
    // directement. L'échec est sans conséquence — le formulaire reste la voie
    // normale, et c'est la seule qui compte pour l'owner.
    adminService.getMe()
      .then((me) => setDelegateAccess(me.kind === 'delegate' && me.permissions.length > 0))
      .catch(() => setDelegateAccess(false));
  }, []);

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
    <div className="auth-page admin-login-page">
      <div className="auth-aurora" aria-hidden="true" />

      <button
        type="button"
        className="admin-login-back"
        onClick={() => navigate('/')}
        title="Retour à l'accueil"
      >
        ← Accueil
      </button>

      <motion.div
        className="admin-login-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <span className="auth-badge">Administration</span>
        <h1 className="auth-title admin-login-title">Accès administrateur</h1>
        <p className="admin-login-subtitle">
          Authentification indépendante d'OAuth&nbsp;42 : elle reste utilisable même si la
          connexion 42 ne fonctionne plus.
        </p>

        {error && (
          <div className="admin-error">
            <span>⚠️</span>
            <p>{error}</p>
          </div>
        )}

        {sansAcces && !error && (
          <div className="admin-info">
            <p>
              Votre compte&nbsp;42 n'a plus aucune zone d'administration ouverte. Contactez
              un administrateur si cela vous semble être une erreur.
            </p>
          </div>
        )}

        {delegateAccess && (
          <div className="admin-info">
            <p>
              Votre compte&nbsp;42 est <strong>délégué</strong> : vous pouvez entrer sans token,
              avec les zones qui vous ont été accordées.
            </p>
            <button type="button" className="auth-cta admin-login-cta" onClick={() => navigate('/admin')}>
              Ouvrir le panneau
            </button>
          </div>
        )}

        <form onSubmit={handleConsole} className="admin-form">
          <div className="admin-info">
            <p>
              Entrez le <strong>token console</strong> affiché dans les logs du serveur à chaque
              démarrage. Il donne accès à l'ensemble du panneau.
            </p>
          </div>
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
          <button type="submit" className="auth-cta admin-login-cta" disabled={busy || !consoleToken.trim()}>
            {busy ? 'Vérification…' : 'Valider'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default AdminLogin;
