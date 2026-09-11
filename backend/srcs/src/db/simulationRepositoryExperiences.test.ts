import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Le DÉPÔT des expériences professionnelles — la couche qui écrit réellement.
 *
 * Deux garanties, et aucune n'était vérifiée :
 *   1. `saveManualExperiences` écrit la liste reçue, en création comme en mise à
 *      jour, sur l'utilisateur appelant — sinon la modification est perdue en
 *      silence, ce qui EST le bug que cette livraison corrige ;
 *   2. `save` (sauvegarde générale) n'émet la colonne `manualExperiences` que
 *      lorsqu'elle lui est fournie. Le spread conditionnel qui le garantit est
 *      invisible au typecheck comme aux tests de route : seul un espion sur
 *      l'argument passé à Prisma le voit.
 */

const prisma = vi.hoisted(() => ({
	userSimulation: { upsert: vi.fn(async (args: unknown) => { void args; return {}; }) },
	simulatedProject: {
		findMany: vi.fn(async () => [] as { projectId: string; percentage: number; coalitionBoost: boolean; note: string | null }[]),
		deleteMany: vi.fn(), createMany: vi.fn(), update: vi.fn(async () => ({})),
	},
	$executeRaw: vi.fn(async () => 0),
	$transaction: vi.fn(async () => []),
}));

vi.mock('./connection.js', () => ({ prisma }));

const { simulationRepository } = await import('./simulationRepository.js');

const dernierUpsert = () => prisma.userSimulation.upsert.mock.calls[0][0] as {
	where: Record<string, unknown>;
	create: Record<string, unknown>;
	update: Record<string, unknown>;
};

const simulationVide = {
	simulatedProjects: [], simulatedSubProjects: {}, customProjects: [],
	apiExpPercentages: {}, hasSeenTour: false,
};

beforeEach(() => {
	prisma.userSimulation.upsert.mockClear();
	prisma.simulatedProject.findMany.mockClear();
});

describe('saveManualExperiences — l’écriture dédiée', () => {
	it('écrit la liste reçue, en création ET en mise à jour', async () => {
		const experiences = [{ id: 'a', type: 'alternance', duration: 2 }];
		const rendu = await simulationRepository.saveManualExperiences(42, 'thmouty', null, experiences);

		const { where, create, update } = dernierUpsert();
		expect(where).toEqual({ userId42: 42 });
		expect(create.manualExperiences).toEqual(experiences);
		expect(update.manualExperiences).toEqual(experiences);
		expect(rendu).toEqual(experiences);
	});

	it('écrit sur l’utilisateur APPELANT', async () => {
		await simulationRepository.saveManualExperiences(7, 'autre', null, []);
		const { where, create } = dernierUpsert();
		expect(where).toEqual({ userId42: 7 });
		expect(create.userId42).toBe(7);
	});

	it('ne touche à RIEN d’autre de la simulation', async () => {
		await simulationRepository.saveManualExperiences(42, 'thmouty', null, [{ id: 'a' }]);
		const { create, update } = dernierUpsert();
		for (const champ of ['simulatedSubProjects', 'customProjects', 'apiExpPercentages', 'hasSeenTour']) {
			expect(create).not.toHaveProperty(champ);
			expect(update).not.toHaveProperty(champ);
		}
	});
});

describe('save — la colonne des expériences n’est écrite que si elle est fournie', () => {
	it('OMET la colonne quand `manualExperiences` vaut undefined', async () => {
		await simulationRepository.save(42, 'thmouty', null, { ...simulationVide } as never);
		const { create, update } = dernierUpsert();
		// `not.toHaveProperty` et non `toBeUndefined` : Prisma distingue une clé
		// absente d'une clé à `undefined` — c'est toute la correction.
		expect(create).not.toHaveProperty('manualExperiences');
		expect(update).not.toHaveProperty('manualExperiences');
	});

	it('écrit la colonne quand le client l’a vraiment envoyée', async () => {
		await simulationRepository.save(
			42, 'thmouty', null,
			{ ...simulationVide, manualExperiences: [{ id: 'x' }] } as never
		);
		const { create, update } = dernierUpsert();
		expect(create.manualExperiences).toEqual([{ id: 'x' }]);
		expect(update.manualExperiences).toEqual([{ id: 'x' }]);
	});

	it('écrit une liste VIDE explicite — la suppression doit passer', async () => {
		await simulationRepository.save(
			42, 'thmouty', null,
			{ ...simulationVide, manualExperiences: [] } as never
		);
		const { create, update } = dernierUpsert();
		expect(create.manualExperiences).toEqual([]);
		expect(update.manualExperiences).toEqual([]);
	});
});
