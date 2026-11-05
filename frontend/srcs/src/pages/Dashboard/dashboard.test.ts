import { describe, expect, it } from 'vitest';
import type { CategoryValidation, RNCP, RNCPValidation, SimulatorProject } from '@/types/rncp.types';
import { categoryStatus, generalConditions, levelScale, teamText, validationProgress } from './dashboardModel';
import { buildDashRow, categoryEffect, type DashRowContext } from './dashboardRows';

/**
 * Ce que le Dashboard affiche, hors composant : conditions d'un titre,
 * avancement, état des catégories, lignes de projet. Chiffres tirés d'un vrai
 * profil (RNCP 7 Système d'information et réseaux).
 */

const cv = (over: Partial<CategoryValidation>): CategoryValidation => ({
	categoryId: 'c', requiredCount: 2, currentCount: 0, requiredXP: 30000, currentXP: 0,
	isValid: false, validatedProjects: [], realCount: 0, realXP: 0, isRealValid: false, ...over,
});

const rncp7 = { id: 'r7', name: "RNCP 7 - Système d'information et réseaux", level: 21, requiredEvents: 15, requiredProfessionalExperience: 2, categories: [] } as RNCP;

const validation7: RNCPValidation = {
	rncpId: 'r7',
	isLevelValid: false,
	isRealLevelValid: false,
	isEventsValid: true,
	isProfessionalExperienceValid: true,
	isRealProfessionalExperienceValid: false,
	categoriesValidation: [
		cv({ categoryId: 'unix', requiredCount: 2, requiredXP: 30000 }),
		cv({ categoryId: 'admin', requiredCount: 3, requiredXP: 50000, currentCount: 1, realCount: 1, currentXP: 31813, realXP: 31813 }),
		cv({ categoryId: 'secu', requiredCount: 3, requiredXP: 50000, currentCount: 1, realCount: 1, currentXP: 7875, realXP: 7875 }),
	],
	overallValid: false,
	overallRealValid: false,
};

const progress = { currentLevel: 15.26, projectedLevel: 19.53, events: 16, professionalExperience: 4, realProfessionalExperience: 0 };

describe('generalConditions — niveau, événements, expérience pro', () => {
	const [level, events, exp] = generalConditions(rncp7, validation7, progress);

	it('niveau manquant même en simulation : l’écart est chiffré', () => {
		expect(level.state).toBe('missing');
		expect(level.value).toBe('15.26 → 19.53 / 21');
		expect(level.hint).toContain('1.47');
	});

	it('événements acquis ; expérience remplie grâce à la simulation', () => {
		expect(events).toMatchObject({ state: 'ok', value: '16 / 15' });
		expect(exp).toMatchObject({ state: 'sim', value: '0 → 4 / 2' });
	});
});

describe('validationProgress — mêmes pourcentages que l’ancienne carte', () => {
	it('RNCP 7 SI : 1 condition sur 9 acquise (11 %), 2 avec la simulation (22 %)', () => {
		expect(validationProgress(validation7, true)).toMatchObject({ total: 9, realMet: 1, met: 2, missing: 7, realPct: 11, projectedPct: 22 });
	});

	it('titre « Global » : seulement les catégories', () => {
		expect(validationProgress(validation7, false).total).toBe(6);
	});
});

describe('categoryStatus — ce que dit la pastille', () => {
	const cat = { requiredCount: 3, requiredXP: 50000 };
	it('validée, remplie en simulation, ou ce qui manque', () => {
		expect(categoryStatus(cat, cv({ isRealValid: true, isValid: true }))).toEqual({ state: 'ok', label: 'Validée' });
		expect(categoryStatus(cat, cv({ isValid: true }))).toEqual({ state: 'sim', label: 'Remplie en simulation' });
		const missing = categoryStatus(cat, cv({ currentCount: 1, currentXP: 31813 }));
		expect(missing.state).toBe('missing');
		expect(missing.label).toMatch(/^Manque 2 projets · 18\s187 XP$/);
	});
});

describe('levelScale', () => {
	it('du niveau actuel (arrondi, moins un) au plus haut seuil plus un', () => {
		const scale = levelScale(15.26, 19.53, [17, 21]);
		expect(scale).toMatchObject({ min: 14, max: 22 });
		expect(scale.at(14)).toBe(0);
		expect(scale.at(22)).toBe(100);
		expect(scale.at(18)).toBe(50);
	});
});

describe('teamText', () => {
	const team = (over: object) => ({ id: 1, name: 'x', slug: 'x', xp: 0, solo: false, groupMin: 2, groupMax: 4, ...over });
	it('solo, groupe fixe, groupe variable, inconnu', () => {
		expect(teamText(team({ solo: true }))).toBe('Solo');
		expect(teamText(team({ groupMin: 2, groupMax: 2 }))).toBe('Groupe de 2');
		expect(teamText(team({}))).toBe('Groupe de 2 à 4');
		expect(teamText(null)).toBeUndefined();
	});
});

const ctx = (over: Partial<DashRowContext> = {}): DashRowContext => ({
	completedIds: new Set(),
	simulatedIds: new Set(),
	simulatedSubProjects: {},
	completedSubProjects: {},
	percentages: {},
	completedPercentages: {},
	boosts: {},
	notes: {},
	readOnly: false,
	apiStatus: () => null,
	...over,
});

const kfs1: SimulatorProject = { id: '42-1', name: 'kfs-1', slug: 'kfs-1', xp: 15750 };
const pool: SimulatorProject = {
	id: '42-9', name: 'Mobile', slug: 'mobile', xp: 9000,
	subProjects: [
		{ id: '42-91', name: 'mobile-0', xp: 3000 },
		{ id: '42-92', name: 'mobile-1', xp: 3000 },
		{ id: '42-93', name: 'mobile-2', xp: 3000, retired: true },
	],
};

describe('buildDashRow — une ligne de projet', () => {
	it('simulé à 110 % avec bonus : XP compté comme la validation RNCP', () => {
		const row = buildDashRow(kfs1, ['Unix'], ctx({ simulatedIds: new Set(['42-1']), percentages: { '42-1': 110 }, boosts: { '42-1': true } }));
		expect(row).toMatchObject({ status: 'simulated', isSimulated: true, simulatedPercentage: 110, coalitionBoost: true, blocker: null });
		expect(row.gain).toBe(Math.round(Math.round(15750 * 1.1) * 1.042));
		expect(row.shownXp).toBe(row.gain);
	});

	it('pourcentage au-delà du maximum du projet : borné', () => {
		const row = buildDashRow({ ...kfs1, maxPercentage: 100 }, [], ctx({ simulatedIds: new Set(['42-1']), percentages: { '42-1': 125 } }));
		expect(row.simulatedPercentage).toBe(100);
		expect(row.gain).toBe(15750);
	});

	it('en cours ou raté sur l’intra : le statut le dit, la simulation reste possible', () => {
		const row = buildDashRow(kfs1, [], ctx({ apiStatus: () => 'in_progress' }));
		expect(row.status).toBe('in_progress');
		expect(row.blocker).toBeNull();
	});

	it('déjà validé : case bloquée, aucun gain', () => {
		const row = buildDashRow(kfs1, [], ctx({ completedIds: new Set(['42-1']) }));
		expect(row).toMatchObject({ status: 'validated', isSimulated: false, gain: 0 });
		expect(row.blocker).toMatch(/validé/);
	});

	it('hors référentiel : bloqué, ne rapporte rien', () => {
		const row = buildDashRow({ ...kfs1, retired: true }, [], ctx());
		expect(row.gain).toBe(0);
		expect(row.blocker).toMatch(/Hors référentiel/);
	});

	it('piscine : simulée quand tous ses modules ACTIFS sont cochés (le retiré ne compte pas)', () => {
		const partial = buildDashRow(pool, [], ctx({ simulatedSubProjects: { '42-9': ['42-91'] } }));
		expect(partial).toMatchObject({ isPool: true, isSimulated: false, poolDone: 1, poolTotal: 2 });
		const full = buildDashRow(pool, [], ctx({ simulatedSubProjects: { '42-9': ['42-91', '42-92'] } }));
		expect(full).toMatchObject({ isSimulated: true, poolDone: 2, simulatedPercentage: null });
	});

	it('consultation d’un autre profil : tout est bloqué', () => {
		expect(buildDashRow(kfs1, [], ctx({ readOnly: true })).blocker).toMatch(/Consultation/);
	});
});

describe('categoryEffect — avant / après la simulation du projet', () => {
	it('non simulé : ce qu’il ajouterait', () => {
		const row = buildDashRow(kfs1, [], ctx());
		expect(categoryEffect(row, { count: 0, xp: 0 })).toEqual({ before: { count: 0, xp: 0 }, after: { count: 1, xp: 15750 }, gain: 15750, partial: false });
	});

	it('simulé : la catégorie le compte déjà, on montre d’où on part', () => {
		const row = buildDashRow(kfs1, [], ctx({ simulatedIds: new Set(['42-1']), percentages: { '42-1': 110 } }));
		expect(categoryEffect(row, { count: 1, xp: 17325 })).toEqual({ before: { count: 0, xp: 0 }, after: { count: 1, xp: 17325 }, gain: 17325, partial: false });
	});

	it('validé : pas d’effet à montrer', () => {
		expect(categoryEffect(buildDashRow(kfs1, [], ctx({ completedIds: new Set(['42-1']) })), { count: 1, xp: 1 })).toBeNull();
	});

	it('piscine non cochée : ce que la cocher en entier ajouterait (module retiré exclu)', () => {
		expect(categoryEffect(buildDashRow(pool, [], ctx()), { count: 0, xp: 0 })).toMatchObject({ after: { count: 1, xp: 6000 }, gain: 6000, partial: false });
	});
});

describe('corrections de la BAA', () => {
	const pool4: SimulatorProject = {
		id: '42-5', name: 'Piscine', slug: 'piscine', xp: 12000,
		subProjects: ['a', 'b', 'c', 'd'].map(k => ({ id: `42-5${k}`, name: k, xp: 3000 })),
	};

	it('piscine en partie validée : simuler le reste n’ajoute que le reste', () => {
		const row = buildDashRow(pool4, [], ctx({
			completedSubProjects: { '42-5': ['42-5a', '42-5b'] },
			simulatedSubProjects: { '42-5': ['42-5c', '42-5d'] },
		}));
		expect(row.isSimulated).toBe(true);
		expect(categoryEffect(row, { count: 1, xp: 12000 })).toMatchObject({ before: { count: 0, xp: 6000 }, gain: 6000 });
	});

	it('piscine en partie cochée : ses modules cochés ont un effet affiché', () => {
		const row = buildDashRow(pool4, [], ctx({ simulatedSubProjects: { '42-5': ['42-5a'] } }));
		expect(categoryEffect(row, { count: 0, xp: 3000 })).toEqual({ before: { count: 0, xp: 0 }, after: { count: 0, xp: 3000 }, gain: 3000, partial: true });
	});

	it('projet hors référentiel resté coché : la case se décoche', () => {
		const retired = { ...kfs1, retired: true };
		expect(buildDashRow(retired, [], ctx({ simulatedIds: new Set(['42-1']) })).blocker).toBeNull();
		expect(buildDashRow(retired, [], ctx()).blocker).toMatch(/Hors référentiel/);
	});
});

