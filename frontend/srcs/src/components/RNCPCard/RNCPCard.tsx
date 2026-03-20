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
  simulatedSubProjects?: Record<string, string[]>;
  onToggleSubProject?: (projectId: string, subProjectId: string) => void;
  projectPercentages?: Record<string, number>;
  completedProjectsPercentages?: Record<string, number>;
  onPercentageChange?: (projectId: string, percentage: number) => void;
  customProjects?: SimulatorProject[];
  onAddCustomProject?: () => void;
  onEditCustomProject?: (project: SimulatorProject) => void;
  onDeleteCustomProject?: (id: string) => void;
  projectNotes?: Record<string, string>;
  onSaveNote?: (projectId: string, note: string) => void;
  coalitionBoosts?: Record<string, boolean>;
  onToggleCoalitionBoost?: (projectId: string) => void;
}

const RNCPCard = ({ 
  rncp, 
  validation, 
  userProgress, 
  completedProjects, 
  simulatedProjects, 
  onToggleSimulation,
  simulatedSubProjects = {},
  onToggleSubProject,
  projectPercentages = {},
  completedProjectsPercentages = {},
  onPercentageChange,
  onAddCustomProject,
  onEditCustomProject,
  onDeleteCustomProject,
  projectNotes = {},
  onSaveNote,
  coalitionBoosts = {},
  onToggleCoalitionBoost
}: RNCPCardProps) => {
  const isFullyValidated = validation.overallValid;
  // Utiliser le niveau réel pour la validation, pas le niveau projeté
  const hasLevelRequirement = userProgress.currentLevel >= rncp.level;
  const hasEventsRequirement = validation.isEventsValid;
  const hasProfessionalExperience = validation.isProfessionalExperienceValid;

  // Convertir les projets en slugs pour CategorySection
  const completedProjectSlugs = completedProjects.map(p => p.slug || p.id);
  const simulatedProjectSlugs = simulatedProjects.map(p => p.slug || p.id);

  // Calculer le pourcentage de validation basé sur les résultats de validateRNCP
  const calculateValidationPercentage = (): number => {
    let totalCriteria = 0;
    let validatedCriteria = 0;

    // 1. Niveau
    totalCriteria++;
    if (validation.isLevelValid) validatedCriteria++;

    // 2. Événements
    totalCriteria++;
    if (validation.isEventsValid) validatedCriteria++;

    // 3. Expérience professionnelle
    totalCriteria++;
    if (validation.isProfessionalExperienceValid) validatedCriteria++;

    // 4. Catégories (2 critères par catégorie : nombre de projets + XP minimum)
    validation.categoriesValidation.forEach((catValidation: CategoryValidation) => {
      totalCriteria++;
      if (catValidation.currentCount >= catValidation.requiredCount) validatedCriteria++;

      totalCriteria++;
      if (catValidation.currentXP >= catValidation.requiredXP) validatedCriteria++;
    });

    return totalCriteria > 0 ? Math.round((validatedCriteria / totalCriteria) * 100) : 0;
  };

  const validationPercentage = calculateValidationPercentage();
  const isGlobalRNCP = rncp.id === 'rncp-global';

  return (
    <div className={`rncp-card ${isFullyValidated ? 'rncp-card--validated' : ''}`}>
      {/* Pourcentage de validation global - Ne pas afficher pour RNCP Global */}
      {!isGlobalRNCP && (
        <div className="rncp-card__validation-progress">
          <div className="rncp-card__validation-progress-bar">
            <div 
              className="rncp-card__validation-progress-fill" 
              style={{ width: `${validationPercentage}%` }}
            ></div>
          </div>
          <div className="rncp-card__validation-progress-text">
            <span className="rncp-card__validation-progress-label">Validation</span>
            <span className="rncp-card__validation-progress-value">
              {validationPercentage}%
            </span>
          </div>
        </div>
      )}

      {/* Prérequis en une ligne compacte - Ne pas afficher pour RNCP Global */}
      {!isGlobalRNCP && (
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
      )}

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
              simulatedSubProjects={simulatedSubProjects}
              onToggleSubProject={onToggleSubProject}
              projectPercentages={projectPercentages}
              completedProjectsPercentages={completedProjectsPercentages}
              onPercentageChange={onPercentageChange}
              isOtherProjectsCategory={category.id === 'other-projects'}
              onAddCustomProject={onAddCustomProject}
              onEditCustomProject={onEditCustomProject}
              onDeleteCustomProject={onDeleteCustomProject}
              projectNotes={projectNotes}
              onSaveNote={onSaveNote}
              coalitionBoosts={coalitionBoosts}
              onToggleCoalitionBoost={onToggleCoalitionBoost}
            />
          );
        })}
      </div>
    </div>
  );
};

export default RNCPCard;
