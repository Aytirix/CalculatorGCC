import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * `simulationService.saveManualExperiences` — le CÂBLAGE client.
 *
 * Trois garanties, aucune testée jusqu'ici, et toutes invisibles au typecheck :
 *   • la requête part sur la route DÉDIÉE, en PUT, avec les expériences dans le
 *     corps — viser `/simulation` écraserait toute la simulation ;
 *   • rien n'est envoyé quand on consulte le profil d'un AUTRE utilisateur ;
 *   • la réponse du serveur est ce qui est rendu.
 *
 * Un audit par mutation a montré que `if (false && _viewSimUserId !== null)`
 * laissait le fichier vert : la garde peut être neutralisée sans qu'aucune
 * assertion ne bouge.
 */

vi.mock('./backend-auth.service', () => ({
	backendAuthService: { getToken: () => 'jeton-de-test', logout: async () => {} },
}));

const { simulationService, setSimulationViewUserId } = await import('./simulation.service');

const fetchEspion = vi.fn(async () => ({
	ok: true, status: 200,
	json: async () => ({ manualExperiences: [{ id: 'renvoyé-par-le-serveur' }] }),
}));

beforeEach(() => {
	fetchEspion.mockClear();
	(globalThis as Record<string, unknown>).fetch = fetchEspion;
	setSimulationViewUserId(null);
});
afterEach(() => setSimulationViewUserId(null));

const appel = () => fetchEspion.mock.calls[0] as unknown as [string, RequestInit];

describe('saveManualExperiences (client)', () => {
	it('PUT sur la route dédiée, expériences dans le corps', async () => {
		await simulationService.saveManualExperiences([{ id: 'a' }] as never);
		const [url, options] = appel();
		expect(url).toContain('/simulation/manual-experiences');
		expect(url).not.toMatch(/\/simulation$/);
		expect(options.method).toBe('PUT');
		expect(JSON.parse(options.body as string)).toEqual({ manualExperiences: [{ id: 'a' }] });
	});

	it('rend ce que le SERVEUR a enregistré, pas ce qu’on lui a envoyé', async () => {
		const rendu = await simulationService.saveManualExperiences([{ id: 'a' }] as never);
		expect(rendu).toEqual([{ id: 'renvoyé-par-le-serveur' }]);
	});

	it('n’écrit RIEN en consultant le profil d’un autre', async () => {
		setSimulationViewUserId(1234);
		const rendu = await simulationService.saveManualExperiences([{ id: 'a' }] as never);
		expect(fetchEspion).not.toHaveBeenCalled();
		expect(rendu).toEqual([{ id: 'a' }]);
	});

	it('réécrit dès qu’on revient sur son propre profil', async () => {
		setSimulationViewUserId(1234);
		await simulationService.saveManualExperiences([] as never);
		setSimulationViewUserId(null);
		await simulationService.saveManualExperiences([] as never);
		expect(fetchEspion).toHaveBeenCalledTimes(1);
	});
});
