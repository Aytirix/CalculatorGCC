import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './ProjectPercentageModal.scss';

interface ProjectPercentageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (percentage: number) => void;
  projectName: string;
  currentPercentage: number;
}

const ProjectPercentageModal: React.FC<ProjectPercentageModalProps> = ({
  isOpen,
  onClose,
  onSave,
  projectName,
  currentPercentage,
}) => {
  const [percentage, setPercentage] = useState(currentPercentage);
  const [inputValue, setInputValue] = useState(currentPercentage.toString());

  useEffect(() => {
    setPercentage(currentPercentage);
    setInputValue(currentPercentage.toString());
  }, [currentPercentage, isOpen]);

  const handleSave = () => {
    const value = Math.max(50, Math.min(125, percentage));
    onSave(value);
    onClose();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setPercentage(Math.max(50, Math.min(125, numValue)));
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    setPercentage(value);
    setInputValue(value.toString());
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
          className="percentage-modal"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.9, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -20 }}
          transition={{ duration: 0.2 }}
        >
          <div className="modal-header">
            <h3>Modifier le pourcentage</h3>
            <button className="close-button" onClick={onClose}>
              ✕
            </button>
          </div>

          <div className="modal-body">
            <div className="project-info">
              <span className="project-label">Projet :</span>
              <span className="project-name">{projectName}</span>
            </div>

            <div className="percentage-control">
              <div className="percentage-display">
                <input
                  type="number"
                  className="percentage-input"
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  min="50"
                  max="125"
                  step="1"
                />
                <span className="percentage-symbol">%</span>
              </div>

              <div className="slider-container">
                <input
                  type="range"
                  className="percentage-slider"
                  value={percentage}
                  onChange={handleSliderChange}
                  min="50"
                  max="125"
                  step="1"
                />
                <div className="slider-labels">
                  <span>50%</span>
                  <span className={percentage === 100 ? 'highlight' : ''}>100%</span>
                  <span>125%</span>
                </div>
              </div>

              <div className="percentage-presets">
                <button
                  className={`preset-button ${percentage === 50 ? 'active' : ''}`}
                  onClick={() => {
                    setPercentage(50);
                    setInputValue('50');
                  }}
                >
                  50%
                </button>
                <button
                  className={`preset-button ${percentage === 75 ? 'active' : ''}`}
                  onClick={() => {
                    setPercentage(75);
                    setInputValue('75');
                  }}
                >
                  75%
                </button>
                <button
                  className={`preset-button ${percentage === 100 ? 'active' : ''}`}
                  onClick={() => {
                    setPercentage(100);
                    setInputValue('100');
                  }}
                >
                  100%
                </button>
                <button
                  className={`preset-button ${percentage === 125 ? 'active' : ''}`}
                  onClick={() => {
                    setPercentage(125);
                    setInputValue('125');
                  }}
                >
                  125%
                </button>
              </div>

              <div className="percentage-info">
                {percentage < 100 && (
                  <p className="info-text warning">
                    ⚠️ Le projet sera considéré comme partiellement complété
                  </p>
                )}
                {percentage === 100 && (
                  <p className="info-text success">
                    ✅ Le projet sera compté à 100% de sa valeur
                  </p>
                )}
                {percentage > 100 && (
                  <p className="info-text bonus">
                    🎉 Le projet aura une valeur bonifiée
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button className="cancel-button" onClick={onClose}>
              Annuler
            </button>
            <button className="save-button" onClick={handleSave}>
              Enregistrer
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ProjectPercentageModal;
