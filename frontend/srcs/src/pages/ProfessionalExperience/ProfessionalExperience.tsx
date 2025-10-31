import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Header from '@/components/Header/Header';
import { Button } from '@/components/ui/button';
import AddExperienceModal from '@/components/AddExperienceModal/AddExperienceModal';
import ExperienceCard from '@/components/ExperienceCard/ExperienceCard';
import { professionalExperienceStorage } from '@/utils/professionalExperienceStorage';
import './ProfessionalExperience.scss';

export interface ProfessionalExperience {
  id: string;
  type: 'stage' | 'alternance';
  startDate: string;
  duration: number; // months for stage, years for alternance
  validationPercentage: number;
  coalitionBoost: number;
  isSimulation: boolean;
  xpEarned: number;
}

const ProfessionalExperience: React.FC = () => {
  const [experiences, setExperiences] = useState<ProfessionalExperience[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Charger les expériences depuis le localStorage au montage
  useEffect(() => {
    const loadedExperiences = professionalExperienceStorage.getAll();
    setExperiences(loadedExperiences);
  }, []);

  const handleAddExperience = (experience: Omit<ProfessionalExperience, 'id'>) => {
    const newExperience: ProfessionalExperience = {
      ...experience,
      id: Date.now().toString(),
    };
    const updatedExperiences = professionalExperienceStorage.add(newExperience);
    setExperiences(updatedExperiences);
    setIsModalOpen(false);
    // Forcer un rafraîchissement pour mettre à jour le niveau sur le dashboard
    window.dispatchEvent(new Event('storage'));
  };

  const handleDeleteExperience = (id: string) => {
    const updatedExperiences = professionalExperienceStorage.remove(id);
    setExperiences(updatedExperiences);
    // Forcer un rafraîchissement pour mettre à jour le niveau sur le dashboard
    window.dispatchEvent(new Event('storage'));
  };

  const totalXP = experiences.reduce((sum, exp) => sum + exp.xpEarned, 0);
  const simulationXP = experiences
    .filter(exp => exp.isSimulation)
    .reduce((sum, exp) => sum + exp.xpEarned, 0);
  const realXP = totalXP - simulationXP;

  return (
    <div className="professional-experience-page">
      <Header />
      <div className="professional-experience-container">
        <motion.div
          className="page-header"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1>Expérience professionnelle</h1>
          <Button onClick={() => setIsModalOpen(true)}>
            <span style={{ marginRight: '8px' }}>➕</span>
            Ajouter
          </Button>
        </motion.div>

        <motion.div
          className="xp-summary"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="xp-summary-card">
            <span className="xp-label">XP Total</span>
            <span className="xp-value">{totalXP.toLocaleString()} XP</span>
          </div>
          <div className="xp-summary-card">
            <span className="xp-label">XP Réel</span>
            <span className="xp-value real">{realXP.toLocaleString()} XP</span>
          </div>
          <div className="xp-summary-card">
            <span className="xp-label">XP Simulé</span>
            <span className="xp-value simulation">{simulationXP.toLocaleString()} XP</span>
          </div>
        </motion.div>

        <motion.div
          className="experiences-grid"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {experiences.length === 0 ? (
            <div className="empty-state">
              <p>Aucune expérience professionnelle ajoutée</p>
              <p className="empty-state-subtitle">
                Cliquez sur "Ajouter" pour simuler votre expérience
              </p>
            </div>
          ) : (
            experiences.map((experience, index) => (
              <ExperienceCard
                key={experience.id}
                experience={experience}
                index={index}
                onDelete={() => handleDeleteExperience(experience.id)}
              />
            ))
          )}
        </motion.div>
      </div>

      <AddExperienceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAdd={handleAddExperience}
      />
    </div>
  );
};

export default ProfessionalExperience;
