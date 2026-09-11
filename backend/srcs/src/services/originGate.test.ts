import { describe, it, expect, vi } from 'vitest';
import { origineAutorisee } from './originGate.js';
// La VRAIE fonction du dépôt, et non une copie « en plus court » : le contrat
// entre le gate et la normalisation ne se vérifie qu'en exerçant celle qui tourne
// en production. La copie simplifiée d'une version antérieure de ce test aurait
// laissé passer n'importe quelle divergence entre les deux.
import { normalizeOrigin } from '../db/allowedOriginRepository.js';

/**
 * Le contrôle d'origine de `/setup/status`.
 *
 * Il existe parce qu'un miroir non déclaré paraissait fonctionner : c'est au clic
 * sur « Se connecter » que l'instance principale, ne trouvant pas l'origine dans
 * sa liste, retombait EN SILENCE sur son propre domaine et déposait le visiteur
 * là-bas. Constaté le 2026-09-11 sur testmirror.theomouty.fr — le `state` OAuth
 * scellait `rncp.theomouty.fr`.
 *
 * Trois propriétés à tenir, et elles tirent dans des sens opposés :
 *  1. une origine non déclarée rend `false`, sinon le contrôle ne sert à rien ;
 *  2. une absence de question rend `true`, sinon on bloque l'instance principale
 *     elle-même et tout frontend antérieur à ce contrôle ;
 *  3. une instance qui ne fait pas autorité rend `null` — surtout pas `true`.
 *     Une version antérieure écrasait ce cas en `true`, et le démarrage d'un
 *     miroir annonçait « Origine reconnue » alors que personne n'avait vérifié :
 *     le mensonge silencieux qu'on prétend supprimer, réintroduit dans le remède.
 */

/** Liste blanche factice. Refuse tout ce qui n'est pas une origine normalisée. */
const liste = (...autorisees: string[]) => async (o: string) => {
	if (typeof o !== 'string') throw new Error('la liste ne doit recevoir qu\'une origine normalisée');
	return autorisees.includes(o);
};
const listeVide = liste();

describe('origineAutorisee', () => {
	it('accepte une origine déclarée', async () => {
		expect(await origineAutorisee(
			'https://miroir.exemple.fr', normalizeOrigin, liste('https://miroir.exemple.fr')
		)).toBe(true);
	});

	it('REFUSE une origine absente de la liste', async () => {
		// Le cœur du problème : sans ce `false`, le miroir croit aller bien.
		expect(await origineAutorisee('https://testmirror.theomouty.fr', normalizeOrigin, listeVide))
			.toBe(false);
	});

	it('ne bloque rien quand la question n’est pas posée', async () => {
		// Le frontend de l'instance principale interrogeait cette route sans
		// paramètre. Répondre `false` par défaut l'aurait mise à l'arrêt.
		expect(await origineAutorisee(undefined, normalizeOrigin, listeVide)).toBe(true);
	});

	it('ne consulte même pas la liste quand la question n’est pas posée', async () => {
		const espion = vi.fn(listeVide);
		await origineAutorisee(undefined, normalizeOrigin, espion);
		expect(espion).not.toHaveBeenCalled();
	});

	it('REFUSE un paramètre répété au lieu de l’ignorer', async () => {
		// `?origin=a&origin=b` arrive en tableau. L'ignorer rendait `true` : un
		// contournement d'un seul caractère. Le dépôt répond déjà 400 sur la même
		// entrée ailleurs, et `initiateOAuth` lève dessus — on ne va pas déclarer
		// « autorisée » une valeur que le décideur ne sait pas lire.
		for (const tordu of [['a', 'b'], null, 42, {}, true]) {
			expect(await origineAutorisee(tordu, normalizeOrigin, listeVide)).toBe(false);
		}
	});

	it('refuse une origine vide ou illisible, sans la confondre avec une absence', async () => {
		for (const bancale of ['', '   ', 'pas-une-url', 'ftp://x.fr', 'javascript:alert(1)']) {
			expect(await origineAutorisee(bancale, normalizeOrigin, listeVide)).toBe(false);
		}
	});

	it('ne soumet jamais une valeur non normalisée à la liste blanche', async () => {
		// Le stub lève sur autre chose qu'une chaîne : si le rejet précoce
		// disparaissait, ce test tomberait sur l'exception plutôt que sur le verdict.
		const espion = vi.fn(listeVide);
		expect(await origineAutorisee('pas-une-url', normalizeOrigin, espion)).toBe(false);
		expect(espion).not.toHaveBeenCalled();
	});

	it('normalise avant de comparer', async () => {
		const blanche = liste('https://miroir.exemple.fr');
		for (const variante of [
			'https://miroir.exemple.fr/',
			'https://miroir.exemple.fr/dashboard',
			'  https://miroir.exemple.fr  ',
			'https://miroir.exemple.fr/chemin?x=1#y',
		]) {
			expect(await origineAutorisee(variante, normalizeOrigin, blanche)).toBe(true);
		}
	});

	it('distingue le port et le schéma', async () => {
		const blanche = liste('https://miroir.exemple.fr');
		expect(await origineAutorisee('http://miroir.exemple.fr', normalizeOrigin, blanche)).toBe(false);
		expect(await origineAutorisee('https://miroir.exemple.fr:8443', normalizeOrigin, blanche)).toBe(false);
	});

	it('transmet à la liste blanche la forme NORMALISÉE', async () => {
		const espion = vi.fn(listeVide);
		await origineAutorisee('https://miroir.exemple.fr/chemin?x=1', normalizeOrigin, espion);
		expect(espion).toHaveBeenCalledWith('https://miroir.exemple.fr');
	});

	describe('quand l’instance ne fait pas autorité', () => {
		// Deux cas réels : `APP_DOMAIN` absent (le domaine propre est deviné), et
		// instance en miroir applicatif (c'est sa cible qui scelle le `state`, mais
		// `/setup/status` reste servi localement — elle s'auto-autorisait).

		it('rend null, et surtout PAS true', async () => {
			expect(await origineAutorisee('https://x.fr', normalizeOrigin, listeVide, false)).toBeNull();
		});

		it('refuse quand même une question MALFORMÉE', async () => {
			// Une entrée illisible se reconnaît sans aucune autorité : c'est un
			// constat sur l'entrée, pas un verdict sur l'origine. Et cela aligne le
			// cas sur celui du paramètre répété, qui rend `false` lui aussi — deux
			// formes de la même erreur d'appel ne doivent pas recevoir deux réponses
			// différentes selon qu'on fait autorité ou non.
			expect(await origineAutorisee('pas-une-url', normalizeOrigin, listeVide, false)).toBe(false);
			expect(await origineAutorisee(['a', 'b'], normalizeOrigin, listeVide, false)).toBe(false);
		});

		it('ne consulte pas la liste', async () => {
			const espion = vi.fn(listeVide);
			await origineAutorisee('https://x.fr', normalizeOrigin, espion, false);
			expect(espion).not.toHaveBeenCalled();
		});

		it('laisse quand même passer l’absence de question', async () => {
			// Le frontend de cette instance-là doit continuer de fonctionner.
			expect(await origineAutorisee(undefined, normalizeOrigin, listeVide, false)).toBe(true);
		});

		it('contrôle bel et bien dès que l’autorité est établie', async () => {
			// Le pendant : la garde ne doit pas tout désactiver.
			expect(await origineAutorisee('https://intrus.fr', normalizeOrigin, listeVide, true))
				.toBe(false);
		});
	});
});
