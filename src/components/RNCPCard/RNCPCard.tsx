import type { RNCP, RNCPValidation, SimulatorProject, CategoryValidation } from '@/types/rncp.types';
import CategorySection from '@/components/CategorySection/CategorySection';
import './RNCPCard.scss';

interface RNCPCardProps {
  rncp: RNCP;
  validation: RNCPValidation;
  userProgress: {
    currentLevel: number;
    events: number;
    professionalExperience: number;
  };
  completedProjects: SimulatorProject[];
  simulatedProjects: SimulatorProject[];
  onToggleSimulation: (projectId: string) => void;
}

const RNCPCard = ({ rncp, validation, userProgress, completedProjects, simulatedProjects, onToggleSimulation }: RNCPCardProps) => {
  const isFullyValidated = validation.overallValid;
  const hasLevelRequirement = validation.isLevelValid;
  const hasEventsRequirement = validation.isEventsValid;
  const hasProfessionalExperience = validation.isProfessionalExperienceValid;

  // Convertir les projets en slugs pour CategorySection
  const completedProjectSlugs = completedProjects.map(p => p.slug || p.id);
  const simulatedProjectSlugs = simulatedProjects.map(p => p.slug || p.id);

  return (
    <div className={`rncp-card ${isFullyValidated ? 'rncp-card--validated' : ''}`}>
      {/* Prérequis en une ligne compacte */}
      <div className="rncp-card__requirements">
        <div className="rncp-card__requirement-item">
          <span className={`rncp-card__requirement-icon ${hasLevelRequirement ? 'validated' : ''}`}>
            {hasLevelRequirement ? '✓' : '○'}
          </span>
          <span className="rncp-card__requirement-label">Niveau</span>
          <span className="rncp-card__requirement-value">
            <span className={hasLevelRequirement ? 'validated' : ''}>
              {userProgress.currentLevel.toFixed(2)}
            </span>
            {' / '}
            {rncp.level}
          </span>
        </div>

        <div className="rncp-card__requirement-item">
          <span className={`rncp-card__requirement-icon ${hasEventsRequirement ? 'validated' : ''}`}>
            {hasEventsRequirement ? '✓' : '○'}
          </span>
          <span className="rncp-card__requirement-label">Événements</span>
          <span className="rncp-card__requirement-value">
            <span className={hasEventsRequirement ? 'validated' : ''}>
              {userProgress.events}
            </span>
            {' / '}
            {rncp.requiredEvents}
          </span>
        </div>

        <div className="rncp-card__requirement-item">
          <span className={`rncp-card__requirement-icon ${hasProfessionalExperience ? 'validated' : ''}`}>
            {hasProfessionalExperience ? '✓' : '○'}
          </span>
          <span className="rncp-card__requirement-label">Exp. pro</span>
          <span className="rncp-card__requirement-value">
            <span className={hasProfessionalExperience ? 'validated' : ''}>
              {userProgress.professionalExperience}
            </span>
            {' / '}
            {rncp.requiredProfessionalExperience}
          </span>
        </div>
      </div>

      {/* Catégories */}
      <div className="rncp-card__categories">
        {rncp.categories.map((category) => {
          const categoryValidation = validation.categoriesValidation.find(
            (cv: CategoryValidation) => cv.categoryId === category.id
          );

          if (!categoryValidation) return null;

          return (
            <CategorySection
              key={category.id}
              category={category}
              validation={categoryValidation}
              completedProjects={completedProjectSlugs}
              simulatedProjects={simulatedProjectSlugs}
              onToggleSimulation={onToggleSimulation}
            />
          );
        })}
      </div>
    </div>
  );
};

export default RNCPCard;
