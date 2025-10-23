import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import './Header.scss';

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleSettings = () => {
    navigate('/settings');
  };

  return (
    <header className="app-header">
      <div className="header-container">
        <motion.div
          className="logo"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1>42 XP Simulator</h1>
        </motion.div>

        <motion.div
          className="header-actions"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
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
                <DropdownMenuItem onClick={handleSettings}>
                  <span style={{ fontSize: '1.2rem' }}>⚙️</span>
                  <span>Paramètres</span>
                </DropdownMenuItem>
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
