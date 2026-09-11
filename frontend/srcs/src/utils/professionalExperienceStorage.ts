import type { ProfessionalExperience } from '@/types/professionalExperience.types';
import { normaliserExperiences } from './experienceMigration';
import { nombreExperiences } from './experienceCount';

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

  /**
   * Nombre d'expériences réelles : une alternance compte pour son nombre
   * d'ANNÉES, un stage pour une expérience.
   *
   * C'est la règle appliquée aux expériences venues de l'API 42 (`Dashboard`
   * extrait « N an(s) » du nom et ajoute N). Le formulaire ne propose
   * aujourd'hui que 1 ou 2 ans, donc les deux formulations coïncident — mais
   * les écrire différemment de part et d'autre garantissait qu'elles finiraient
   * par diverger.
   */
  realCount(experiences: ProfessionalExperience[]): number {
    return experiences
      .filter(exp => !exp.isSimulation)
      .reduce((count, exp) => count + nombreExperiences(exp.type === 'alternance', exp.duration), 0);
  },

  /**
   * Le décompte de TOUTES les expériences, acquises et simulées confondues.
   *
   * Ce n'est pas `experiences.length` : une alternance de deux ans vaut deux
   * expériences professionnelles au sens du RNCP. L'en-tête du tableau de bord
   * annonçait la longueur du tableau, et affichait donc « 1 expérience » au-dessus
   * d'un calcul qui en comptait deux.
   */
  count(experiences: ProfessionalExperience[]): number {
    return experiences.reduce(
      (count, exp) => count + nombreExperiences(exp.type === 'alternance', exp.duration),
      0
    );
  },

  /** Le miroir exact de `realCount`, pour les expériences SIMULÉES. */
  simulatedCount(experiences: ProfessionalExperience[]): number {
    return experiences
      .filter(exp => exp.isSimulation)
      .reduce((count, exp) => count + nombreExperiences(exp.type === 'alternance', exp.duration), 0);
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
      // Normalisé à la LECTURE : les enregistrements antérieurs à l'interrupteur
      // portent un `isSimulation: false` que personne n'a choisi.
      return normaliserExperiences(JSON.parse(data) as ProfessionalExperience[]);
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
   * Les accesseurs `exportToJSON`, `importFromJSON`, `getTotalXP`, `getRealXP`,
   * `getSimulatedXP`, `getRealMonths`, `getRealCount` et `clear` ont été retirés :
   * aucun appelant depuis la suppression de la page « Expérience professionnelle ».
   *
   * `importFromJSON` était le plus dangereux : il appelait `saveAll()` sans jamais
   * persister en base — c'était littéralement un troisième chemin d'écriture,
   * inatteignable mais prêt à rejouer le bug que ce travail vient de corriger.
   * Les calculs restent disponibles par `professionalExperienceMath`, qui prend la
   * liste en argument et fonctionne donc aussi pour le profil d'un autre.
   */
};
