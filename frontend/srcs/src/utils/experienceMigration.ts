import type { ProfessionalExperience } from '@/types/professionalExperience.types';

/**
 * Normalise les expériences venues du stockage ou du serveur.
 *
 * Le drapeau `isSimulation` était codé en dur à `false` dans les deux
 * formulaires et aucune interface n'a jamais proposé le choix : tout ce qui a été
 * saisi à la main avant l'interrupteur portait donc `false` SANS que personne ne
 * l'ait décidé. Or `realCount()` s'en sert pour compter les expériences
 * « réellement acquises », celles qui font passer au vert le prérequis RNCP —
 * une simulation validait la certification.
 *
 * On bascule donc ces enregistrements en simulation, une fois. `simulationExplicite`
 * protège les choix réels : une expérience marquée acquise par l'utilisateur n'est
 * jamais retouchée, sur aucun appareil.
 *
 * Fonction PURE et idempotente : appliquée à chaque entrée de liste dans
 * l'application, elle ne dépend d'aucun drapeau de navigateur — un marqueur en
 * localStorage aurait refait basculer les choix sur un second appareil.
 */
export function normaliserExperiences(
	liste: ProfessionalExperience[]
): ProfessionalExperience[] {
	return liste.map((exp) =>
		exp.simulationExplicite === true
			? exp
			: { ...exp, isSimulation: true, simulationExplicite: true }
	);
}
