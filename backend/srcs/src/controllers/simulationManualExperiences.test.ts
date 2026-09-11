import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `PUT /simulation/manual-experiences` — la sauvegarde PARTIELLE.
 *
 * Elle existe parce que la page « Expérience professionnelle » n'écrivait que
 * dans le localStorage : le Dashboard, qui recharge la simulation depuis la base
 * à chaque visite, réécrasait l'édition par la copie serveur, et toute
 * modification était perdue au rafraîchissement.
 *
 * Ce que ces tests verrouillent, et c'est le point le plus dangereux : cette
 * route ne doit JAMAIS toucher au reste de la simulation. `PUT /simulation`
 * remplace tout et vide les champs absents du corps — l'appeler depuis une page
 * qui ne connaît pas les projets simulés les aurait effacés.
 */

// Signature complète : le dépôt reçoit aussi prénom et nom, et un mock plus
// court ferait échouer le typecheck sans rien dire du comportement.
const enregistrer = vi.fn(
	async (...args: [number, string, string | null, unknown[], (string | null)?, (string | null)?]) => args[3]
);

vi.mock('../db/simulationRepository.js', () => ({
	simulationRepository: {
		saveManualExperiences: (
			id: number,
			login: string,
			img: string | null,
			exp: unknown[],
			prenom?: string | null,
			nom?: string | null
		) => enregistrer(id, login, img, exp, prenom, nom),
	},
}));

const { SimulationController } = await import('./simulation.controller.js');

/** Répond comme Fastify : on inspecte le code et le corps. */
const appeler = async (body: unknown) => {
	let code = 200;
	let corps: unknown;
	const reply = {
		code(c: number) { code = c; return this; },
		send(x: unknown) { corps = x; return x; },
	};
	await SimulationController.saveManualExperiences(
		{ body, user: { user_id_42: 42, login: 'thmouty', image_url: null } } as never,
		reply as never
	);
	return { code, corps: corps as Record<string, unknown> };
};

beforeEach(() => enregistrer.mockClear());

describe('PUT /simulation/manual-experiences', () => {
	it('enregistre la liste reçue', async () => {
		const experiences = [
			{ type: 'stage', validationPercentage: 125, xpEarned: 62_000, id: 'a' },
			{ type: 'alternance', validationPercentage: 60, xpEarned: 54_000, id: 'b' },
		];
		const { code, corps } = await appeler({ manualExperiences: experiences });
		expect(code).toBe(200);
		expect(corps.manualExperiences).toEqual(experiences);
		expect(enregistrer).toHaveBeenCalledWith(42, 'thmouty', null, experiences, undefined, undefined);
	});

	it('accepte une liste VIDE — c’est une suppression, pas une erreur', async () => {
		// Effacer sa dernière expérience doit s'enregistrer, sinon elle réapparaît
		// au rechargement suivant : le bug d'origine, dans l'autre sens.
		const { code } = await appeler({ manualExperiences: [] });
		expect(code).toBe(200);
		expect(enregistrer).toHaveBeenCalledWith(42, 'thmouty', null, [], undefined, undefined);
	});

	it('REFUSE ce qui n’est pas une liste, sans rien écrire', async () => {
		for (const tordu of [undefined, {}, { manualExperiences: 'non' }, { manualExperiences: 42 }, { manualExperiences: null }]) {
			const { code } = await appeler(tordu);
			expect(code).toBe(400);
		}
		expect(enregistrer).not.toHaveBeenCalled();
	});

	it('refuse une liste démesurée', async () => {
		// Ce tableau part en JSON dans une colonne ; rien ne bornerait sa taille.
		const { code } = await appeler({ manualExperiences: new Array(101).fill({ type: 'stage' }) });
		expect(code).toBe(400);
		expect(enregistrer).not.toHaveBeenCalled();
	});

	it('accepte exactement la limite', async () => {
		const { code } = await appeler({ manualExperiences: new Array(100).fill({ type: 'stage' }) });
		expect(code).toBe(200);
	});

	it('ne transmet QUE les expériences au dépôt', async () => {
		// La garantie qui compte : rien d'autre de la simulation ne doit partir
		// d'ici. Un champ de plus dans le corps ne doit pas être propagé.
		await appeler({
			manualExperiences: [{ id: 'a' }],
			simulatedProjects: [{ projectId: '1' }],
			customProjects: [{ nom: 'x' }],
		});
		const argumentsRecus = enregistrer.mock.calls[0];
		expect(argumentsRecus[3]).toEqual([{ id: 'a' }]);
		expect(JSON.stringify(argumentsRecus)).not.toContain('simulatedProjects');
		expect(JSON.stringify(argumentsRecus)).not.toContain('customProjects');
	});
});
