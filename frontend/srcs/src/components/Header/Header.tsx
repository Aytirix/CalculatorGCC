import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/useAuth';
import { useTheme } from '@/contexts/ThemeContext';
import { useTour } from '@/contexts/TourContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { DEV_USERS, isDev } from '@/config/devUsers';
import { setDevTargetUserId, getDevTargetUserId } from '@/services/backend-api42.service';
import { simulationService } from '@/services/simulation.service';
import './Header.scss';

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { startTour } = useTour();
  const [devUserId, setDevUserId] = useState<number>(getDevTargetUserId());
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="app-header">
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

        <motion.div
          className="header-nav"
          data-tour="header-nav"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
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
        </motion.div>

        <motion.div
          className="header-actions"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          {isDev && DEV_USERS.length > 0 && (
            <select
              className="dev-user-select"
              value={devUserId}
              onChange={async (e: React.ChangeEvent<HTMLSelectElement>) => {
                const id = Number(e.target.value);
                setDevUserId(id);
                setDevTargetUserId(id);
                // Reset la simulation en DB pour repartir à zéro
                try {
                  await simulationService.save({
                    simulatedProjects: [],
                    simulatedSubProjects: {},
                    customProjects: [],
                    manualExperiences: [],
                    apiExpPercentages: {},
                  });
                } catch {}
                // Nettoyer tout le localStorage simulation
                localStorage.removeItem('simulated_projects');
                localStorage.removeItem('simulated_sub_projects');
                localStorage.removeItem('project_percentages');
                localStorage.removeItem('custom_projects');
                localStorage.removeItem('project_notes');
                localStorage.removeItem('coalition_boosts');
                localStorage.removeItem('api_exp_percentages');
                localStorage.removeItem('professional_experiences');
                localStorage.removeItem('user_data_cache');
                // Recharger pour refetch les données du nouvel utilisateur
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

          <button
            className="tour-guide-button"
            data-tour="guide-button"
            onClick={startTour}
            title="Voir le guide interactif"
            aria-label="Voir le guide interactif"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>Guide</span>
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
                <Button variant="ghost" className="user-menu-trigger">
                  <div className="user-avatar-container">
                    <img
                      src={user.image?.link || '/default-avatar.png'}
                      alt={user.login}
                      className="user-avatar"
                    />
                    {user.level && (
                      <span className="user-level-badge">{Math.floor(user.level)}</span>
                    )}
                  </div>
                  <div className="user-info">
                    <span className="user-login">{user.login}</span>
                    {user.level && (
                      <span className="user-level-text">Level {user.level.toFixed(2)}</span>
                    )}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="user-menu-content">
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
