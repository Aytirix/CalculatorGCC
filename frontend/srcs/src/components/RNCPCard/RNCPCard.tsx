import type { RNCP, RNCPValidation, SimulatorProject, CategoryValidation } from '@/types/rncp.types';
import CategorySection from '@/components/CategorySection/CategorySection';
import './RNCPCard.scss';

interface RNCPCardProps {
  rncp: RNCP;
  validation: RNCPValidation;
  userProgress: {
    currentLevel: number;
    events: number;
    /** Expériences comptées SIMULATION COMPRISE (stages prévus, en cours). */
    professionalExperience: number;
    /** Expériences réellement terminées. */
    realProfessionalExperience: number;
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
  // Le ✓ vert ne marque que l'acquis ; la projection s'affiche à part, en bleu.
  const hasRealProfessionalExperience =
    userProgress.realProfessionalExperience >= rncp.requiredProfessionalExperience;
  const hasProfessionalExperience = validation.isProfessionalExperienceValid;

  // Tout ce qui descend d'ici est indexé par IDENTIFIANT — `onToggleSimulation`,
  // `projectPercentages`, `simulatedProjects.includes(project.id)`. Les projets
  // acquis suivent la même convention.
  //
  // `completedProjects` est déjà le résultat de la question « ce projet est-il
  // acquis ? », tranchée en amont par `getCompletedProjects` avec les slugs bruts
  // de l'API 42 — la seule granularité où une piscine peut être jugée. Renvoyer
  // des slugs obligeait la feuille à reposer la question sans avoir les données
  // pour y répondre : elle recevait des slugs de PROJET là où une piscine exige
  // des slugs de MODULE, et les 7 piscines du référentiel ne s'affichaient plus
  // jamais validées. Avec des identifiants, la feuille n'a plus qu'à comparer.
  const completedProjectIds = completedProjects.map(p => p.id);
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
          <span
            className={`rncp-card__requirement-icon ${hasRealProfessionalExperience ? 'validated' : ''}${!hasRealProfessionalExperience && hasProfessionalExperience ? ' projected' : ''}`}
          >
            {hasRealProfessionalExperience ? '✓' : hasProfessionalExperience ? '◆' : '○'}
          </span>
          <span className="rncp-card__requirement-label">Exp. pro</span>
          <span className="rncp-card__requirement-value">
            <span className={hasRealProfessionalExperience ? 'validated' : ''}>
              {userProgress.realProfessionalExperience}
            </span>
            {/* Ce que la simulation ajouterait — stages prévus ou en cours, pas
                encore acquis — inséré AVANT le slash pour que le seuil à
                atteindre reste le dernier nombre lu. */}
            {userProgress.professionalExperience !== userProgress.realProfessionalExperience && (
              <span className="rncp-card__requirement-projected">
                {' '}→ {userProgress.professionalExperience}
              </span>
            )}
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
              completedProjectIds={completedProjectIds}
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
