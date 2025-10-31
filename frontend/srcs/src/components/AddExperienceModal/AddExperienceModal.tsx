import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import StageForm from '@/components/StageForm/StageForm';
import AlternanceForm from '@/components/AlternanceForm/AlternanceForm';
import type { ProfessionalExperience } from '@/pages/ProfessionalExperience/ProfessionalExperience';
import './AddExperienceModal.scss';

interface AddExperienceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (experience: Omit<ProfessionalExperience, 'id'>) => void;
}

type ExperienceType = 'stage' | 'alternance' | null;

const AddExperienceModal: React.FC<AddExperienceModalProps> = ({ isOpen, onClose, onAdd }) => {
  const [selectedType, setSelectedType] = useState<ExperienceType>(null);

  const handleClose = () => {
    setSelectedType(null);
    onClose();
  };

  const handleAdd = (experience: Omit<ProfessionalExperience, 'id'>) => {
    onAdd(experience);
    setSelectedType(null);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="modal-overlay" onClick={handleClose}>
        <motion.div
          className="modal-content"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.3 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2>Ajouter une expérience professionnelle</h2>
            <button className="close-button" onClick={handleClose}>
              ✕
            </button>
          </div>

          <div className="modal-body">
            {selectedType === null ? (
              <div className="experience-type-selection">
                <p className="selection-prompt">Choisissez le type d'expérience :</p>
                <div className="type-buttons">
                  <Button
                    className="type-button stage"
                    onClick={() => setSelectedType('stage')}
                  >
                    <span className="icon">🎓</span>
                    <span className="label">Stage</span>
                    <span className="description">10 500 XP par mois</span>
                  </Button>
                  <Button
                    className="type-button alternance"
                    onClick={() => setSelectedType('alternance')}
                  >
                    <span className="icon">💼</span>
                    <span className="label">Alternance</span>
                    <span className="description">90 000 XP par an</span>
                  </Button>
                </div>
              </div>
            ) : selectedType === 'stage' ? (
              <StageForm
                onSubmit={handleAdd}
                onCancel={() => setSelectedType(null)}
              />
            ) : (
              <AlternanceForm
                onSubmit={handleAdd}
                onCancel={() => setSelectedType(null)}
              />
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default AddExperienceModal;
