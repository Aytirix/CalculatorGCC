import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./backend-auth.service', () => ({ backendAuthService: { getToken: () => 'jwt', logout: vi.fn() } }));
vi.mock('@/config/config', () => ({ config: { backendUrl: '' } }));

const { simulationService, PENDING_SAVE_MAX_WAIT_MS, setSimulationViewUserId, onBeforeViewSwitch } = await import('./simulation.service');

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

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
		await vi.waitFor(() => expect(order).toEqual(['put:start']));
		await new Promise(r => setTimeout(r, 20));
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

	it('enregistrement bloqué : la lecture part après l’attente maximale, sans minuteur oublié', async () => {
		vi.useFakeTimers();
		vi.stubGlobal('fetch', vi.fn((_url: string, opts?: RequestInit) => opts?.method === 'PUT'
			? new Promise(() => {}) // ne répond jamais
			: Promise.resolve({ ok: true, status: 200, json: async () => ({ simulatedProjects: [] }) })));
		const data = { simulatedProjects: [], simulatedSubProjects: {}, customProjects: [] };
		void simulationService.save(data);
		let done = false;
		const loading = simulationService.load().then(() => { done = true; });
		await vi.advanceTimersByTimeAsync(PENDING_SAVE_MAX_WAIT_MS - 1);
		expect(done).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await loading;
		expect(done).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe('simulationService.save — un enregistrement attend le précédent', () => {
	it('deux PUT ne sont jamais en vol en même temps', async () => {
		const events: string[] = [];
		const finish: (() => void)[] = [];
		vi.stubGlobal('fetch', vi.fn((_url: string, opts?: RequestInit) => {
			const n = JSON.parse(String(opts?.body)).simulatedProjects.length;
			events.push(`start:${n}`);
			return new Promise(resolve => {
				finish.push(() => { events.push(`end:${n}`); resolve({ ok: true, status: 200, json: async () => ({}) }); });
			});
		}));
		// Un test plus haut laisse un enregistrement bloqué : l'attente bornée
		// le laisse derrière (sinon plus rien ne partirait jamais).
		vi.useFakeTimers();
		const base = { simulatedSubProjects: {}, customProjects: [] };
		const a = simulationService.save({ ...base, simulatedProjects: [] });
		await vi.advanceTimersByTimeAsync(PENDING_SAVE_MAX_WAIT_MS);
		vi.useRealTimers();
		const b = simulationService.save({ ...base, simulatedProjects: [{ projectId: 'x', percentage: 100, coalitionBoost: false }] });
		await vi.waitFor(() => expect(events).toEqual(['start:0']));
		finish[0]();
		await a;
		await vi.waitFor(() => expect(events).toEqual(['start:0', 'end:0', 'start:1']));
		finish[1]();
		await b;
	});
});

describe('changer de profil consulté', () => {
	it('les enregistrements en attente partent AVANT de passer en consultation', () => {
		const seen: boolean[] = [];
		const off = onBeforeViewSwitch(() => seen.push(true));
		setSimulationViewUserId(7);
		setSimulationViewUserId(7); // même profil : rien de plus
		setSimulationViewUserId(null);
		off();
		setSimulationViewUserId(8);
		setSimulationViewUserId(null);
		expect(seen).toEqual([true, true]);
	});
});
