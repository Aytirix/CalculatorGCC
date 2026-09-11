import { describe, it, expect } from 'vitest';
import { origineRefusee } from './originVerdict';

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
