import { describe, it, expect } from 'vitest';
import { origineRefusee, siteDepuisApi } from './originVerdict';

describe('origineRefusee', () => {
	it('avertit sur un refus EXPLICITE', () => {
		// Le seul cas qui doit déclencher quoi que ce soit.
		expect(origineRefusee(false)).toBe(true);
	});

	it('n’avertit pas sur une origine acceptée', () => {
		expect(origineRefusee(true)).toBe(false);
	});

	it('n’avertit JAMAIS sur une incertitude', () => {
		// `null` au premier rendu, à chaque hoquet réseau, et sur toute instance
		// qui ne fait pas autorité. Élargir la garde à `null` couperait la
		// connexion pour tout le monde, y compris sur l'instance principale.
		expect(origineRefusee(null)).toBe(false);
	});
});

describe('siteDepuisApi', () => {
	it('retire le chemin de l’API pour donner le SITE', () => {
		// `target` porte l'URL de l'API relayée ; c'est le site qu'on montre.
		expect(siteDepuisApi('https://rncp.theomouty.fr/api')).toBe('https://rncp.theomouty.fr');
	});

	it('garde le port quand il y en a un', () => {
		expect(siteDepuisApi('http://192.168.1.10:8080/api')).toBe('http://192.168.1.10:8080');
	});

	it('accepte une URL sans chemin', () => {
		expect(siteDepuisApi('https://exemple.fr')).toBe('https://exemple.fr');
	});

	it('ne propose RIEN plutôt qu’un lien cassé', () => {
		// Le bandeau existe pour éviter d'envoyer les gens quelque part sans le
		// dire : y mettre un lien mort serait se contredire.
		for (const bancal of [undefined, null, '', '   ', 'pas-une-url', 42, {}, 'ftp://x.fr', 'javascript:alert(1)']) {
			expect(siteDepuisApi(bancal)).toBeNull();
		}
	});
});
