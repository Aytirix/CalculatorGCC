import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const memoire = new Map<string, string>();
const localStorageAvant = (globalThis as Record<string, unknown>).localStorage;
(globalThis as Record<string, unknown>).localStorage = {
	getItem: (k: string) => memoire.get(k) ?? null,
	setItem: (k: string, v: string) => { memoire.set(k, v); },
	removeItem: (k: string) => { memoire.delete(k); },
	clear: () => memoire.clear(),
};
afterAll(() => {
	if (localStorageAvant === undefined) delete (globalThis as Record<string, unknown>).localStorage;
	else (globalThis as Record<string, unknown>).localStorage = localStorageAvant;
});

const saveOwn = vi.fn(async () => undefined);
vi.mock('@/services/calendar.service', () => ({ calendarService: { saveOwn, load: vi.fn() } }));

const { pendingToken, readAlternanceSync, saveOwnAndMark, UNDECIDED_SYNC_TOKEN } = await import('./useCalendarData');

const KEY = 'calendar_alternance_sync';
const payload = { placedProjects: [], dateRange: { start: '2026-01-01', end: '2026-12-31' }, alternanceDays: {} };

beforeEach(() => { memoire.clear(); saveOwn.mockClear(); });

describe('marqueur de synchro du planning', () => {
	it('« en attente » du compte connecté : on garde l’empreinte de la base', () => {
		localStorage.setItem(KEY, pendingToken('3-abc', 'alice'));
		expect(readAlternanceSync('alice')).toEqual({ pendingBase: '3-abc' });
	});

	it('« en attente » d’un AUTRE compte (navigateur partagé) : ignoré, la base décide', () => {
		localStorage.setItem(KEY, pendingToken('3-abc', 'alice'));
		expect(readAlternanceSync('bob')).toBe('synced');
		expect(readAlternanceSync(null)).toBe('synced');
	});

	it('absent : ancien navigateur ; confirmé : synced', () => {
		expect(readAlternanceSync('alice')).toBe('unknown');
		localStorage.setItem(KEY, 'synced');
		expect(readAlternanceSync('alice')).toBe('synced');
	});

	it('envoi réussi de SA modification : confirmé', async () => {
		const token = pendingToken('?', 'alice');
		localStorage.setItem(KEY, token);
		const onSaved = vi.fn();
		await saveOwnAndMark(payload, token, onSaved);
		expect(saveOwn).toHaveBeenCalledOnce();
		expect(onSaved).toHaveBeenCalledOnce();
		expect(localStorage.getItem(KEY)).toBe('synced');
	});

	it('nouvelle modification pendant l’envoi : reste « en attente »', async () => {
		const first = pendingToken('?', 'alice');
		localStorage.setItem(KEY, first);
		const saving = saveOwnAndMark(payload, first);
		const second = pendingToken('?', 'alice');
		localStorage.setItem(KEY, second);
		await saving;
		expect(localStorage.getItem(KEY)).toBe(second);
	});

	it('jeton créé par un autre onglet : jamais confirmé par celui-ci', async () => {
		const foreign = 'pending:autre-onglet:?:alice';
		localStorage.setItem(KEY, foreign);
		await saveOwnAndMark(payload, foreign);
		expect(localStorage.getItem(KEY)).toBe(foreign);
	});

	it('envoi en échec : rien n’est confirmé', async () => {
		const token = pendingToken('?', 'alice');
		localStorage.setItem(KEY, token);
		saveOwn.mockRejectedValueOnce(new Error('réseau'));
		await expect(saveOwnAndMark(payload, token)).rejects.toThrow();
		expect(localStorage.getItem(KEY)).toBe(token);
	});

	it('envoi pendant la question « garder ce planning ? » : le navigateur reste sans marqueur', async () => {
		await saveOwnAndMark(payload, UNDECIDED_SYNC_TOKEN);
		expect(localStorage.getItem(KEY)).toBeNull();
		expect(readAlternanceSync('alice')).toBe('unknown');
	});
});
