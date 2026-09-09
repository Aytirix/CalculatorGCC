import levelData from '../../public/level.json';
import { isProjectCompleted, findProjectPercentage } from '@/utils/projectMatcher';
import { clampProjectPercentage } from '@/utils/projectPercentage';
import type { SimulationResult, RNCP, ProjectCategory, RNCPValidation, CategoryValidation, SimulatorProject } from '@/types/rncp.types';

interface LevelData {
	lvl: number;
	xp: number;
}

const levels: LevelData[] = levelData as LevelData[];

/**
 * Les modules d'une piscine que l'école compte encore.
 *
 * Cette règle vivait recopiée dans cinq fichiers, et elle a divergé deux fois :
 * l'écran comptait les modules retirés pendant que le calcul RNCP les ignorait,
 * dans un sens puis dans l'autre. Une seule définition, importée partout.
 */
export function activeSubProjects(project: SimulatorProject): SimulatorProject[] {
	return (project.subProjects ?? []).filter((sub) => !sub.retired);
}

/**
 * Une piscine est acquise quand tous ses modules ACTIFS le sont — et à condition
 * qu'il en reste au moins un. Sans cette dernière garde, `every` sur une liste
 * vide rendrait `true` et l'offrirait gratuitement.
 */
export function isPoolCovered(project: SimulatorProject, covers: (subId: string) => boolean): boolean {
	const active = activeSubProjects(project);
	return active.length > 0 && active.every((sub) => covers(sub.id));
}

/**
 * L'XP d'un projet, modules retirés déduits. L'XP d'une piscine est calculé en
 * amont comme la somme de ses modules : il inclut donc encore les retirés.
 */
export function effectiveProjectXP(project: SimulatorProject): number {
	const retired = (project.subProjects ?? []).filter((sub) => sub.retired);
	if (retired.length === 0) return project.xp;
	return project.xp - retired.reduce((sum, sub) => sum + sub.xp, 0);
}

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
	calculateTotalXP: (
		projects: SimulatorProject[],
		projectPercentages?: Record<string, number>,
		completedProjectsPercentages?: Record<string, number>,
		coalitionBoosts?: Record<string, boolean>
	): number => {
		return projects.reduce((total, project) => {
			let projectXP = project.xp;

			// Si le projet a des sous-projets, on prend l'XP total du projet parent
			// car dans les données, l'XP est déjà le total
			if (project.subProjects && project.subProjects.length > 0) {
				// L'XP du parent est déjà la somme de ses modules — retirés compris,
				// d'où la déduction.
				projectXP = effectiveProjectXP(project);
			}

			// Appliquer le pourcentage du projet (simulé ou complété)
			const percentage = projectPercentages?.[project.id] !== undefined
				? clampProjectPercentage(projectPercentages[project.id], project)
				: (completedProjectsPercentages ? findProjectPercentage(project, completedProjectsPercentages, 100) : 100);
			projectXP = Math.round((projectXP * percentage) / 100);

			// Appliquer le boost de coalition si activé (+4.2%)
			if (coalitionBoosts?.[project.id]) {
				projectXP = Math.round(projectXP * 1.042);
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
		simulatedProjects: string[],
		projectPercentages?: Record<string, number>,
		completedProjectsPercentages?: Record<string, number>,
		coalitionBoosts?: Record<string, boolean>,
		simulatedSubProjects?: Record<string, string[]>,
		/**
		 * Ce qui est REELLEMENT acquis, a distinguer des parametres ci-dessus qui
		 * portent tous la projection. Sans ces valeurs, « reel » et « projete »
		 * finissent par designer la meme chose, et l'interface annonce comme acquis
		 * ce qui n'est qu'une intention.
		 */
		real?: {
			/** Niveau effectivement atteint (et non le niveau projete). */
			level: number;
			/** Experiences professionnelles reellement terminees. */
			professionalExp: number;
			/** Sous-projets reellement valides sur 42 (piscines). */
			subProjects?: Record<string, string[]>;
		}
	): RNCPValidation => {
		const allValidatedProjects = [...completedProjects, ...simulatedProjects];

		// Valider le niveau
		const isLevelValid = userLevel >= rncp.level;

		// Valider les événements
		const isEventsValid = userEvents >= rncp.requiredEvents;

		// Valider l'expérience professionnelle
		const isProfessionalExperienceValid = userProfessionalExp >= rncp.requiredProfessionalExperience;

		// Valider chaque catégorie
		// Deux passes par catégorie : la PROJECTION (ce que l'utilisateur simule) et
		// le RÉEL (ce qu'il a effectivement validé sur 42). Sans la seconde,
		// impossible de distinguer à l'écran un acquis d'une intention — la barre
		// verdissait et la catégorie s'annonçait « validée » sur du simulé.
		const categoriesValidation: CategoryValidation[] = rncp.categories.map((category) => {
			const projected = xpService.validateCategory(
				category,
				allValidatedProjects,
				projectPercentages,
				completedProjectsPercentages,
				coalitionBoosts,
				simulatedSubProjects
			);
			// La passe reelle ne recoit QUE des sources factuelles :
			//  - les sous-projets reellement valides (et non ceux simplement coches),
			//    sans quoi l'XP d'une piscine reellement terminee disparaissait ;
			//  - les pourcentages issus des notes 42, sans les pourcentages ni les
			//    boosts de simulation, prioritaires dans le calcul et qui
			//    fausseraient donc l'acquis.
			const realCategory = xpService.validateCategory(
				category,
				completedProjects,
				undefined,
				completedProjectsPercentages,
				undefined,
				real?.subProjects
			);
			return {
				...projected,
				realCount: realCategory.currentCount,
				realXP: realCategory.currentXP,
				isRealValid: realCategory.isValid,
			};
		});

		// Le RNCP est valide si toutes les conditions sont remplies
		const overallValid =
			isLevelValid &&
			isEventsValid &&
			isProfessionalExperienceValid &&
			categoriesValidation.every((cv) => cv.isValid);

		// Ce qui est REELLEMENT acquis. Le niveau et l'experience professionnelle
		// recus plus haut sont ceux de la PROJECTION : les reutiliser ici declarait
		// « reel » un RNCP qu'on n'a pas. Sans valeurs reelles fournies, on ne
		// declare rien d'acquis sur ces deux criteres plutot que de supposer.
		const isRealLevelValid = real ? real.level >= rncp.level : false;
		const isRealProfExpValid = real
			? real.professionalExp >= rncp.requiredProfessionalExperience
			: false;

		const overallRealValid =
			isRealLevelValid &&
			isEventsValid &&
			isRealProfExpValid &&
			categoriesValidation.every((cv) => cv.isRealValid);

		return {
			rncpId: rncp.id,
			isLevelValid,
			isEventsValid,
			isProfessionalExperienceValid,
			categoriesValidation,
			overallValid,
			overallRealValid,
		};
	},

	// Valider une catégorie
	validateCategory: (
		category: ProjectCategory,
		validatedProjects: string[],
		projectPercentages?: Record<string, number>,
		completedProjectsPercentages?: Record<string, number>,
		coalitionBoosts?: Record<string, boolean>,
		simulatedSubProjects?: Record<string, string[]>
	): CategoryValidation => {
		// Trouver les projets validés de cette catégorie
		const categoryValidatedProjects = category.projects.filter((project) => {
			// Un projet que l'école ne compte plus ne compte plus, même validé pour
			// de vrai : le laisser dans le total afficherait une progression que le
			// jury ne reconnaîtrait pas.
			if (project.retired) return false;

			const projectSlug = project.slug || project.id;

			// Une piscine n'est validée QUE si tous ses modules le sont.
			//
			// Le rapprochement des projets est volontairement permissif (il compare
			// des noms normalisés), or le slug d'une piscine est souvent un préfixe
			// de celui de ses modules — « mobile » contre « mobile-0-basic… ». Un
			// seul module validé faisait donc passer la piscine entière pour
			// acquise, avec son XP complet.
			if (project.subProjects && project.subProjects.length > 0) {
				const checkedSubs = simulatedSubProjects?.[project.id] ?? [];
				// Un module que l'école a retiré ne peut plus être validé par
				// personne : le laisser dans le `every` rendrait la piscine
				// définitivement invalidable, soit l'inverse exact de ce que le
				// drapeau cherche à faire.
				return isPoolCovered(
					project,
					(subId) => {
						const sub = project.subProjects!.find((s) => s.id === subId)!;
						return (
							checkedSubs.includes(sub.id) ||
							isProjectCompleted(sub.slug || sub.id, validatedProjects)
						);
					}
				);
			}

			return isProjectCompleted(projectSlug, validatedProjects);
		});

		const currentCount = categoryValidatedProjects.length;
		let currentXP = xpService.calculateTotalXP(
			categoryValidatedProjects,
			projectPercentages,
			completedProjectsPercentages,
			coalitionBoosts
		);

		// Ajouter l'XP des sous-projets partiellement cochés (projets pas encore comptés comme validés)
		if (simulatedSubProjects && Object.keys(simulatedSubProjects).length > 0) {
			for (const project of category.projects) {
				if (project.retired) continue;
				if (!project.subProjects) continue;
				const key = project.id;
				const checkedSubs = simulatedSubProjects[key];
				if (categoryValidatedProjects.includes(project)) continue;
				if (!checkedSubs || checkedSubs.length === 0) continue;
				const subXP = project.subProjects
					// Même raison qu'au-dessus : l'XP d'un module retiré ne compte plus
					// dans la catégorie, sinon la carte annonce « n'entre pas dans l'XP »
					// pendant que le total dit le contraire.
					.filter(sub => !sub.retired && checkedSubs.includes(sub.id))
					.reduce((sum, sub) => sum + sub.xp, 0);
				currentXP += subXP;
			}
		}

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
			// Valeurs par défaut : sur un appel isolé, ce qui est compté EST le
			// réel. `validateRNCP` les remplace par le résultat de sa passe sans
			// simulation.
			realCount: currentCount,
			realXP: currentXP,
			isRealValid: isValid,
		};
	},
};
