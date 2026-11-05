import { afterAll, beforeEach, describe, expect, it } from 'vitest';

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

const { claimLocalDataFor } = await import('./localAccountData');

beforeEach(() => memoire.clear());

describe('claimLocalDataFor — données locales liées au compte', () => {
	it('autre compte sur le même navigateur : ses données sont effacées, préférences gardées', () => {
		claimLocalDataFor('alice');
		localStorage.setItem('calendar_alternance', '{"2026-11-02":"#4f7be8"}');
		localStorage.setItem('simulated_projects', '["1"]');
		localStorage.setItem('gcc_admin_session', 'tok');
		localStorage.setItem('theme', 'dark');
		expect(claimLocalDataFor('bob')).toBe(true);
		expect(localStorage.getItem('calendar_alternance')).toBeNull();
		expect(localStorage.getItem('simulated_projects')).toBeNull();
		expect(localStorage.getItem('gcc_admin_session')).toBeNull();
		expect(localStorage.getItem('theme')).toBe('dark');
	});

	it('même compte qui revient : rien n’est effacé (modifications pas encore envoyées comprises)', () => {
		claimLocalDataFor('alice');
		localStorage.setItem('calendar_alternance', '{"x":"y"}');
		expect(claimLocalDataFor('alice')).toBe(false);
		expect(localStorage.getItem('calendar_alternance')).toBe('{"x":"y"}');
	});

	it('navigateur sans propriétaire connu (données anciennes) : attribuées au compte, rien effacé', () => {
		localStorage.setItem('calendar_alternance', '{"x":"y"}');
		expect(claimLocalDataFor('alice')).toBe(false);
		expect(localStorage.getItem('calendar_alternance')).toBe('{"x":"y"}');
		expect(claimLocalDataFor('bob')).toBe(true);
		expect(localStorage.getItem('calendar_alternance')).toBeNull();
	});
});
