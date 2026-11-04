import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Détection « téléphone / tablette » et « déjà installée » : c'est elle qui
 * décide d'afficher (ou non) le bouton et le bandeau « Installer l'application ».
 * `window` / `navigator` sont simulés puis restaurés (environnement `node`).
 */

type Listener = (e: Event) => void;

function fakeEnv(opts: { ua: string; standalone?: boolean; maxTouchPoints?: number }) {
	const listeners: Record<string, Listener[]> = {};
	const win = {
		addEventListener: (type: string, fn: Listener) => { (listeners[type] ??= []).push(fn); },
		removeEventListener: () => {},
		matchMedia: (q: string) => ({
			matches: q.includes('standalone') ? !!opts.standalone : false,
			addEventListener: () => {},
		}),
	};
	const nav = { userAgent: opts.ua, maxTouchPoints: opts.maxTouchPoints ?? 0 };
	vi.stubGlobal('window', win);
	vi.stubGlobal('navigator', nav);
	return {
		fire: (type: string, event: Event) => (listeners[type] ?? []).forEach(fn => fn(event)),
	};
}

async function freshModule() {
	vi.resetModules();
	return import('./installPrompt');
}

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPADOS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

describe('installPrompt', () => {
	beforeEach(() => { vi.unstubAllGlobals(); });
	afterEach(() => { vi.unstubAllGlobals(); });

	it('Android dans Chrome : mobile, non installé ; la fenêtre native devient disponible', async () => {
		const env = fakeEnv({ ua: ANDROID });
		const m = await freshModule();
		m.initInstallPrompt();
		expect(m.getInstallState()).toMatchObject({ mobile: true, installed: false, ios: false, canPrompt: false });
		const event = Object.assign(new Event('beforeinstallprompt'), {
			prompt: vi.fn(async () => {}),
			userChoice: Promise.resolve({ outcome: 'accepted' as const }),
		});
		env.fire('beforeinstallprompt', event);
		expect(m.getInstallState().canPrompt).toBe(true);
		await expect(m.promptInstall()).resolves.toBe('accepted');
		expect(event.prompt).toHaveBeenCalledOnce();
		expect(m.getInstallState()).toMatchObject({ installed: true, canPrompt: false });
	});

	it('iPhone et iPad (iPadOS se présente comme un Mac) : mobile + iOS, pas de fenêtre native', async () => {
		fakeEnv({ ua: IPHONE });
		let m = await freshModule();
		m.initInstallPrompt();
		expect(m.getInstallState()).toMatchObject({ mobile: true, ios: true });
		await expect(m.promptInstall()).resolves.toBe('unavailable');

		fakeEnv({ ua: IPADOS, maxTouchPoints: 5 });
		m = await freshModule();
		m.initInstallPrompt();
		expect(m.getInstallState()).toMatchObject({ mobile: true, ios: true });
	});

	it('ordinateur : rien n’est proposé', async () => {
		fakeEnv({ ua: DESKTOP });
		const m = await freshModule();
		m.initInstallPrompt();
		expect(m.getInstallState().mobile).toBe(false);
	});

	it('lancée en mode installé (standalone) : considérée comme installée', async () => {
		fakeEnv({ ua: ANDROID, standalone: true });
		const m = await freshModule();
		m.initInstallPrompt();
		expect(m.getInstallState().installed).toBe(true);
	});

	it('installation refusée : la fenêtre n’est plus proposée (événement à usage unique)', async () => {
		const env = fakeEnv({ ua: ANDROID });
		const m = await freshModule();
		m.initInstallPrompt();
		env.fire('beforeinstallprompt', Object.assign(new Event('beforeinstallprompt'), {
			prompt: async () => {},
			userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
		}));
		await expect(m.promptInstall()).resolves.toBe('dismissed');
		expect(m.getInstallState()).toMatchObject({ installed: false, canPrompt: false });
		await expect(m.promptInstall()).resolves.toBe('unavailable');
	});
});
