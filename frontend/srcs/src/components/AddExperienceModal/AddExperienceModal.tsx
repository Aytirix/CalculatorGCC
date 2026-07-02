import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import StageForm from '@/components/StageForm/StageForm';
import AlternanceForm from '@/components/AlternanceForm/AlternanceForm';
import type { ProfessionalExperience } from '@/pages/ProfessionalExperience/ProfessionalExperience';
import type { StageSubNotes } from '@/utils/stageModel';
import './AddExperienceModal.scss';

interface AddExperienceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (experience: Omit<ProfessionalExperience, 'id'>) => void;
  editingExperience?: ProfessionalExperience | null;
  initialType?: 'stage' | 'alternance';
  /** Vraies notes de sous-projets connues (API) : verrouillées dans le formulaire stage. */
  knownStageNotes?: Partial<StageSubNotes>;
}

type ExperienceType = 'stage' | 'alternance' | null;

const AddExperienceModal: React.FC<AddExperienceModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  editingExperience,
  initialType,
  knownStageNotes,
}) => {
  const [selectedType, setSelectedType] = useState<ExperienceType>(
    editingExperience?.type || initialType || null
  );

  const handleClose = () => {
    setSelectedType(initialType || null);
    onClose();
  };

  const handleAdd = (experience: Omit<ProfessionalExperience, 'id'>) => {
    onAdd(experience);
    setSelectedType(initialType || null);
  };

  // Réinitialiser le type sélectionné quand l'expérience en édition change
  React.useEffect(() => {
    if (editingExperience) {
      setSelectedType(editingExperience.type);
    } else {
      setSelectedType(initialType || null);
    }
  }, [editingExperience, initialType]);

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
            <h2>{editingExperience ? 'Modifier' : 'Ajouter'} une expérience professionnelle</h2>
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
                    <span className="description">XP prédit depuis les notes</span>
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
                initialValues={editingExperience}
                knownNotes={knownStageNotes}
              />
            ) : (
              <AlternanceForm
                onSubmit={handleAdd}
                onCancel={() => setSelectedType(null)}
                initialValues={editingExperience}
              />
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default AddExperienceModal;
