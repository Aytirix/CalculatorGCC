import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./backend-auth.service', () => ({ backendAuthService: { getToken: () => 'jwt', logout: vi.fn() } }));
vi.mock('@/config/config', () => ({ config: { backendUrl: '' } }));

const { simulationService } = await import('./simulation.service');

afterEach(() => vi.unstubAllGlobals());

describe('simulationService — une lecture attend l’enregistrement en cours', () => {
	it('quitter une page juste après une modification : le Dashboard lit la version ENREGISTRÉE', async () => {
		const order: string[] = [];
		let finishPut!: () => void;
		vi.stubGlobal('fetch', vi.fn((_url: string, opts?: RequestInit) => {
			if (opts?.method === 'PUT') {
				order.push('put:start');
				return new Promise(resolve => {
					finishPut = () => { order.push('put:end'); resolve({ ok: true, status: 200, json: async () => ({}) }); };
				});
			}
			order.push('get');
			return Promise.resolve({ ok: true, status: 200, json: async () => ({ simulatedProjects: [] }) });
		}));

		const data = { simulatedProjects: [], simulatedSubProjects: {}, customProjects: [], apiExpPercentages: {}, hasSeenTour: true };
		const saving = simulationService.save(data);
		const loading = simulationService.load();
		await Promise.resolve();
		expect(order).toEqual(['put:start']); // la lecture attend
		finishPut();
		await saving;
		await loading;
		expect(order).toEqual(['put:start', 'put:end', 'get']);
	});

	it('enregistrement en échec : la lecture part quand même', async () => {
		vi.stubGlobal('fetch', vi.fn((_url: string, opts?: RequestInit) => opts?.method === 'PUT'
			? Promise.resolve({ ok: false, status: 500, statusText: 'boom', json: async () => ({}) })
			: Promise.resolve({ ok: true, status: 200, json: async () => ({ simulatedProjects: [] }) })));
		const data = { simulatedProjects: [], simulatedSubProjects: {}, customProjects: [], apiExpPercentages: {}, hasSeenTour: true };
		await expect(simulationService.save(data)).rejects.toThrow();
		await expect(simulationService.load()).resolves.toEqual({ simulatedProjects: [] });
	});
});
