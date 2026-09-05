import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/useAuth';
import { useTheme } from '@/contexts/ThemeContext';
import { useViewingUser } from '@/contexts/useViewingUser';
import { useChangelog } from '@/contexts/useChangelog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import CommandPalette from '@/components/CommandPalette/CommandPalette';
import './Header.scss';

/** Pages principales, dans l'ordre du parcours d'un utilisateur. */
const NAV_ITEMS: { label: string; path: string; icon: string; tour?: string }[] = [
  { label: 'Projets', path: '/dashboard', icon: '◎' },
  { label: 'Mes projets', path: '/my-projects', icon: '☰' },
  { label: 'Holy Graph', path: '/holy-graph', icon: '✳' },
  { label: 'Calendrier', path: '/calendar', icon: '▤', tour: 'nav-calendar' },
  { label: 'Conso API', path: '/api-usage', icon: '⚡' },
];

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { viewingUser, clearViewingUser, isViewingOther } = useViewingUser();
  const { open: openChangelog } = useChangelog();
  const navigate = useNavigate();
  const location = useLocation();

  const [paletteOpen, setPaletteOpen] = useState(false);

  const handleLogout = () => {
    clearViewingUser();
    logout();
    navigate('/');
  };

  // Raccourci global : Ctrl/⌘ + K ouvre la recherche depuis n'importe quelle page.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <header className="app-header">
      {user?.is_admin && user?.credentials_invalid && (
        <div className="credentials-banner">
          <span>
            ⚠️ Les identifiants API&nbsp;42 ne fonctionnent plus — les utilisateurs ne peuvent plus se connecter. Mettez-les à jour.
          </span>
          <button
            className="credentials-banner-action"
            onClick={() => navigate('/setup')}
          >
            Mettre à jour →
          </button>
        </div>
      )}
      {user?.is_admin && !user?.credentials_invalid && user?.next_secret_missing && (
        <div className="credentials-banner credentials-banner--warning">
          <span>
            💡 Aucun «&nbsp;Next Secret&nbsp;42&nbsp;» n'est configuré. Ajoutez-en un pour préparer la prochaine rotation sans coupure.
          </span>
          <button
            className="credentials-banner-action"
            onClick={() => navigate('/setup')}
          >
            Ajouter →
          </button>
        </div>
      )}
      {isViewingOther && viewingUser && (
        <div className="viewing-banner">
          <span>
            Vous consultez le profil de <strong>{viewingUser.login}</strong> — lecture seule
          </span>
          <button
            className="viewing-banner-close"
            onClick={() => {
              clearViewingUser();
              navigate('/dashboard');
            }}
          >
            Retour à mon profil ×
          </button>
        </div>
      )}

      <div className="header-container">
        {/* Changelog — tout à gauche */}
        <button
          className="changelog-nav-btn"
          onClick={openChangelog}
          title="Voir les nouveautés"
        >
          <span className="changelog-nav-dot" />
          Changelog
        </button>

        <motion.div
          className="logo"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          onClick={() => navigate('/dashboard')}
          style={{ cursor: 'pointer' }}
        >
          <h1>CalculatorGCC</h1>
        </motion.div>

        <motion.div
          className="header-actions"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Navigation — l'onglet courant est explicitement marqué : avec cinq
              pages, la seule différence de teinte ne suffisait plus à savoir
              où on se trouve. */}
          <nav className="header-nav" data-tour="header-nav">
            {NAV_ITEMS.map((item) => {
              const active = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  type="button"
                  className={`nav-link${active ? ' nav-link--active' : ''}`}
                  onClick={() => navigate(item.path)}
                  aria-current={active ? 'page' : undefined}
                  {...(item.tour ? { 'data-tour': item.tour } : {})}
                >
                  <span className="nav-link__icon" aria-hidden="true">{item.icon}</span>
                  <span className="nav-link__label">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Recherche universelle : une loupe plutôt qu'un champ, et Ctrl+K. */}
          <button
            type="button"
            className="header-search-btn"
            onClick={() => setPaletteOpen(true)}
            title="Rechercher (Ctrl + K)"
            aria-label="Rechercher"
          >
            <span aria-hidden="true">⌕</span>
            <kbd>Ctrl K</kbd>
          </button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="theme-toggle"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </Button>

          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="user-menu-trigger" data-tour="user-menu-trigger">
                  <div className="user-avatar-container">
                    <img
                      src={
                        isViewingOther && viewingUser?.imageUrl
                          ? viewingUser.imageUrl
                          : user.image?.link || '/default-avatar.png'
                      }
                      alt={isViewingOther ? viewingUser?.login : user.login}
                      className="user-avatar"
                    />
                    {user.level && !isViewingOther && (
                      <span className="user-level-badge">{Math.floor(user.level)}</span>
                    )}
                  </div>
                  <div className="user-info">
                    <span className="user-login">
                      {isViewingOther ? viewingUser?.login : user.login}
                    </span>
                    {user.level && !isViewingOther && (
                      <span className="user-level-text">Level {user.level.toFixed(2)}</span>
                    )}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="user-menu-content">
                {!isViewingOther && (
                  <>
                    <DropdownMenuItem onClick={() => navigate('/settings')} className="settings-item">
                      <span style={{ fontSize: '1.2rem' }}>⚙️</span>
                      <span>Paramètres du compte</span>
                    </DropdownMenuItem>
                    {/* Admin délégué : seul point d'entrée UI vers la reconfiguration des
                        secrets 42 — sans ça, il fallait taper /setup à la main. Les délégués
                        n'ont accès qu'à ça ; le panneau owner (passkeys, délégués) vit sur
                        /admin et s'authentifie hors OAuth 42. */}
                    {user.is_admin && (
                      <DropdownMenuItem onClick={() => navigate('/setup')} className="settings-item">
                        <span style={{ fontSize: '1.2rem' }}>🔧</span>
                        <span>Identifiants API 42</span>
                      </DropdownMenuItem>
                    )}
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="logout-item">
                  <span style={{ fontSize: '1.2rem' }}>🚪</span>
                  <span>Se déconnecter</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </motion.div>
      </div>

      <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  );
};

export default Header;
