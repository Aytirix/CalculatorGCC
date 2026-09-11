import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * L'appel à `/setup/status` transporte-t-il bien la QUESTION ?
 *
 * Sans le paramètre `origin`, le backend répond `true` par conception — « pas de
 * question, rien à bloquer » — et tout le dispositif d'avertissement devient
 * inerte de bout en bout : bandeau jamais affiché, bouton jamais désactivé,
 * verdict serveur toujours vert. Un audit par mutation a montré que sa
 * suppression ne faisait tomber aucun test : l'assertion d'alors portait sur le
 * TEXTE du fichier, qu'il suffisait de déplacer dans une variable morte.
 */

const get = vi.fn(async (_url: string, _config?: { params?: Record<string, unknown> }) => ({
	data: { configured: true, message: 'ok' },
}));
vi.mock('axios', () => ({
	default: { create: () => ({ get }) },
}));

const ORIGINE = 'https://copie.exemple.fr';
beforeEach(() => {
	get.mockClear();
	(globalThis as Record<string, unknown>).window = { location: { origin: ORIGINE } };
});

describe('setupService.getStatus', () => {
	it('transmet NOTRE origine au serveur', async () => {
		const { setupService } = await import('./setup.service');
		await setupService.getStatus();
		expect(get).toHaveBeenCalledWith('/setup/status', { params: { origin: ORIGINE } });
	});

	it('envoie l’origine, pas l’URL complète', async () => {
		// `window.location.href` porterait le chemin : `normalizeOrigin` le ramène
		// bien à l'origine côté serveur, mais l'écart se paierait ailleurs.
		(globalThis as Record<string, unknown>).window = {
			location: { origin: ORIGINE, href: `${ORIGINE}/dashboard?x=1` },
		};
		const { setupService } = await import('./setup.service');
		await setupService.getStatus();
		expect(get.mock.calls[0][1]).toEqual({ params: { origin: ORIGINE } });
	});
});
