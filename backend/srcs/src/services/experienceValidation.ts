/**
 * Validation des expériences professionnelles saisies à la main.
 *
 * Ce tableau part en JSON dans une colonne, et il RESSORT tel quel — par
 * `GET /simulation` pour son auteur, mais aussi par `GET /simulation/user/:id`
 * pour quiconque consulte un profil public. Il n'était validé nulle part.
 *
 * Conséquence mesurée sur le vrai composant : `stageLevel: 3` fait lever
 * `STAGE_MODELS[3].label`, `xpEarned: null` fait lever `.toLocaleString()`, un
 * objet à la place d'un nombre donne « Objects are not valid as a React child ».
 * L'ErrorBoundary remplace alors TOUTE l'application du visiteur — un déni de
 * service déclenché à distance par le propriétaire du profil, rejouable à volonté.
 *
 * On ÉCARTE les entrées invalides plutôt que de rejeter tout le corps, sur le
 * modèle de `sanitizeSimulationData` : un enregistrement ancien et bancal ne doit
 * pas empêcher d'enregistrer les autres. Ce qui est écarté est renvoyé, pour être
 * journalisé plutôt que perdu en silence.
 */

/** Bornes larges : on écarte l'absurde, on ne dicte pas le métier. */
const LIMITES = {
	duration: { min: 0, max: 120 },            // mois pour un stage, années pour une alternance
	validationPercentage: { min: 0, max: 125 },
	xpEarned: { min: 0, max: 5_000_000 },
	coalitionBoost: { min: 0, max: 100 },
} as const;

/** Poids sérialisé maximal d'une entrée : la borne de 100 ne limitait que le NOMBRE. */
const POIDS_MAX_ENTREE = 4096;

function estNombreBorne(valeur: unknown, min: number, max: number): boolean {
	return typeof valeur === 'number' && Number.isFinite(valeur) && valeur >= min && valeur <= max;
}

/** Une entrée est-elle exploitable par le frontend sans le faire planter ? */
export function experienceValide(entree: unknown): boolean {
	if (entree === null || typeof entree !== 'object' || Array.isArray(entree)) return false;
	const x = entree as Record<string, unknown>;

	if (typeof x.id !== 'string' || x.id.length === 0 || x.id.length > 64) return false;
	if (x.type !== 'stage' && x.type !== 'alternance') return false;
	if (typeof x.isSimulation !== 'boolean') return false;

	for (const [champ, { min, max }] of Object.entries(LIMITES)) {
		if (!estNombreBorne(x[champ], min, max)) return false;
	}

	// Niveau de stage : seuls Work Experience I et II existent. C'est ce champ qui
	// faisait lever le rendu, `STAGE_MODELS[3]` étant `undefined`.
	if (x.stageLevel !== undefined && x.stageLevel !== 1 && x.stageLevel !== 2) return false;

	if (x.subNotes !== undefined) {
		if (x.subNotes === null || typeof x.subNotes !== 'object' || Array.isArray(x.subNotes)) return false;
		for (const note of Object.values(x.subNotes as Record<string, unknown>)) {
			if (!estNombreBorne(note, 0, 125)) return false;
		}
	}
	if (x.predictedNote !== undefined && !estNombreBorne(x.predictedNote, 0, 125)) return false;
	if (x.simulationExplicite !== undefined && typeof x.simulationExplicite !== 'boolean') return false;
	if (typeof x.startDate !== 'string' || x.startDate.length > 32) return false;

	// Poids : une seule entrée pouvait porter un méga-octet, reparti ensuite à
	// chaque chargement ET à chaque visiteur du profil.
	try {
		if (JSON.stringify(x).length > POIDS_MAX_ENTREE) return false;
	} catch {
		return false; // structure circulaire
	}
	return true;
}

/** Sépare le bon grain de l'ivraie. `ecartees` est destiné au journal. */
export function filtrerExperiences(liste: unknown[]): {
	gardees: unknown[];
	ecartees: number;
} {
	const gardees = liste.filter(experienceValide);
	return { gardees, ecartees: liste.length - gardees.length };
}
