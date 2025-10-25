import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import './ProjectContextMenu.scss';

interface ProjectContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onEditPercentage: () => void;
  projectName: string;
}

const ProjectContextMenu: React.FC<ProjectContextMenuProps> = ({
  x,
  y,
  onClose,
  onEditPercentage,
  projectName,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

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

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={menuRef}
      className="project-context-menu"
      style={{ top: y, left: x }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.1 }}
    >
      <div className="context-menu-header">
        <span className="project-name-truncate">{projectName}</span>
      </div>
      <div className="context-menu-divider" />
      <button
        className="context-menu-item"
        onClick={() => {
          onEditPercentage();
          onClose();
        }}
      >
        <span className="context-menu-icon">📊</span>
        <span>Modifier le pourcentage</span>
      </button>
    </motion.div>
  );
};

export default ProjectContextMenu;
