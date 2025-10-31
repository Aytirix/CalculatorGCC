import React, { useState } from 'react';
import { motion } from 'framer-motion';
import './CustomProjectCard.scss';

interface CustomProjectCardProps {
  id: string;
  name: string;
  xp: number;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

const CustomProjectCard: React.FC<CustomProjectCardProps> = ({
  id,
  name,
  xp,
  onEdit,
  onDelete,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDelete = () => {
    if (showDeleteConfirm) {
      onDelete(id);
    } else {
      setShowDeleteConfirm(true);
      // Auto-hide after 3 seconds
      setTimeout(() => setShowDeleteConfirm(false), 3000);
    }
  };

  return (
    <motion.div
      className="custom-project-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      <div className="project-main">
        <div className="project-header">
          <div className="project-status-icon">⭐</div>
          <div className="project-info">
            <h4 className="project-name">{name}</h4>
            <span className="project-xp">{xp.toLocaleString()} XP</span>
          </div>
        </div>

        <div className="project-actions">
          <button
            className="action-button edit-button"
            onClick={() => onEdit(id)}
            title="Modifier le projet"
          >
            ✏️
          </button>
          <button
            className={`action-button delete-button ${showDeleteConfirm ? 'confirm' : ''}`}
            onClick={handleDelete}
            title={showDeleteConfirm ? 'Cliquez pour confirmer' : 'Supprimer le projet'}
          >
            {showDeleteConfirm ? '✓' : '🗑️'}
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <motion.div
          className="delete-warning"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
        >
          Cliquez à nouveau pour confirmer la suppression
        </motion.div>
      )}
    </motion.div>
  );
};

export default CustomProjectCard;
