import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './AddCustomProjectModal.scss';

interface AddCustomProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, xp: number, percentage: number) => void;
  editProject?: { id: string; name: string; xp: number; percentage?: number } | null;
}

const AddCustomProjectModal: React.FC<AddCustomProjectModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editProject,
}) => {
  const [name, setName] = useState('');
  const [xp, setXp] = useState('');
  const [percentage, setPercentage] = useState('100');

  useEffect(() => {
    if (editProject) {
      setName(editProject.name);
      setXp(editProject.xp.toString());
      setPercentage((editProject.percentage || 100).toString());
    } else {
      setName('');
      setXp('');
      setPercentage('100');
    }
  }, [editProject, isOpen]);

  const handleSave = () => {
    const xpValue = parseInt(xp, 10);
    const percentageValue = parseInt(percentage, 10);
    if (name.trim() && xpValue > 0 && percentageValue >= 50 && percentageValue <= 125) {
      onSave(name.trim(), xpValue, percentageValue);
      setName('');
      setXp('');
      setPercentage('100');
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="modal-overlay" onClick={onClose}>
        <motion.div
          className="add-project-modal"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.9, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -20 }}
          transition={{ duration: 0.2 }}
        >
          <div className="modal-header">
            <h3>{editProject ? 'Modifier le projet' : 'Ajouter un projet personnalisé'}</h3>
            <button className="close-button" onClick={onClose}>
              ✕
            </button>
          </div>

          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="project-name">Nom du projet</label>
              <input
                id="project-name"
                type="text"
                className="text-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="ex: Mon Super Projet"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="project-xp">XP du projet</label>
              <input
                id="project-xp"
                type="number"
                className="number-input"
                value={xp}
                onChange={(e) => setXp(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="ex: 5000"
                min="1"
                step="100"
              />
            </div>

            <div className="form-group">
              <label htmlFor="project-percentage">Pourcentage de validation</label>
              <input
                id="project-percentage"
                type="number"
                className="number-input"
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="100"
                min="50"
                max="125"
                step="1"
              />
              <small className="field-hint">Entre 50% et 125%</small>
            </div>

            <div className="info-box">
              <p>
                ℹ️ Ce projet sera ajouté à la catégorie "Autres projets" et comptera pour
                votre simulation de niveau et de validation RNCP.
              </p>
            </div>
          </div>

          <div className="modal-footer">
            <button className="cancel-button" onClick={onClose}>
              Annuler
            </button>
            <button
              className="save-button"
              onClick={handleSave}
              disabled={
                !name.trim() || 
                !xp || 
                parseInt(xp, 10) <= 0 || 
                !percentage || 
                parseInt(percentage, 10) < 50 || 
                parseInt(percentage, 10) > 125
              }
            >
              {editProject ? 'Modifier' : 'Ajouter'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default AddCustomProjectModal;
