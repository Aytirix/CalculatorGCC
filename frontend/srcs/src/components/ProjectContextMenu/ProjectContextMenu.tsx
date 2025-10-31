import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import './ProjectContextMenu.scss';

interface ProjectContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onEditPercentage: () => void;
  onEditNote: () => void;
  projectName: string;
  isCompleted: boolean;
  hasCoalitionBoost?: boolean;
  onToggleCoalitionBoost?: () => void;
}

const ProjectContextMenu: React.FC<ProjectContextMenuProps> = ({
  x,
  y,
  onClose,
  onEditPercentage,
  onEditNote,
  projectName,
  isCompleted,
  hasCoalitionBoost = false,
  onToggleCoalitionBoost,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState({ x, y });

  // Ajuster la position du menu pour qu'il reste dans l'écran
  useEffect(() => {
    if (menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      // Ajuster horizontalement si le menu sort à droite
      if (x + menuRect.width > viewportWidth) {
        adjustedX = viewportWidth - menuRect.width - 10;
      }

      // Ajuster verticalement si le menu sort en bas
      if (y + menuRect.height > viewportHeight) {
        adjustedY = y - menuRect.height;
        // Si ça sort toujours, le positionner en haut
        if (adjustedY < 0) {
          adjustedY = 10;
        }
      }

      setPosition({ x: adjustedX, y: adjustedY });
    }
  }, [x, y]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    // Fermer le menu lors du scroll
    const handleScroll = () => {
      onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', handleScroll, true); // true = capture phase

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={menuRef}
      className="project-context-menu"
      style={{ top: position.y, left: position.x }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
    >
      <div className="context-menu-header">
        <span className="project-name-truncate">{projectName}</span>
      </div>
      
      {/* Toggle Boost Coalitions */}
      {onToggleCoalitionBoost && (
        <>
          <div className="context-menu-toggle">
            <div className="toggle-content">
              <span className="toggle-icon">🏆</span>
              <div className="toggle-info">
                <span className="toggle-label">Boost Coalitions</span>
                <span className="toggle-description">+4.2% XP</span>
              </div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={hasCoalitionBoost}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggleCoalitionBoost();
                }}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <div className="context-menu-divider" />
        </>
      )}
      
      <button
        className={`context-menu-item ${isCompleted ? 'disabled' : ''}`}
        onClick={() => {
          if (!isCompleted) {
            onEditPercentage();
            onClose();
          }
        }}
        disabled={isCompleted}
        title={isCompleted ? 'Projet validé via l\'API 42 - modification désactivée' : 'Modifier le pourcentage'}
      >
        <span className="context-menu-icon">📊</span>
        <span>Modifier le pourcentage</span>
      </button>
      <button
        className="context-menu-item"
        onClick={() => {
          onEditNote();
          onClose();
        }}
      >
        <span className="context-menu-icon">📝</span>
        <span>Ajouter/modifier une note</span>
      </button>
    </motion.div>
  );
};

export default ProjectContextMenu;
