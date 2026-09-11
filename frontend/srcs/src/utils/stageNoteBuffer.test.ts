import { describe, it, expect } from 'vitest';
import { bornerNote, noteEffective, notesEffectives } from './stageNoteBuffer';
import type { StageSubNotes } from './stageModel';

/**
 * Le tampon de saisie des sous-notes du stage.
 *
 * Le formulaire laisse taper librement et ne borne qu'à la sortie du champ — sans
 * quoi la valeur était inatteignable : depuis 100, taper un chiffre donnait
 * « 1002 », ramené à 125. Mais la SOUMISSION ne lisait que le modèle, jamais le
 * tampon : valider à la touche Entrée part avant tout `blur`, et enregistrait donc
 * l'ancienne note. L'utilisateur retrouvait « j'enregistre, j'actualise, je perds
 * l'information » — le symptôme d'origine, pour une cause introduite par le
 * correctif lui-même.
 */

const notes: StageSubNotes = { duration: 100, mid: 100, final: 100, peer: 100 };

describe('bornerNote', () => {
	// Le bornage vivait aussi dans `setNote`, avec sa propre copie du
	// `Math.max(min, Math.min(max, …))` : le slider et les flèches passaient par
	// une écriture de la règle que rien n'éprouvait.
	it('respecte les bornes PROPRES à chaque sous-note', () => {
		expect(bornerNote('duration', 90)).toBe(100);   // plancher à 100
		expect(bornerNote('duration', 200)).toBe(125);
		expect(bornerNote('peer', 200)).toBe(100);      // plafond à 100
		expect(bornerNote('mid', 10)).toBe(50);
	});

	it('laisse passer une valeur déjà correcte', () => {
		expect(bornerNote('duration', 118)).toBe(118);
		expect(bornerNote('final', 50)).toBe(50);
		expect(bornerNote('final', 125)).toBe(125);
	});

	it('ramène au minimum ce qui n’est pas un nombre', () => {
		// `NaN` traverse `Math.min`/`Math.max` intact : il partait tel quel dans la
		// régression, qui rendait alors `NaN` XP.
		expect(bornerNote('duration', NaN)).toBe(100);
		expect(bornerNote('peer', Infinity)).toBe(50);
	});
});

describe('noteEffective', () => {
	it('retient ce qui vient d’être TAPÉ', () => {
		// LE cas : sans lui, la valeur saisie n'atteint jamais l'enregistrement.
		expect(noteEffective('duration', 100, '120')).toBe(120);
	});

	it('borne une valeur hors limites', () => {
		expect(noteEffective('duration', 100, '999')).toBe(125);
		expect(noteEffective('peer', 100, '10')).toBe(50);
	});

	it('garde la valeur courante quand le champ est vide', () => {
		// `duration` commence à 100 : effacer pour retaper ne doit pas tomber au
		// minimum à chaque touche, c'était le défaut d'origine.
		expect(noteEffective('duration', 118, '')).toBe(118);
		expect(noteEffective('duration', 118, undefined)).toBe(118);
	});

	it('distingue un champ VIDÉ d’un champ jamais touché', () => {
		// Les deux doivent garder la valeur courante, mais par des chemins
		// différents : confondre `''` et `undefined` ferait retomber `duration` à
		// son minimum de 100 dès qu'on efface pour retaper.
		expect(noteEffective('duration', 118, '')).toBe(118);
		expect(noteEffective('peer', 70, '')).toBe(70);
	});

	it('ignore un tampon illisible', () => {
		expect(noteEffective('mid', 90, 'abc')).toBe(90);
	});
});

describe('notesEffectives', () => {
	it('applique le tampon de CHAQUE champ', () => {
		expect(notesEffectives(notes, { duration: '125', peer: '80' }))
			.toEqual({ duration: 125, mid: 100, final: 100, peer: 80 });
	});

	it('rend les notes inchangées sans tampon', () => {
		expect(notesEffectives(notes, {})).toEqual(notes);
	});

	it('ne mute pas les notes reçues', () => {
		const origine = { ...notes };
		notesEffectives(notes, { duration: '125' });
		expect(notes).toEqual(origine);
	});

	it('couvre les quatre sous-notes', () => {
		const toutes = notesEffectives(notes, { duration: '110', mid: '90', final: '80', peer: '70' });
		expect(toutes).toEqual({ duration: 110, mid: 90, final: 80, peer: 70 });
	});
});
