import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `PUT /simulation` ne touche JAMAIS aux expériences professionnelles.
 *
 * Depuis que le Dashboard les enregistre par leur route dédiée, il ne les
 * transporte plus dans la sauvegarde générale. Si celle-ci retombait sur `[]`
 * quand la clé est absente, chaque sauvegarde automatique (toutes les 2 s après
 * un clic sur un projet) viderait la colonne : les expériences disparaîtraient
 * au rechargement suivant. C'est exactement le bug d'origine, dans l'autre sens.
 *
 * La distinction porte sur `undefined` vs `[]` — une valeur, pas un mot-clé :
 * seule une assertion sur l'argument réellement passé au dépôt la voit.
 */

type ArgsSave = [number, string, string | null, Record<string, unknown>, (string | null)?, (string | null)?];
const enregistrer = vi.fn(async (...args: ArgsSave) => {
	void args;
	return { saved: {}, dropped: [] as string[] };
});

vi.mock('../db/simulationRepository.js', () => ({
	simulationRepository: {
		save: (
			id: number,
			login: string,
			img: string | null,
			data: Record<string, unknown>,
			prenom?: string | null,
			nom?: string | null
		) => enregistrer(id, login, img, data, prenom, nom) as never,
	},
}));

const { SimulationController } = await import('./simulation.controller.js');

const appeler = async (body: unknown) => {
	const reply = { code() { return this; }, send(x: unknown) { return x; } };
	await SimulationController.save(
		{ body, user: { user_id_42: 42, login: 'thmouty', image_url: null } } as never,
		reply as never
	);
	return (enregistrer.mock.calls[0]?.[3] ?? {}) as Record<string, unknown>;
};

beforeEach(() => enregistrer.mockClear());

describe('PUT /simulation — la colonne des expériences', () => {
	it('ne transmet RIEN quand la clé est absente (la colonne reste intacte)', async () => {
		const data = await appeler({ simulatedProjects: [], apiExpPercentages: {} });
		expect(data.manualExperiences).toBeUndefined();
	});

	it('ne transmet rien non plus quand la clé n’est pas un tableau', async () => {
		// Un `[]` ici effacerait la colonne sur un corps simplement mal formé.
		for (const tordu of ['non', 42, null, {}]) {
			enregistrer.mockClear();
			const data = await appeler({ manualExperiences: tordu });
			expect(data.manualExperiences).toBeUndefined();
		}
	});

	it('IGNORE la liste même quand le client l’envoie', async () => {
		// Ignorer la clé ABSENTE ne suffisait pas : un onglet resté ouvert sur une
		// version antérieure du frontend continue de l'envoyer, et son instantané
		// périmé écrasait ce que la route dédiée venait d'enregistrer. Une seule
		// porte écrit ce champ, et ce n'est pas celle-ci.
		const data = await appeler({ manualExperiences: [{ id: 'a' }] });
		expect(data.manualExperiences).toBeUndefined();
	});

	it('ignore aussi une liste vide explicite', async () => {
		// Vider passe par la route dédiée, qui accepte `[]` — pas par ici.
		const data = await appeler({ manualExperiences: [] });
		expect(data.manualExperiences).toBeUndefined();
	});

	it('laisse passer TOUT le reste de la simulation', async () => {
		// La garantie symétrique : ignorer les expériences ne doit pas amputer le
		// reste du corps, sans quoi la sauvegarde générale ne servirait plus à rien.
		const data = await appeler({
			manualExperiences: [{ id: 'a' }],
			simulatedProjects: [{ projectId: '42' }],
			customProjects: [{ nom: 'x' }],
			apiExpPercentages: { 7: 110 },
		});
		expect(data.simulatedProjects).toEqual([{ projectId: '42' }]);
		expect(data.customProjects).toEqual([{ nom: 'x' }]);
		expect(data.apiExpPercentages).toEqual({ 7: 110 });
	});
});
