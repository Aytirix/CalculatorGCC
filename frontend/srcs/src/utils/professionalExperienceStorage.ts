import type { ProfessionalExperience } from '@/pages/ProfessionalExperience/ProfessionalExperience';

const STORAGE_KEY = 'professional_experiences';

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
    const experiences = this.getAll();
    return experiences.reduce((sum, exp) => sum + exp.xpEarned, 0);
  },

  /**
   * Calcule le total d'XP réel (non simulé)
   */
  getRealXP(): number {
    const experiences = this.getAll();
    return experiences
      .filter(exp => !exp.isSimulation)
      .reduce((sum, exp) => sum + exp.xpEarned, 0);
  },

  /**
   * Calcule le total d'XP simulé
   */
  getSimulatedXP(): number {
    const experiences = this.getAll();
    return experiences
      .filter(exp => exp.isSimulation)
      .reduce((sum, exp) => sum + exp.xpEarned, 0);
  },

  /**
   * Compte le nombre total de mois d'expérience réelle
   * Stage: compte les mois directement
   * Alternance: 1 an = 12 mois
   */
  getRealMonths(): number {
    const experiences = this.getAll();
    return experiences
      .filter(exp => !exp.isSimulation)
      .reduce((sum, exp) => {
        if (exp.type === 'stage') {
          return sum + exp.duration; // duration est en mois
        } else {
          return sum + (exp.duration * 12); // duration est en années, converti en mois
        }
      }, 0);
  },

  /**
   * Compte le nombre d'expériences réelles (non simulées)
   */
  getRealCount(): number {
    const experiences = this.getAll();
    return experiences.filter(exp => !exp.isSimulation).length;
  },

  /**
   * Efface toutes les expériences
   */
  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
};
