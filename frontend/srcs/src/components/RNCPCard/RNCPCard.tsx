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
  completedSubProjects?: Record<string, string[]>;
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
  completedSubProjects = {},
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
  // Utiliser le niveau réel pour la validation, pas le niveau projeté
  const hasLevelRequirement = userProgress.currentLevel >= rncp.level;
  const hasEventsRequirement = validation.isEventsValid;
  const hasProfessionalExperience = validation.isProfessionalExperienceValid;

  // `completedProjects` se compare par SLUG (c'est ce que renvoie l'API 42),
  // mais la simulation est indexée par IDENTIFIANT partout ailleurs
  // (`onToggleSimulation(project.id)`, `projectPercentages[project.id]`…).
  // Les convertir en slugs ici rendait `simulatedProjects.includes(project.id)`
  // toujours faux dès que les deux diffèrent : le projet restait affiché comme
  // non coché, sans bordure bleue, alors qu'il comptait bien dans le total.
  const completedProjectSlugs = completedProjects.map(p => p.slug || p.id);
  const simulatedProjectIds = simulatedProjects.map(p => p.id);

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

  /** Même décompte, mais SANS la simulation : ce qui est réellement acquis. */
  const calculateRealValidationPercentage = (): number => {
    let totalCriteria = 0;
    let validatedCriteria = 0;

    totalCriteria++;
    if (validation.isLevelValid) validatedCriteria++;
    totalCriteria++;
    if (validation.isEventsValid) validatedCriteria++;
    totalCriteria++;
    if (validation.isProfessionalExperienceValid) validatedCriteria++;

    validation.categoriesValidation.forEach((catValidation: CategoryValidation) => {
      totalCriteria++;
      if (catValidation.realCount >= catValidation.requiredCount) validatedCriteria++;
      totalCriteria++;
      if (catValidation.realXP >= catValidation.requiredXP) validatedCriteria++;
    });

    return totalCriteria > 0 ? Math.round((validatedCriteria / totalCriteria) * 100) : 0;
  };

  const validationPercentage = calculateValidationPercentage();
  const realValidationPercentage = calculateRealValidationPercentage();
  // Le segment simulé se pose SUR l'acquis, il n'en reprend pas la longueur.
  const simulatedValidationPercentage = Math.max(
    0,
    validationPercentage - realValidationPercentage
  );
  // Ne pas annoncer une projection identique à l'acquis une fois arrondie.
  const showProjection = validationPercentage !== realValidationPercentage;
  const isGlobalRNCP = rncp.id === 'rncp-global';

  // « Validé » ne se dit que d'un acquis : la carte ne prend son habit vert que
  // si le RNCP est réellement obtenu, pas seulement projeté.
  return (
    <div className={`rncp-card ${validation.overallRealValid ? 'rncp-card--validated' : ''}`}>
      {/* Pourcentage de validation global - Ne pas afficher pour RNCP Global */}
      {!isGlobalRNCP && (
        <div className="rncp-card__validation-progress">
          {/* Vert : ce qui est acquis. Bleu : ce que la simulation ajouterait. */}
          <div
            className="rncp-card__validation-progress-bar"
            role="img"
            aria-label={
              showProjection
                ? `${realValidationPercentage} % acquis, ${validationPercentage} % en comptant la simulation`
                : `${realValidationPercentage} % acquis`
            }
          >
            <div
              className="rncp-card__validation-progress-fill"
              style={{ width: `${realValidationPercentage}%` }}
            ></div>
            {simulatedValidationPercentage > 0 && (
              <div
                className="rncp-card__validation-progress-fill rncp-card__validation-progress-fill--simulated"
                style={{ width: `${simulatedValidationPercentage}%` }}
              ></div>
            )}
          </div>
          <div className="rncp-card__validation-progress-text">
            <span className="rncp-card__validation-progress-label">Validation</span>
            <span className="rncp-card__validation-progress-value">
              {realValidationPercentage}%
              {showProjection && (
                <span className="rncp-card__validation-progress-value--simulated">
                  {' '}→ {validationPercentage}%
                </span>
              )}
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
              simulatedProjects={simulatedProjectIds}
              onToggleSimulation={onToggleSimulation}
              completedSubProjects={completedSubProjects}
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
