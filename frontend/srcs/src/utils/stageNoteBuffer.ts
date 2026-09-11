import type { StageSubNotes, StageNoteKey } from '@/utils/stageModel';
import { STAGE_NOTE_MAX, STAGE_NOTE_MIN, STAGE_NOTE_ORDER } from '@/utils/stageModel';

/**
 * Les notes RÉELLEMENT en vigueur, tampon de saisie compris.
 *
 * Le formulaire laisse taper librement et ne borne qu'à la sortie du champ —
 * sans quoi la valeur était inatteignable : depuis 100, taper un chiffre donnait
 * « 1002 », ramené à 125. Mais la soumission ne lisait que le modèle, jamais le
 * tampon : valider à la touche ENTRÉE part avant tout `blur`, et enregistrait
 * donc l'ANCIENNE note. L'utilisateur retrouvait son symptôme d'origine —
 * « j'enregistre, j'actualise, je perds l'information » — pour une cause neuve,
 * introduite par le correctif lui-même.
 *
 * Cette fonction est le seul endroit qui décide de la valeur effective : la
 * sortie de champ et la soumission y passent toutes les deux.
 */
export function notesEffectives(
	notes: StageSubNotes,
	saisie: Partial<Record<StageNoteKey, string>>
): StageSubNotes {
	const resultat = { ...notes };
	for (const cle of STAGE_NOTE_ORDER) {
		resultat[cle] = noteEffective(cle, notes[cle], saisie[cle]);
	}
	return resultat;
}

/**
 * Une note : le tampon s'il contient quelque chose d'exploitable, sinon la valeur
 * courante. Un champ vidé conserve la valeur précédente plutôt que de tomber au
 * minimum — `duration` commençant à 100, effacer pour retaper aurait sinon
 * ramené 100 à chaque touche.
 */
export function noteEffective(
	cle: StageNoteKey,
	courante: number,
	tampon: string | undefined
): number {
	if (tampon === undefined || tampon === '') return courante;
	const saisi = parseInt(tampon, 10);
	if (!Number.isFinite(saisi)) return courante;
	return Math.max(STAGE_NOTE_MIN[cle], Math.min(STAGE_NOTE_MAX[cle], saisi));
}
