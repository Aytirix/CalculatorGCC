import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

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

// Aucun paramètre déclaré : la règle `no-unused-vars` du dépôt n'admet pas même
// un `_`. `toHaveBeenCalledWith` inspecte les arguments RÉELS, la signature n'y
// change rien ; l'unique lecture indexée est typée sur place.
const get = vi.fn(async () => ({ data: { configured: true, message: 'ok' } }));
/** Les arguments du n-ième appel, tels qu'ils ont été passés. */
const appel = (n: number) => get.mock.calls[n] as unknown as [string, { params?: unknown }];
vi.mock('axios', () => ({
	default: { create: () => ({ get }) },
}));

const ORIGINE = 'https://copie.exemple.fr';
// Restauré en fin de fichier : laisser derrière soi un `window` incomplet faisait
// tomber les fichiers de rendu, qui ont besoin d'`addEventListener`.
const fenetreAvant = (globalThis as Record<string, unknown>).window;
beforeEach(() => {
	// Sans cela, un autre fichier de test ayant déjà chargé `setup.service` avec le
	// VRAI axios laisse le module en cache : le bouchon ne s'applique plus et l'URL
	// relative `/api` devient invalide. Invisible en mode isolé — le défaut de
	// vitest — mais reproductible avec `--no-isolate`.
	vi.resetModules();
	get.mockClear();
	(globalThis as Record<string, unknown>).window = { location: { origin: ORIGINE } };
});
afterAll(() => {
	if (fenetreAvant === undefined) delete (globalThis as Record<string, unknown>).window;
	else (globalThis as Record<string, unknown>).window = fenetreAvant;
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
		expect(appel(0)[1]).toEqual({ params: { origin: ORIGINE } });
	});
});
