import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import type { ProfessionalExperience } from '@/pages/ProfessionalExperience/ProfessionalExperience';
import './ExperienceCard.scss';

interface ExperienceCardProps {
  experience: ProfessionalExperience;
  index: number;
  onDelete: () => void;
  onEdit: () => void;
}

const ExperienceCard: React.FC<ExperienceCardProps> = ({ experience, index, onDelete, onEdit }) => {
  const formatDate = (dateString: string) => {
    if (!dateString) return 'Non spécifiée';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' });
  };

  const getEndDate = () => {
    if (!experience.startDate) return 'Non spécifiée';
    const startDate = new Date(experience.startDate);
    if (experience.type === 'stage') {
      startDate.setMonth(startDate.getMonth() + experience.duration);
    } else {
      startDate.setFullYear(startDate.getFullYear() + experience.duration);
    }
    return formatDate(startDate.toISOString());
  };

  const getDurationText = () => {
    if (experience.type === 'stage') {
      return `${experience.duration} mois`;
    } else {
      return `${experience.duration} an${experience.duration > 1 ? 's' : ''}`;
    }
  };

  return (
    <motion.div
      className={`experience-card ${experience.type} ${experience.isSimulation ? 'simulation' : ''}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
    >
      <div className="card-header">
        <div className="card-type">
          <span className="type-icon">
            {experience.type === 'stage' ? '🎓' : '💼'}
          </span>
          <span className="type-label">
            {experience.type === 'stage' ? 'Stage' : 'Alternance'}
          </span>
        </div>
        {experience.isSimulation && (
          <span className="simulation-badge">
            🔮 Simulation
          </span>
        )}
        <div className="card-actions">
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            className="edit-button"
            title="Modifier"
          >
            ✏️
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="delete-button"
            title="Supprimer"
          >
            🗑️
          </Button>
        </div>
      </div>

      <div className="card-body">
        {experience.startDate && (
          <div className="info-row">
            <span className="info-label">📅 Période</span>
            <span className="info-value">
              {formatDate(experience.startDate)} - {getEndDate()}
            </span>
          </div>
        )}

        <div className="info-row">
          <span className="info-label">⏱️ Durée</span>
          <span className="info-value">{getDurationText()}</span>
        </div>

        <div className="info-row">
          <span className="info-label">✅ Validation</span>
          <span className="info-value">{experience.validationPercentage}%</span>
        </div>

        {experience.coalitionBoost > 0 && (
          <div className="info-row">
            <span className="info-label">🚀 Boost coalition</span>
            <span className="info-value boost">+{experience.coalitionBoost.toFixed(1)}%</span>
          </div>
        )}

        <div className="xp-display">
          <span className="xp-label">XP gagné</span>
          <span className="xp-value">{experience.xpEarned.toLocaleString()} XP</span>
        </div>
      </div>
    </motion.div>
  );
};

export default ExperienceCard;
