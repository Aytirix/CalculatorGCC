/**
 * Modèle de prédiction d'un stage « Work Experience » (I ou II) à partir de ses
 * 4 sous-projets (Duration, Mid, Final, Peer).
 *
 * Poids obtenus par régression linéaire (moindres carrés) sur les stages validés
 * du campus de Nice, fenêtre 2023-2026 (barème actuel — le pré-2023 suivait une
 * autre logique). Voir debug/fetch_all.py + le dashboard debug/website (onglet
 * Prédiction) pour l'entraînement et la validation.
 *
 *   WE I  : gros échantillon — XP n=138 (R²≈0.92, ~2 400 XP), Note n=41 (R²≈0.97, ~2 pts).
 *   WE II : échantillon réduit — XP n=17 (R²≈0.87, ~5 150 XP), Note n=8 → PRÉLIMINAIRE.
 *           Se fiabilisera à mesure que de nouveaux rendus WE II s'accumulent.
 */

export interface StageSubNotes {
  duration: number; // % (Duration) — durée validée, souvent > 100 pour un stage long
  mid: number;      // Company Mid Evaluation
  final: number;    // Company Final Evaluation
  peer: number;     // Peer Video (/100)
}

export type StageNoteKey = keyof StageSubNotes;
export type WorkExperienceLevel = 1 | 2;

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

// ---------------------------------------------------------------------------
// Modèle par niveau de stage (WE I / WE II)
// ---------------------------------------------------------------------------
export interface StageDurationGuide {
  threshold: number; // >= threshold ⇒ 6 mois ; < ⇒ 4 mois
  fourMonths: { avg: number; min: number; max: number; n: number };
  sixMonths: { avg: number; min: number; max: number; n: number };
}

export interface StageModel {
  level: WorkExperienceLevel;
  label: string;      // "Work Experience I"
  baseXP: number;     // XP de base du projet (info) : 42000 / 63000
  preliminary: boolean; // true = échantillon réduit (WE II)
  xpWeights: StageSubNotes;
  xpIntercept: number;
  noteWeights: StageSubNotes;
  noteIntercept: number;
  /** Part (%) de chaque sous-note dans ce qui fait VARIER l'XP / la note (somme = 100). */
  xpImportance: StageSubNotes;
  noteImportance: StageSubNotes;
  durationGuide: StageDurationGuide;
  info: {
    xpFormula: string;
    noteFormula: string;
    xpAccuracy: string;
    noteAccuracy: string;
    trainingWindow: string;
    durationNote: string;
    interceptNote: string;
    sampleNote?: string; // avertissement échantillon réduit (WE II)
  };
}

export const STAGE_MODELS: Record<WorkExperienceLevel, StageModel> = {
  1: {
    level: 1,
    label: 'Work Experience I',
    baseXP: 42000,
    preliminary: false,
    xpWeights: { duration: 1007.8587, mid: 74.4510, final: 267.1005, peer: 89.1872 },
    xpIntercept: -114840.67,
    noteWeights: { duration: 0.9509, mid: 0.2899, final: 0.5738, peer: 0.0294 },
    noteIntercept: -81.82,
    xpImportance: { duration: 59, mid: 10, final: 29, peer: 2 },
    noteImportance: { duration: 35, mid: 24, final: 40, peer: 1 },
    durationGuide: {
      threshold: 110,
      fourMonths: { avg: 102, min: 100, max: 108, n: 30 },
      sixMonths: { avg: 116, min: 110, max: 125, n: 110 },
    },
    info: {
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
    },
  },
  2: {
    level: 2,
    label: 'Work Experience II',
    baseXP: 63000,
    preliminary: true,
    xpWeights: { duration: 552.1980, mid: 142.9685, final: 486.8958, peer: 462.5177 },
    xpIntercept: -99746.87,
    noteWeights: { duration: 0.3782, mid: 0.3205, final: 0.5344, peer: -0.1690 },
    noteIntercept: -3.29,
    xpImportance: { duration: 35, mid: 15, final: 42, peer: 8 },
    noteImportance: { duration: 19, mid: 32, final: 48, peer: 2 },
    durationGuide: {
      threshold: 110,
      fourMonths: { avg: 101, min: 100, max: 102, n: 12 },
      sixMonths: { avg: 118, min: 114, max: 125, n: 5 },
    },
    info: {
      xpFormula: 'XP ≈ 552·Duration + 143·Mid + 487·Final + 463·Peer − 99747',
      noteFormula: 'Note ≈ 0.38·Duration + 0.32·Mid + 0.53·Final − 0.17·Peer − 3',
      xpAccuracy: 'R² ≈ 0.87 · erreur type ~5 150 XP · n = 17 (préliminaire)',
      noteAccuracy: 'n = 8 seulement → indicatif (± ~4.5 pts)',
      trainingWindow: '2023-2026 (WE II validés, campus de Nice)',
      durationNote:
        "Comme pour WE I, la Duration est en %. Les moyennes réelles WE II (affichées sous le champ) " +
        "aident à estimer. L'échantillon WE II est encore réduit, la durée reste indicative.",
      interceptNote:
        "La constante de la formule XP est un décalage d'équilibrage (elle correspond à des notes = 0, " +
        "qui n'existent jamais), pas un vrai montant.",
      sampleNote:
        "Modèle préliminaire : peu de rendus WE II pour l'instant. Il gagnera en précision à mesure " +
        "que de nouvelles données arrivent.",
    },
  },
};

function dot(weights: StageSubNotes, notes: StageSubNotes): number {
  return (
    weights.duration * notes.duration +
    weights.mid * notes.mid +
    weights.final * notes.final +
    weights.peer * notes.peer
  );
}

/** XP réel prédit d'un stage à partir de ses 4 sous-notes (jamais négatif). */
export function predictStageXP(notes: StageSubNotes, we: WorkExperienceLevel = 1): number {
  const m = STAGE_MODELS[we];
  return Math.max(0, Math.round(dot(m.xpWeights, notes) + m.xpIntercept));
}

/** Note finale prédite (0-125, plafonnée). */
export function predictStageNote(notes: StageSubNotes, we: WorkExperienceLevel = 1): number {
  const m = STAGE_MODELS[we];
  const raw = dot(m.noteWeights, notes) + m.noteIntercept;
  return Math.max(0, Math.min(STAGE_NOTE_CAP, Math.round(raw * 10) / 10));
}

/** Applique le boost coalition (+4.2%) à un montant d'XP. */
export function applyCoalitionBoost(xp: number, boostEnabled: boolean): number {
  return boostEnabled ? Math.round(xp * 1.042) : xp;
}
