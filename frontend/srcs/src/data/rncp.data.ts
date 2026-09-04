import type { RNCP } from '@/types/rncp.types';

/**
 * Référentiel RNCP, servi par le backend.
 *
 * Il n'est plus écrit en dur ici : la structure (quel RNCP exige quels projets,
 * dans quelle catégorie) vit dans `backend/srcs/src/data/rncpReferential.ts`, et
 * les noms comme les XP sont lus sur le catalogue 42 mis en cache. Recopier ces
 * valeurs à la main les faisait dériver de la réalité (kfs-3 annoncé à 3 570 XP
 * au lieu de 35 700, corewar à 35 700 au lieu de 17 500…).
 *
 * Ce module garde la dernière version reçue pour le code qui n'est pas un
 * composant React (le rapprochement Holy Graph ↔ RNCP, par exemple). Les
 * composants, eux, passent par `useRncpData()`.
 */
let current: RNCP[] = [];

/** Alimenté par `RncpDataProvider` dès que le backend a répondu. */
export function setRncpData(data: RNCP[]): void {
	current = data;
}

/** Référentiel courant — tableau vide tant que le backend n'a pas répondu. */
export function getRncpData(): RNCP[] {
	return current;
}
