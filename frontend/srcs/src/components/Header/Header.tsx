import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, CalendarDays, GraduationCap, ListChecks, LogOut, Moon, Network, Search, Settings,
  Sparkles, Sun, Wrench, type LucideIcon,
} from 'lucide-react';
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
import CommandPalette from '@/components/CommandPalette/CommandPalette';
import { InstallBanner } from '@/components/InstallApp/InstallApp';
import './Header.scss';
import { formatLevel } from '@/services/xp.service';

/**
 * En-tête de l'application.
 * - PC (> 640 px) : marque, onglets (icône + libellé, icône seule sous 1100 px),
 *   recherche, nouveautés, thème, menu du compte.
 * - Téléphone (≤ 640 px) : barre du haut réduite (marque, recherche, compte) et
 *   BARRE DE NAVIGATION EN BAS, selon les conventions Android (Material) :
 *   5 destinations, icône + libellé, pastille sous l'icône de la page courante,
 *   au-dessus de la barre de gestes. Thème et nouveautés passent dans le menu
 *   du compte.
 * Une seule des deux navigations est rendue à la fois (`data-tour="header-nav"`
 * doit désigner un élément visible pour le guide).
 */

const NAV_ITEMS: { label: string; short: string; path: string; Icon: LucideIcon; tour?: string }[] = [
  { label: 'RNCP', short: 'RNCP', path: '/dashboard', Icon: GraduationCap },
  { label: 'Calendrier', short: 'Calendrier', path: '/calendar', Icon: CalendarDays, tour: 'nav-calendar' },
  { label: 'Mes projets', short: 'Projets', path: '/my-projects', Icon: ListChecks, tour: 'nav-my-projects' },
  { label: 'Holy Graph', short: 'Graph', path: '/holy-graph', Icon: Network, tour: 'nav-holy-graph' },
  { label: 'Stats', short: 'Stats', path: '/api-usage', Icon: Activity, tour: 'nav-stats' },
];

const PHONE_QUERY = '(max-width: 640px)';

function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE_QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia(PHONE_QUERY);
    const onChange = () => setPhone(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return phone;
}

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { viewingUser, clearViewingUser, isViewingOther } = useViewingUser();
  const { open: openChangelog } = useChangelog();
  const navigate = useNavigate();
  const location = useLocation();
  const isPhone = useIsPhone();
  const showBottomNav = isPhone && !!user;

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

  // La barre du bas recouvre le bas de la page : le contenu garde une marge
  // équivalente (variable --app-bottom-offset, aussi utilisée par les toasts).
  useEffect(() => {
    if (!showBottomNav) return;
    document.body.classList.add('has-bottom-nav');
    return () => document.body.classList.remove('has-bottom-nav');
  }, [showBottomNav]);

  const avatarSrc = isViewingOther && viewingUser?.imageUrl
    ? viewingUser.imageUrl
    : user?.image?.link || '/default-avatar.png';
  const displayLogin = isViewingOther ? viewingUser?.login : user?.login;

  return (
    <>
      <header className="app-header">
        {user && <InstallBanner />}

        {user?.is_admin && user?.credentials_invalid && (
          <div className="credentials-banner">
            <span>
              ⚠️ Les identifiants API&nbsp;42 ne fonctionnent plus — les utilisateurs ne peuvent plus se connecter. Mettez-les à jour.
            </span>
            <button className="credentials-banner-action" onClick={() => navigate('/admin')}>
              Mettre à jour →
            </button>
          </div>
        )}
        {user?.is_admin && !user?.credentials_invalid && user?.next_secret_missing && (
          <div className="credentials-banner credentials-banner--warning">
            <span>
              💡 Aucun «&nbsp;Next Secret&nbsp;42&nbsp;» n'est configuré. Ajoutez-en un pour préparer la prochaine rotation sans coupure.
            </span>
            <button className="credentials-banner-action" onClick={() => navigate('/admin')}>
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
          <button type="button" className="header-brand" onClick={() => navigate('/dashboard')} aria-label="CalculatorGCC — accueil">
            <img src="/icons/icon-192.png" alt="" width={32} height={32} className="header-brand__icon" />
            <span className="header-brand__name">Calculator<span>GCC</span></span>
          </button>

          {!isPhone && (
            // L'onglet courant est explicitement marqué : avec cinq pages, une
            // simple nuance de gris ne suffisait pas à savoir où l'on se trouve.
            <nav className="header-nav" data-tour="header-nav" aria-label="Navigation principale">
              {NAV_ITEMS.map(({ label, path, Icon, tour }) => {
                const active = location.pathname === path;
                return (
                  <button
                    key={path}
                    type="button"
                    className={`nav-link${active ? ' nav-link--active' : ''}`}
                    onClick={() => navigate(path)}
                    aria-current={active ? 'page' : undefined}
                    title={label}
                    {...(tour ? { 'data-tour': tour } : {})}
                  >
                    <Icon className="nav-link__icon" size={18} aria-hidden="true" />
                    <span className="nav-link__label">{label}</span>
                  </button>
                );
              })}
            </nav>
          )}

          <div className="header-actions">
            {/* Recherche universelle : loupe + Ctrl K. */}
            <button
              type="button"
              className="header-icon-btn header-search-btn"
              data-tour="header-search"
              onClick={() => setPaletteOpen(true)}
              title="Rechercher (Ctrl + K)"
              aria-label="Rechercher"
            >
              <Search size={18} aria-hidden="true" />
              <kbd>Ctrl K</kbd>
            </button>

            {!isPhone && (
              <>
                <button type="button" className="header-icon-btn header-changelog-btn" onClick={openChangelog} title="Nouveautés" aria-label="Voir les nouveautés">
                  <Sparkles size={18} aria-hidden="true" />
                  <span className="header-changelog-dot" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="header-icon-btn"
                  onClick={toggleTheme}
                  title={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
                  aria-label={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
                >
                  {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
                </button>
              </>
            )}

            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="user-menu-trigger" data-tour="user-menu-trigger" aria-label={`Compte de ${displayLogin ?? ''}`}>
                    <span className="user-avatar-container">
                      <img src={avatarSrc} alt="" className="user-avatar" />
                      {user.level && !isViewingOther && (
                        <span className="user-level-badge">{Math.floor(user.level)}</span>
                      )}
                    </span>
                    <span className="user-info">
                      <span className="user-login">{displayLogin}</span>
                      {user.level && !isViewingOther && (
                        <span className="user-level-text">Level {formatLevel(user.level)}</span>
                      )}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="user-menu-content">
                  {isPhone && (
                    <>
                      <DropdownMenuItem onClick={openChangelog} className="settings-item">
                        <Sparkles size={18} aria-hidden="true" />
                        <span>Nouveautés</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={toggleTheme} className="settings-item">
                        {theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
                        <span>{theme === 'dark' ? 'Thème clair' : 'Thème sombre'}</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {!isViewingOther && (
                    <>
                      <DropdownMenuItem onClick={() => navigate('/settings')} className="settings-item">
                        <Settings size={18} aria-hidden="true" />
                        <span>Paramètres du compte</span>
                      </DropdownMenuItem>
                      {/* Seul point d'entrée UI vers le panneau pour un délégué — sans ça,
                          il faudrait taper /admin à la main. Affiché UNIQUEMENT s'il reste
                          au moins une zone ouverte : un délégué dont toutes les cases ont
                          été décochées est encore enregistré, mais le lien ne le mènerait
                          que sur un panneau vide. */}
                      {(user.admin_permissions?.length ?? 0) > 0 && (
                        <DropdownMenuItem onClick={() => navigate('/admin')} className="settings-item">
                          <Wrench size={18} aria-hidden="true" />
                          <span>Panel admin</span>
                        </DropdownMenuItem>
                      )}
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="logout-item">
                    <LogOut size={18} aria-hidden="true" />
                    <span>Se déconnecter</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
      </header>

      {showBottomNav && (
        <nav className="bottom-nav" data-tour="header-nav" aria-label="Navigation principale">
          {NAV_ITEMS.map(({ label, short, path, Icon, tour }) => {
            const active = location.pathname === path;
            return (
              <button
                key={path}
                type="button"
                className={`bottom-nav__item${active ? ' is-active' : ''}`}
                onClick={() => navigate(path)}
                aria-current={active ? 'page' : undefined}
                aria-label={label}
                {...(tour ? { 'data-tour': tour } : {})}
              >
                <span className="bottom-nav__indicator" aria-hidden="true">
                  <Icon size={22} strokeWidth={active ? 2.4 : 2} />
                </span>
                <span className="bottom-nav__label" aria-hidden="true">{short}</span>
              </button>
            );
          })}
        </nav>
      )}
    </>
  );
};

export default Header;
