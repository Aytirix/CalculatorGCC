import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Header from '@/components/Header/Header';
import { Button } from '@/components/ui/button';
import AddExperienceModal from '@/components/AddExperienceModal/AddExperienceModal';
import ExperienceCard from '@/components/ExperienceCard/ExperienceCard';
import { professionalExperienceStorage } from '@/utils/professionalExperienceStorage';
import { simulationService } from '@/services/simulation.service';
import './ProfessionalExperience.scss';

import type { StageSubNotes, WorkExperienceLevel } from '@/utils/stageModel';

export interface ProfessionalExperience {
  id: string;
  type: 'stage' | 'alternance';
  startDate: string;
  duration: number; // months for stage, years for alternance
  validationPercentage: number;
  coalitionBoost: number;
  isSimulation: boolean;
  xpEarned: number;
  subNotes?: StageSubNotes; // stage : les 4 notes de sous-projets ayant servi à la prédiction
  predictedNote?: number;   // stage : note finale prédite (0-125)
  stageLevel?: WorkExperienceLevel; // stage : 1 = Work Experience I, 2 = II (absent ⇒ I, rétro-compat)
}

const ProfessionalExperience: React.FC = () => {
  const [experiences, setExperiences] = useState<ProfessionalExperience[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExperience, setEditingExperience] = useState<ProfessionalExperience | null>(null);
  const [erreurSauvegarde, setErreurSauvegarde] = useState<string | null>(null);

  // Charger les expériences depuis le localStorage au montage
  useEffect(() => {
    const loadedExperiences = professionalExperienceStorage.getAll();
    setExperiences(loadedExperiences);
  }, []);

  /**
   * Écrit la liste en BASE, pas seulement dans le navigateur.
   *
   * Sans cet appel, toute modification faite ici était perdue au rafraîchissement :
   * la page n'écrivait que dans le localStorage, et le Dashboard — qui recharge la
   * simulation depuis la base à chaque visite — réécrasait l'édition par la copie
   * serveur. Un stage revenait à 115 %, une alternance à 120 %.
   *
   * Route DÉDIÉE : `simulationService.save()` remplace la simulation entière et
   * viderait les projets simulés, que cette page ne connaît pas.
   *
   * En cas d'échec on garde l'affichage local — l'utilisateur voit son édition —
   * mais on le dit, sans quoi il repartirait en croyant avoir sauvegardé.
   */
  const persister = async (liste: ProfessionalExperience[]) => {
    setErreurSauvegarde(null);
    try {
      await simulationService.saveManualExperiences(liste);
    } catch (error) {
      console.error('[ExpérienceProfessionnelle] Sauvegarde en base échouée :', error);
      setErreurSauvegarde(
        "Modification enregistrée sur cet appareil seulement : le serveur n'a pas répondu. Elle sera perdue au prochain chargement."
      );
    }
  };

  const handleAddExperience = (experience: Omit<ProfessionalExperience, 'id'>) => {
    if (editingExperience) {
      // Mode édition
      const updatedExperience: ProfessionalExperience = {
        ...experience,
        id: editingExperience.id,
      };
      const updatedExperiences = professionalExperienceStorage.update(updatedExperience);
      setExperiences(updatedExperiences);
      setEditingExperience(null);
      void persister(updatedExperiences);
    } else {
      // Mode ajout
      const newExperience: ProfessionalExperience = {
        ...experience,
        id: Date.now().toString(),
      };
      const updatedExperiences = professionalExperienceStorage.add(newExperience);
      setExperiences(updatedExperiences);
      void persister(updatedExperiences);
    }
    setIsModalOpen(false);
    // Forcer un rafraîchissement pour mettre à jour le niveau sur le dashboard
    window.dispatchEvent(new Event('storage'));
  };

  const handleEditExperience = (experience: ProfessionalExperience) => {
    setEditingExperience(experience);
    setIsModalOpen(true);
  };

  const handleDeleteExperience = (id: string) => {
    const updatedExperiences = professionalExperienceStorage.remove(id);
    setExperiences(updatedExperiences);
    void persister(updatedExperiences);
    // Forcer un rafraîchissement pour mettre à jour le niveau sur le dashboard
    window.dispatchEvent(new Event('storage'));
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingExperience(null);
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

        {erreurSauvegarde && (
          <div className="save-error" role="alert">
            ⚠️ {erreurSauvegarde}
          </div>
        )}

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
                onEdit={() => handleEditExperience(experience)}
                onDelete={() => handleDeleteExperience(experience.id)}
              />
            ))
          )}
        </motion.div>
      </div>

      <AddExperienceModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onAdd={handleAddExperience}
        editingExperience={editingExperience}
      />
    </div>
  );
};

export default ProfessionalExperience;
