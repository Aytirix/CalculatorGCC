// Types pour les projets de l'API 42
export interface Project42 {
  id: number;
  name: string;
  slug: string;
  final_mark?: number;
  status: 'finished' | 'in_progress' | 'searching_a_group' | 'creating_group';
  validated?: boolean;
  project: {
    id: number;
    name: string;
    slug: string;
  };
  cursus_ids: number[];
  marked_at?: string;
  created_at: string;
  updated_at: string;
}

// Type pour un projet du simulateur
export interface SimulatorProject {
  id: string;
  name: string;
  xp: number;
  slug?: string;
  maxPercentage?: number;
  subProjects?: SimulatorProject[];
}

// Type pour une catégorie de projets
export interface ProjectCategory {
  id: string;
  name: string;
  requiredCount: number;
  requiredXP: number;
  projects: SimulatorProject[];
}

// Type pour un RNCP
export interface RNCP {
  id: string;
  name: string;
  level: number;
  requiredEvents: number;
  requiredProfessionalExperience: number;
  categories: ProjectCategory[];
}

// Type pour la progression d'un utilisateur
export interface UserProgress {
  currentLevel: number;
  currentXP: number;
  events: number;
  professionalExperience: number;
  completedProjects: string[]; // slugs des projets complétés
  simulatedProjects: string[]; // slugs des projets simulés
}

// Type pour le résultat de simulation
export interface SimulationResult {
  totalXP: number;
  projectedLevel: number;
  progressPercentage: number;
  missingXP: number;
}

// Type pour la validation d'un RNCP
export interface RNCPValidation {
  rncpId: string;
  isLevelValid: boolean;
  isEventsValid: boolean;
  isProfessionalExperienceValid: boolean;
  categoriesValidation: CategoryValidation[];
  /** Toutes les conditions remplies, SIMULATION COMPRISE. */
  overallValid: boolean;
  /** Toutes les conditions réellement acquises, sans la simulation. */
  overallRealValid: boolean;
}

export interface CategoryValidation {
  categoryId: string;
  requiredCount: number;
  /** Projets comptés, SIMULATION COMPRISE (c'est la projection). */
  currentCount: number;
  requiredXP: number;
  /** XP compté, SIMULATION COMPRISE. */
  currentXP: number;
  /** Vrai si la projection satisfait la catégorie — pas forcément acquis. */
  isValid: boolean;
  validatedProjects: string[];

  // --- Ce qui est réellement ACQUIS, sans aucune simulation ---
  // Une barre de progression et un libellé « validé » qui comptent le simulé
  // annoncent comme acquis ce qui ne l'est pas : ces trois champs permettent de
  // distinguer les deux à l'affichage.
  /** Projets réellement validés sur 42. */
  realCount: number;
  /** XP réellement acquis. */
  realXP: number;
  /** La catégorie est-elle validée SANS compter la simulation ? */
  isRealValid: boolean;
}

// Type pour les données de l'API 42 - Cursus User
export interface CursusUser {
  grade: string | null;
  level: number;
  skills: Skill[];
  blackholed_at: string | null;
  id: number;
  begin_at: string;
  end_at: string | null;
  cursus_id: number;
  has_coalition: boolean;
  user: {
    id: number;
    login: string;
    url: string;
  };
  cursus: {
    id: number;
    created_at: string;
    name: string;
    slug: string;
  };
}

export interface Skill {
  id: number;
  name: string;
  level: number;
}

// Type pour les événements de l'API 42
export interface Event42 {
  id: number;
  name: string;
  location: string;
  kind: string;
  max_people: number | null;
  nbr_subscribers: number;
  begin_at: string;
  end_at: string;
  campus_ids: number[];
  cursus_ids: number[];
  created_at: string;
  updated_at: string;
}

// Type pour l'expérience professionnelle
export interface Experience {
  id: number;
  company: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  duration_months?: number;
}
