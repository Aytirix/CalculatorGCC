import { describe, it, expect } from 'vitest';
import { OriginStatusContext } from './OriginStatusContext';

describe('OriginStatusContext', () => {
	it('ignore tout par défaut, hors de son Provider', () => {
		// Un consommateur rendu hors du Provider — test isolé, futur Suspense,
		// composant remonté ailleurs — doit voir « on ne sait pas ». Un défaut à
		// `false` désactiverait le bouton de connexion sans qu'aucune réponse du
		// serveur ne le justifie ; un défaut à `true` masquerait un vrai refus.
		const defaut = (OriginStatusContext as unknown as { _currentValue: { originAllowed: unknown } })
			._currentValue;
		expect(defaut.originAllowed).toBeNull();
	});
});
