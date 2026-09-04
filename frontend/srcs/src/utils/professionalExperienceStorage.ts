import type { ProfessionalExperience } from '@/pages/ProfessionalExperience/ProfessionalExperience';

const STORAGE_KEY = 'professional_experiences';

/**
 * Calculs sur une LISTE d'expériences, indépendants du stockage.
 *
 * Le localStorage ne contient que MES expériences : quand on consulte le profil
 * d'un autre, ce sont les siennes qu'il faut additionner, pas celles du
 * navigateur. Toutes les vues passent donc par ces fonctions, en leur donnant
 * explicitement la liste à considérer.
 */
export const professionalExperienceMath = {
  totalXP(experiences: ProfessionalExperience[]): number {
    return experiences.reduce((sum, exp) => sum + exp.xpEarned, 0);
  },

  realXP(experiences: ProfessionalExperience[]): number {
    return experiences.filter(exp => !exp.isSimulation).reduce((sum, exp) => sum + exp.xpEarned, 0);
  },

  simulatedXP(experiences: ProfessionalExperience[]): number {
    return experiences.filter(exp => exp.isSimulation).reduce((sum, exp) => sum + exp.xpEarned, 0);
  },

  /** Mois d'expérience réelle (une alternance est comptée en années). */
  realMonths(experiences: ProfessionalExperience[]): number {
    return experiences
      .filter(exp => !exp.isSimulation)
      .reduce((sum, exp) => sum + (exp.type === 'stage' ? exp.duration : exp.duration * 12), 0);
  },

  /** Nombre d'expériences réelles — une alternance de 2 ans en vaut 2. */
  realCount(experiences: ProfessionalExperience[]): number {
    return experiences
      .filter(exp => !exp.isSimulation)
      .reduce((count, exp) => count + (exp.type === 'alternance' && exp.duration === 2 ? 2 : 1), 0);
  },
};

export const professionalExperienceStorage = {
  /**
   * Récupère toutes les expériences du localStorage
   */
  getAll(): ProfessionalExperience[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];
      return JSON.parse(data) as ProfessionalExperience[];
    } catch (error) {
      console.error('Error loading professional experiences:', error);
      return [];
    }
  },

  /**
   * Sauvegarde toutes les expériences dans le localStorage
   */
  saveAll(experiences: ProfessionalExperience[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(experiences));
    } catch (error) {
      console.error('Error saving professional experiences:', error);
    }
  },

  /**
   * Ajoute une nouvelle expérience
   */
  add(experience: ProfessionalExperience): ProfessionalExperience[] {
    const experiences = this.getAll();
    experiences.push(experience);
    this.saveAll(experiences);
    return experiences;
  },

  /**
   * Met à jour une expérience existante
   */
  update(experience: ProfessionalExperience): ProfessionalExperience[] {
    const experiences = this.getAll().map(exp => 
      exp.id === experience.id ? experience : exp
    );
    this.saveAll(experiences);
    return experiences;
  },

  /**
   * Supprime une expérience par son ID
   */
  remove(id: string): ProfessionalExperience[] {
    const experiences = this.getAll().filter(exp => exp.id !== id);
    this.saveAll(experiences);
    return experiences;
  },

  /**
   * Exporte les expériences en JSON
   */
  exportToJSON(): string {
    const experiences = this.getAll();
    return JSON.stringify(experiences, null, 2);
  },

  /**
   * Importe les expériences depuis un JSON
   */
  importFromJSON(jsonString: string): ProfessionalExperience[] {
    try {
      const experiences = JSON.parse(jsonString) as ProfessionalExperience[];
      
      // Validation basique
      if (!Array.isArray(experiences)) {
        throw new Error('Invalid format: expected an array');
      }

      // Valider chaque expérience
      experiences.forEach((exp, index) => {
        if (!exp.id || !exp.type || !exp.startDate || exp.xpEarned === undefined) {
          throw new Error(`Invalid experience at index ${index}`);
        }
      });

      this.saveAll(experiences);
      return experiences;
    } catch (error) {
      console.error('Error importing professional experiences:', error);
      throw error;
    }
  },

  /**
   * Calcule le total d'XP de toutes les expériences
   */
  getTotalXP(): number {
    return professionalExperienceMath.totalXP(this.getAll());
  },

  /**
   * Calcule le total d'XP réel (non simulé)
   */
  getRealXP(): number {
    return professionalExperienceMath.realXP(this.getAll());
  },

  /**
   * Calcule le total d'XP simulé
   */
  getSimulatedXP(): number {
    return professionalExperienceMath.simulatedXP(this.getAll());
  },

  /**
   * Compte le nombre total de mois d'expérience réelle
   * Stage: compte les mois directement
   * Alternance: 1 an = 12 mois
   */
  getRealMonths(): number {
    return professionalExperienceMath.realMonths(this.getAll());
  },

  /**
   * Compte le nombre d'expériences réelles (non simulées)
   * Pour l'alternance de 2 ans, compte comme 2 expériences professionnelles
   */
  getRealCount(): number {
    return professionalExperienceMath.realCount(this.getAll());
  },

  /**
   * Efface toutes les expériences
   */
  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
};
