// Type d'une expérience professionnelle saisie à la main (stage ou alternance).
//
// Il vivait dans `pages/ProfessionalExperience/ProfessionalExperience.tsx`, une
// page qu'AUCUN lien de l'application n'atteignait — route déclarée, jamais
// reliée au menu. Dix fichiers importaient donc leur type depuis un écran mort,
// et le doublon avec le Dashboard a coûté un bug silencieux : deux chemins
// d'écriture, deux défauts différents, aucun des deux ne sauvegardait en base.
// La page est supprimée ; le type, lui, est bien vivant.

import type { StageSubNotes, WorkExperienceLevel } from '@/utils/stageModel';

export interface ProfessionalExperience {
  id: string;
  type: 'stage' | 'alternance';
  startDate: string;
  duration: number; // months for stage, years for alternance
  validationPercentage: number;
  coalitionBoost: number;
  isSimulation: boolean;
  /**
   * L'utilisateur a-t-il RÉELLEMENT choisi la valeur d'`isSimulation` ci-dessus ?
   *
   * Sans ce marqueur, impossible de distinguer un `false` subi — le drapeau était
   * codé en dur dans les deux formulaires, aucune interface n'a jamais proposé le
   * choix — d'un `false` voulu, depuis que l'interrupteur existe. La migration
   * ferait alors basculer en « simulation » une expérience délibérément marquée
   * acquise, à chaque chargement et sur chaque appareil.
   *
   * Absent = enregistrement antérieur à l'interrupteur, à normaliser une fois.
   */
  simulationExplicite?: boolean;
  xpEarned: number;
  subNotes?: StageSubNotes; // stage : les 4 notes de sous-projets ayant servi à la prédiction
  predictedNote?: number;   // stage : note finale prédite (0-125)
  stageLevel?: WorkExperienceLevel; // stage : 1 = Work Experience I, 2 = II (absent ⇒ I, rétro-compat)
}
