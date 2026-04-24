import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/useAuth';
import { useTheme } from '@/contexts/ThemeContext';
import { useTour } from '@/contexts/TourContext';
import { useViewingUser } from '@/contexts/useViewingUser';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { DEV_USERS, isDev } from '@/config/devUsers';
import { setDevTargetUserId, getDevTargetUserId } from '@/services/backend-api42.service';
import { simulationService, type UserSearchResult } from '@/services/simulation.service';
import './Header.scss';

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { hasSeenTour } = useTour();
  const { viewingUser, setViewingUser, clearViewingUser, isViewingOther } = useViewingUser();
  const [devUserId, setDevUserId] = useState<number>(getDevTargetUserId());
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogout = () => {
    clearViewingUser();
    logout();
    navigate('/');
  };

  // Debounce la recherche
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (q.trim().length === 0) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await simulationService.searchUsers(q.trim());
        setSearchResults(results);
        setShowDropdown(true);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  const handleSelectUser = useCallback((result: UserSearchResult) => {
    if (!result.isPublic) return;
    setSearchQuery('');
    setShowDropdown(false);
    setViewingUser({
      userId42: result.userId42,
      login: result.login,
      firstName: result.firstName,
      lastName: result.lastName,
      imageUrl: result.imageUrl,
    });
  }, [setViewingUser]);

  // Fermer le dropdown en cliquant ailleurs
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="app-header">
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

        {/* Recherche utilisateur */}
        <motion.div
          className="header-search"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          ref={searchRef}
        >
          <div className="search-input-wrapper">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="search-input"
              placeholder="Rechercher un utilisateur…"
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
            />
            {isSearching && <span className="search-spinner" />}
          </div>

          {showDropdown && searchResults.length > 0 && (
            <div className="search-dropdown">
              {searchResults.map((result) => (
                <div
                  key={result.userId42}
                  className={`search-result-item ${!result.isPublic ? 'search-result-private' : ''}`}
                  onClick={() => handleSelectUser(result)}
                  title={!result.isPublic ? 'Profil privé' : undefined}
                >
                  <img
                    src={result.imageUrl || '/default-avatar.png'}
                    alt={result.login}
                    className="search-result-avatar"
                  />
                  <div className="search-result-info">
                    <span className="search-result-login">{result.login}</span>
                    {(result.firstName || result.lastName) && (
                      <span className="search-result-name">
                        {[result.firstName, result.lastName].filter(Boolean).join(' ')}
                      </span>
                    )}
                  </div>
                  {!result.isPublic && (
                    <span className="search-result-lock" title="Profil privé">🔒</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {showDropdown && searchResults.length === 0 && !isSearching && searchQuery.trim().length > 0 && (
            <div className="search-dropdown">
              <div className="search-no-results">Aucun utilisateur trouvé</div>
            </div>
          )}
        </motion.div>

        <motion.div
          className="header-actions"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Navigation */}
          <div className="header-nav" data-tour="header-nav">
            <Button
              variant="ghost"
              onClick={() => navigate('/dashboard')}
              className="nav-button"
            >
              Projets
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate('/calendar')}
              className="nav-button"
              data-tour="nav-calendar"
            >
              Calendrier
            </Button>
          </div>

          {isDev && DEV_USERS.length > 0 && (
            <select
              className="dev-user-select"
              value={devUserId}
              onChange={async (e: React.ChangeEvent<HTMLSelectElement>) => {
                const id = Number(e.target.value);
                setDevUserId(id);
                setDevTargetUserId(id);
                try {
                  await simulationService.save({
                    simulatedProjects: [],
                    simulatedSubProjects: {},
                    customProjects: [],
                    manualExperiences: [],
                    apiExpPercentages: {},
                    hasSeenTour: hasSeenTour(),
                  });
                } catch {}
                localStorage.removeItem('simulated_projects');
                localStorage.removeItem('simulated_sub_projects');
                localStorage.removeItem('project_percentages');
                localStorage.removeItem('custom_projects');
                localStorage.removeItem('project_notes');
                localStorage.removeItem('coalition_boosts');
                localStorage.removeItem('api_exp_percentages');
                localStorage.removeItem('professional_experiences');
                localStorage.removeItem('user_data_cache');
                window.location.reload();
              }}
            >
              <option value={0}>Mon compte</option>
              {DEV_USERS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.login} ({u.id})
                </option>
              ))}
            </select>
          )}

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
    </header>
  );
};

export default Header;
