import levelData from '../../public/level.json';
import { isProjectCompleted } from '@/utils/projectMatcher';
import type { SimulationResult, RNCP, ProjectCategory, RNCPValidation, CategoryValidation, SimulatorProject } from '@/types/rncp.types';

interface LevelData {
  lvl: number;
  xp: number;
}

const levels: LevelData[] = levelData as LevelData[];

export const xpService = {
  // Calculer l'XP total à partir du niveau
  getXPFromLevel: (level: number): number => {
    const floorLevel = Math.floor(level);
    const decimal = level - floorLevel;
    
    const currentLevelData = levels.find((l) => l.lvl === floorLevel);
    const nextLevelData = levels.find((l) => l.lvl === floorLevel + 1);

    if (!currentLevelData) return 0;
    if (!nextLevelData) return currentLevelData.xp;

    const xpDiff = nextLevelData.xp - currentLevelData.xp;
    return currentLevelData.xp + Math.floor(xpDiff * decimal);
  },

  // Calculer le niveau à partir de l'XP
  getLevelFromXP: (xp: number): number => {
    let level = 0;

    for (let i = 0; i < levels.length; i++) {
      if (xp >= levels[i].xp) {
        level = levels[i].lvl;

        // Calculer la progression vers le niveau suivant
        if (i < levels.length - 1) {
          const currentLevelXP = levels[i].xp;
          const nextLevelXP = levels[i + 1].xp;
          const xpDiff = nextLevelXP - currentLevelXP;
          const xpProgress = xp - currentLevelXP;
          const decimal = xpProgress / xpDiff;

          level += decimal;
        }
      } else {
        break;
      }
    }

    return level;
  },

  // Simuler l'ajout de projets et calculer le nouveau niveau
  simulateProjects: (currentLevel: number, projectsXP: number[]): SimulationResult => {
    const currentXP = xpService.getXPFromLevel(currentLevel);
    const additionalXP = projectsXP.reduce((sum, xp) => sum + xp, 0);
    const totalXP = currentXP + additionalXP;
    const projectedLevel = xpService.getLevelFromXP(totalXP);

    // Trouver l'XP nécessaire pour le prochain niveau entier
    const nextWholeLevel = Math.ceil(projectedLevel);
    const nextLevelData = levels.find((l) => l.lvl === nextWholeLevel);
    const missingXP = nextLevelData ? nextLevelData.xp - totalXP : 0;

    return {
      totalXP,
      projectedLevel,
      progressPercentage: ((projectedLevel / 21) * 100),
      missingXP: Math.max(0, missingXP),
    };
  },

  // Calculer l'XP total d'une liste de projets
  calculateTotalXP: (projects: SimulatorProject[]): number => {
    return projects.reduce((total, project) => {
      let projectXP = project.xp;
      
      // Si le projet a des sous-projets, on prend l'XP total du projet parent
      // car dans les données, l'XP est déjà le total
      if (project.subProjects && project.subProjects.length > 0) {
        // L'XP du projet parent est déjà la somme
        projectXP = project.xp;
      }
      
      return total + projectXP;
    }, 0);
  },

  // Valider un RNCP pour un utilisateur
  validateRNCP: (
    rncp: RNCP,
    userLevel: number,
    userEvents: number,
    userProfessionalExp: number,
    completedProjects: string[],
    simulatedProjects: string[]
  ): RNCPValidation => {
    const allValidatedProjects = [...completedProjects, ...simulatedProjects];

    // Valider le niveau
    const isLevelValid = userLevel >= rncp.level;

    // Valider les événements
    const isEventsValid = userEvents >= rncp.requiredEvents;

    // Valider l'expérience professionnelle
    const isProfessionalExperienceValid = userProfessionalExp >= rncp.requiredProfessionalExperience;

    // Valider chaque catégorie
    const categoriesValidation: CategoryValidation[] = rncp.categories.map((category) => {
      return xpService.validateCategory(category, allValidatedProjects);
    });

    // Le RNCP est valide si toutes les conditions sont remplies
    const overallValid =
      isLevelValid &&
      isEventsValid &&
      isProfessionalExperienceValid &&
      categoriesValidation.every((cv) => cv.isValid);

    return {
      rncpId: rncp.id,
      isLevelValid,
      isEventsValid,
      isProfessionalExperienceValid,
      categoriesValidation,
      overallValid,
    };
  },

  // Valider une catégorie
  validateCategory: (category: ProjectCategory, validatedProjects: string[]): CategoryValidation => {
    // Trouver les projets validés de cette catégorie
    const categoryValidatedProjects = category.projects.filter((project) => {
      const projectSlug = project.slug || project.id;
      // Utiliser la fonction de matching plus permissive
      return isProjectCompleted(projectSlug, validatedProjects);
    });

    const currentCount = categoryValidatedProjects.length;
    const currentXP = xpService.calculateTotalXP(categoryValidatedProjects);

    const isValid =
      currentCount >= category.requiredCount &&
      currentXP >= category.requiredXP;

    return {
      categoryId: category.id,
      requiredCount: category.requiredCount,
      currentCount,
      requiredXP: category.requiredXP,
      currentXP,
      isValid,
      validatedProjects: categoryValidatedProjects.map((p) => p.id),
    };
  },
};
