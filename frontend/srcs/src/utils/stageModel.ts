/**
 * Modèle de prédiction d'un stage "Work Experience I" à partir de ses 4 sous-projets.
 *
 * Poids obtenus par régression linéaire (moindres carrés) sur les stages validés du
 * campus de Nice, fenêtre 2023-2026 (barème actuel — le pré-2023 suivait une autre
 * logique). Validé en LOO-CV. Voir debug/fetch_all.py et l'analyse associée.
 *
 *   XP réel   : erreur type ~2 400 XP  (R² ≈ 0.92, n = 138)
 *   Note fin. : erreur type ~2 pts     (R² ≈ 0.97, n = 41, plafonnée à 125)
 *
 * ⚠️ Ces poids ne valent que pour Work Experience I. Si le barème change (dérive
 *    détectable via les résidus), il suffit de ré-entraîner et de mettre à jour ici.
 */

export interface StageSubNotes {
  duration: number; // % (Duration) — durée validée, souvent > 100 pour un stage long
  mid: number;      // Company Mid Evaluation
  final: number;    // Company Final Evaluation
  peer: number;     // Peer Video (/100)
}

export type StageNoteKey = keyof StageSubNotes;

/** Bornes de saisie par sous-note (Peer est noté sur 100, les autres sur 125). */
export const STAGE_NOTE_MAX: Record<StageNoteKey, number> = {
  duration: 125,
  mid: 125,
  final: 125,
  peer: 100,
};

/** Note minimale saisissable par sous-note. */
export const STAGE_NOTE_MIN: Record<StageNoteKey, number> = {
  duration: 100,
  mid: 50,
  final: 50,
  peer: 50,
};

/**
 * Repères de Duration selon la durée du stage, calculés sur le dataset d'entraînement
 * (WE I validés, 2023-2026). Le seuil ~110% sépare 4 mois et 6 mois.
 */
export const STAGE_DURATION_GUIDE = {
  threshold: 110, // >= 110% ⇒ 6 mois ; < 110% ⇒ 4 mois
  fourMonths: { avg: 102, min: 100, max: 108, n: 30 },
  sixMonths: { avg: 116, min: 110, max: 125, n: 110 },
};

/** Libellé + explication de chaque sous-note, pour l'UI. */
export const STAGE_NOTE_INFO: Record<StageNoteKey, { label: string; help: string }> = {
  duration: {
    label: 'Duration',
    help: "Durée validée du stage (en %). Principal moteur de l'XP — repères 4/6 mois ci-dessous.",
  },
  mid: {
    label: 'Company Mid Evaluation',
    help: "Évaluation de l'entreprise à mi-parcours du stage.",
  },
  final: {
    label: 'Company Final Evaluation',
    help: "Évaluation finale de l'entreprise. C'est le principal moteur de la note finale.",
  },
  peer: {
    label: 'Peer Video',
    help: 'Note de la vidéo de présentation évaluée par les students (sur 100).',
  },
};

/** Ordre d'affichage des sous-notes. */
export const STAGE_NOTE_ORDER: StageNoteKey[] = ['duration', 'mid', 'final', 'peer'];

export const STAGE_NOTE_CAP = 125; // plafond de la note finale

// --- Poids de régression (WE I, 2023-2026) ------------------------------------
/** Poids XP par point de chaque sous-note (ex : +1 point de Duration ≈ +1008 XP). */
export const STAGE_XP_WEIGHTS: StageSubNotes = { duration: 1007.8587, mid: 74.4510, final: 267.1005, peer: 89.1872 };
const XP_INTERCEPT = -114840.67;

/** Poids sur la note finale par point de chaque sous-note. */
export const STAGE_NOTE_WEIGHTS: StageSubNotes = { duration: 0.9509, mid: 0.2899, final: 0.5738, peer: 0.0294 };
const NOTE_INTERCEPT = -81.82;

/**
 * Part (%) de chaque sous-note dans ce qui fait VARIER l'XP / la note.
 * = |poids × amplitude réelle de la note|, normalisé à 100. Somme = 100%.
 * Plus honnête que le poids brut (qui dépend de l'échelle de chaque note).
 */
export const STAGE_XP_IMPORTANCE: StageSubNotes = { duration: 59, mid: 10, final: 29, peer: 2 };
export const STAGE_NOTE_IMPORTANCE: StageSubNotes = { duration: 35, mid: 24, final: 40, peer: 1 };

function dot(weights: StageSubNotes, notes: StageSubNotes): number {
  return (
    weights.duration * notes.duration +
    weights.mid * notes.mid +
    weights.final * notes.final +
    weights.peer * notes.peer
  );
}

/** XP réel prédit d'un stage à partir de ses 4 sous-notes (jamais négatif). */
export function predictStageXP(notes: StageSubNotes): number {
  return Math.max(0, Math.round(dot(STAGE_XP_WEIGHTS, notes) + XP_INTERCEPT));
}

/** Note finale prédite (0-125, plafonnée). */
export function predictStageNote(notes: StageSubNotes): number {
  const raw = dot(STAGE_NOTE_WEIGHTS, notes) + NOTE_INTERCEPT;
  return Math.max(0, Math.min(STAGE_NOTE_CAP, Math.round(raw * 10) / 10));
}

/** Applique le boost coalition (+4.2%) à un montant d'XP. */
export function applyCoalitionBoost(xp: number, boostEnabled: boolean): number {
  return boostEnabled ? Math.round(xp * 1.042) : xp;
}

/** Infos pour la fenêtre d'explication (⚙️). */
export const STAGE_MODEL_INFO = {
  xpFormula: 'XP ≈ 1008·Duration + 74·Mid + 267·Final + 89·Peer − 114841',
  noteFormula: 'Note ≈ 0.95·Duration + 0.29·Mid + 0.57·Final + 0.03·Peer − 82',
  xpAccuracy: 'R² ≈ 0.92 · erreur type ~2 400 XP (~5 %)',
  noteAccuracy: 'R² ≈ 0.97 · erreur type ~2 pts',
  trainingWindow: '2023-2026 (stages validés, campus de Nice)',
  durationNote:
    "Sur le sujet, Duration à 100% correspondrait à un stage de 4 mois et 125% à 6 mois — " +
    "mais les statistiques réelles montrent que c'est faux, et on ne sait pas encore simuler " +
    "la durée exactement. Ce qui est sûr : un stage de 6 mois a une Duration ≥ 110%. Les moyennes " +
    "réelles du dataset t'aident à estimer (affichées sous le champ Duration).",
  interceptNote:
    "La constante −114 841 de la formule XP n'est pas un vrai montant : c'est un décalage " +
    "d'équilibrage. Comme les notes sont toujours hautes (100-125), la somme (poids × notes) " +
    "vaut ~162 600 en moyenne, bien plus que le vrai XP moyen (~48 000) ; le −114 841 la ramène " +
    "à la bonne valeur. Elle ne se lit pas seule (elle correspond à des notes = 0, qui n'existent jamais).",
};
