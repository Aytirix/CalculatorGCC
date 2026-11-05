import type { CategoryValidation, ProjectCategory, RNCP, RNCPValidation } from '@/types/rncp.types';
import { formatLevel } from '@/services/xp.service';

/**
 * Ce que le Dashboard affiche d'un titre RNCP, calculé hors du composant :
 * avancement, conditions générales, état de chaque catégorie. Les règles de
 * validation, elles, restent dans `validateRNCP` — ici on ne fait que les lire.
 */

/** État d'une condition : acquise, remplie grâce à la simulation, ou manquante. */
export type ConditionState = 'ok' | 'sim' | 'missing';

export interface Condition {
	key: 'level' | 'events' | 'experience';
	label: string;
	/** « 15,26 → 19,53 / 21 » : l'acquis, la projection s'il y en a une, le seuil. */
	value: string;
	state: ConditionState;
	hint: string;
}

export interface Progress {
	currentLevel: number;
	projectedLevel: number;
	events: number;
	/** Expériences comptées simulation comprise. */
	professionalExperience: number;
	/** Expériences réellement terminées. */
	realProfessionalExperience: number;
}

const stateOf = (real: boolean, projected: boolean): ConditionState =>
	real ? 'ok' : projected ? 'sim' : 'missing';

const withProjection = (real: string, projected: string, required: string) =>
	`${real}${projected !== real ? ` → ${projected}` : ''} / ${required}`;

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Les trois conditions communes à tous les titres (le titre « Global » n'en a pas). */
export function generalConditions(rncp: RNCP, validation: RNCPValidation, progress: Progress): Condition[] {
	const levelState = stateOf(validation.isRealLevelValid, validation.isLevelValid);
	const missingLevel = Math.max(0, rncp.level - progress.projectedLevel);
	const expState = stateOf(validation.isRealProfessionalExperienceValid, validation.isProfessionalExperienceValid);
	const missingExp = Math.max(0, rncp.requiredProfessionalExperience - progress.professionalExperience);
	const missingEvents = Math.max(0, rncp.requiredEvents - progress.events);
	return [
		{
			key: 'level',
			label: 'Niveau',
			value: withProjection(formatLevel(progress.currentLevel), formatLevel(progress.projectedLevel), String(rncp.level)),
			state: levelState,
			hint: levelState === 'ok'
				? 'Acquis.'
				: levelState === 'sim'
					? 'Atteint avec ta simulation.'
					: `Il manque ${formatLevel(missingLevel)} niveau${missingLevel >= 2 ? 'x' : ''}, même avec ta simulation.`,
		},
		{
			key: 'events',
			label: 'Événements',
			value: `${progress.events} / ${rncp.requiredEvents}`,
			state: validation.isEventsValid ? 'ok' : 'missing',
			hint: validation.isEventsValid ? 'Acquis.' : `Il en manque ${missingEvents}.`,
		},
		{
			key: 'experience',
			label: 'Expérience pro',
			value: withProjection(
				String(progress.realProfessionalExperience),
				String(progress.professionalExperience),
				String(rncp.requiredProfessionalExperience),
			),
			state: expState,
			hint: expState === 'ok'
				? 'Acquise.'
				: expState === 'sim'
					? 'Remplie grâce à tes expériences simulées.'
					: `Il en manque ${missingExp}.`,
		},
	];
}

/**
 * Avancement d'un titre : la part des conditions remplies (2 par catégorie :
 * nombre de projets et XP), réellement puis simulation comprise. Même calcul
 * que l'ancienne carte RNCP.
 */
export function validationProgress(validation: RNCPValidation, withGeneral: boolean) {
	let total = 0;
	let real = 0;
	let projected = 0;
	const count = (isReal: boolean, isProjected: boolean) => {
		total++;
		if (isReal) real++;
		if (isProjected) projected++;
	};
	if (withGeneral) {
		count(validation.isRealLevelValid, validation.isLevelValid);
		count(validation.isEventsValid, validation.isEventsValid);
		count(validation.isRealProfessionalExperienceValid, validation.isProfessionalExperienceValid);
	}
	for (const cv of validation.categoriesValidation) {
		count(cv.realCount >= cv.requiredCount, cv.currentCount >= cv.requiredCount);
		count(cv.realXP >= cv.requiredXP, cv.currentXP >= cv.requiredXP);
	}
	const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
	return {
		total,
		met: projected,
		realMet: real,
		missing: total - projected,
		realPct: pct(real),
		projectedPct: pct(projected),
	};
}

export interface CategoryStatus {
	state: ConditionState;
	label: string;
}

/** Ce que dit la pastille d'une catégorie : validée, remplie en simulation, ou ce qui manque. */
export function categoryStatus(category: Pick<ProjectCategory, 'requiredCount' | 'requiredXP'>, cv: CategoryValidation): CategoryStatus {
	if (cv.isRealValid) return { state: 'ok', label: 'Validée' };
	if (cv.isValid) return { state: 'sim', label: 'Remplie en simulation' };
	const missingProjects = Math.max(0, category.requiredCount - cv.currentCount);
	const missingXp = Math.max(0, category.requiredXP - cv.currentXP);
	const parts: string[] = [];
	if (missingProjects > 0) parts.push(plural(missingProjects, 'projet'));
	if (missingXp > 0) parts.push(`${missingXp.toLocaleString('fr-FR')} XP`);
	return { state: 'missing', label: `Manque ${parts.join(' · ')}` };
}

/** Part d'une barre (0–100), bornée. */
export function share(value: number, max: number): number {
	if (max <= 0) return 100;
	return Math.max(0, Math.min(100, (value / max) * 100));
}

/**
 * Échelle de la barre de niveau : du niveau actuel arrondi par défaut, moins
 * un, jusqu'au plus haut seuil RNCP (ou la projection) plus un.
 */
export function levelScale(currentLevel: number, projectedLevel: number, thresholds: number[]) {
	const min = Math.max(0, Math.floor(Math.min(currentLevel, ...thresholds)) - 1);
	const max = Math.ceil(Math.max(projectedLevel, currentLevel, ...thresholds)) + 1;
	const at = (level: number) => share(level - min, max - min);
	return { min, max, at };
}
