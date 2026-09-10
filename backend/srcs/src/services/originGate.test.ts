import { describe, it, expect, vi } from 'vitest';
import { origineAutorisee } from './originGate.js';

/**
 * Le contrôle d'origine de `/setup/status`.
 *
 * Il existe parce qu'un miroir non déclaré démarrait sans broncher et paraissait
 * fonctionner : c'est au clic sur « Se connecter » que l'instance principale,
 * ne trouvant pas l'origine dans sa liste, retombait EN SILENCE sur son propre
 * domaine et déposait le visiteur là-bas. Constaté le 2026-09-11 sur
 * testmirror.theomouty.fr — le `state` OAuth scellait `rncp.theomouty.fr`.
 *
 * Les deux propriétés à tenir tirent dans des sens opposés :
 *  1. une origine non déclarée doit rendre `false`, sinon le contrôle ne sert à
 *     rien et on retombe sur la panne silencieuse ;
 *  2. une absence de question doit rendre `true`, sinon on bloque l'instance
 *     principale elle-même — dont le frontend appelait cette route sans rien
 *     demander — et tout frontend antérieur à ce contrôle.
 */

/** `normalizeOrigin` du dépôt, en plus court : ce qui compte ici est le `null`. */
const normaliser = (brut: string): string | null => {
	try {
		const url = new URL(brut.trim());
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
		return url.origin;
	} catch {
		return null;
	}
};

/** Liste blanche factice. */
const liste = (...autorisees: string[]) => async (o: string) => autorisees.includes(o);
const listeVide = async () => false;

describe('origineAutorisee', () => {
	it('accepte une origine déclarée', async () => {
		const ok = await origineAutorisee(
			'https://miroir.exemple.fr', normaliser, liste('https://miroir.exemple.fr')
		);
		expect(ok).toBe(true);
	});

	it('REFUSE une origine absente de la liste', async () => {
		// Le cœur du problème : sans ce `false`, le miroir croit aller bien.
		expect(await origineAutorisee('https://testmirror.theomouty.fr', normaliser, listeVide))
			.toBe(false);
	});

	it('ne bloque RIEN quand la question n’est pas posée', async () => {
		// Le frontend de l'instance principale interrogeait cette route sans
		// paramètre. Répondre `false` par défaut l'aurait mise à l'arrêt.
		for (const rien of [undefined, null, 42, {}, ['a', 'b']]) {
			expect(await origineAutorisee(rien, normaliser, listeVide)).toBe(true);
		}
	});

	it('ne consulte même pas la liste quand la question n’est pas posée', async () => {
		// Pas seulement le verdict : on ne doit pas payer une requête pour rien.
		const espion = vi.fn(listeVide);
		await origineAutorisee(undefined, normaliser, espion);
		expect(espion).not.toHaveBeenCalled();
	});

	it('refuse une origine vide ou illisible sans la confondre avec une absence', async () => {
		// `?origin=` est une question, pas un silence : la traiter comme une absence
		// donnerait un contournement d'un seul caractère.
		for (const bancale of ['', '   ', 'pas-une-url', 'ftp://x.fr', 'javascript:alert(1)']) {
			expect(await origineAutorisee(bancale, normaliser, liste(''))).toBe(false);
		}
	});

	it('normalise avant de comparer', async () => {
		// La liste stocke des origines normalisées ; une saisie avec chemin ou
		// slash final doit retrouver la même entrée.
		const blanche = liste('https://miroir.exemple.fr');
		for (const variante of [
			'https://miroir.exemple.fr/',
			'https://miroir.exemple.fr/dashboard',
			'  https://miroir.exemple.fr  ',
		]) {
			expect(await origineAutorisee(variante, normaliser, blanche)).toBe(true);
		}
	});

	it('distingue le port et le schéma', async () => {
		// Deux origines différentes au sens du navigateur : ne pas les confondre.
		const blanche = liste('https://miroir.exemple.fr');
		expect(await origineAutorisee('http://miroir.exemple.fr', normaliser, blanche)).toBe(false);
		expect(await origineAutorisee('https://miroir.exemple.fr:8443', normaliser, blanche)).toBe(false);
	});

	it('ne bloque PAS une instance qui ignore son propre domaine', async () => {
		// `APP_DOMAIN` absent : `frontendUrl` retombe sur le nom d'hôte du conteneur,
		// et « est-ce moi ? » ne veut plus rien dire. Sans cette garde, l'instance
		// PRINCIPALE se déclarait non reconnue à elle-même et n'affichait plus rien —
		// alors que seule sa connexion 42 était cassée. Le remède était pire.
		expect(await origineAutorisee('https://rncp.exemple.fr', normaliser, listeVide, false))
			.toBe(true);
		// Même une origine illisible ne doit alors rien déclencher.
		expect(await origineAutorisee('pas-une-url', normaliser, listeVide, false)).toBe(true);
	});

	it('ne consulte pas la liste quand l’identité n’est pas établie', async () => {
		const espion = vi.fn(listeVide);
		await origineAutorisee('https://x.fr', normaliser, espion, false);
		expect(espion).not.toHaveBeenCalled();
	});

	it('contrôle bel et bien quand l’identité EST établie', async () => {
		// Le pendant du test précédent : la garde ne doit pas tout désactiver.
		expect(await origineAutorisee('https://intrus.fr', normaliser, listeVide, true))
			.toBe(false);
	});

	it('transmet à la liste blanche la forme NORMALISÉE, pas la brute', async () => {
		const espion = vi.fn(listeVide);
		await origineAutorisee('https://miroir.exemple.fr/chemin?x=1', normaliser, espion);
		expect(espion).toHaveBeenCalledWith('https://miroir.exemple.fr');
	});
});
