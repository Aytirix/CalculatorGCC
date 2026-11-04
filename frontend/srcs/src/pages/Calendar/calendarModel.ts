/**
 * Calculs purs de la page Calendrier.
 *
 * Tout ce qui décide d'une date, d'une ligne ou d'un compteur vit ici, hors de
 * React : un calcul faux n'affiche pas d'erreur, il affiche une barre au
 * mauvais endroit — donc on le teste (calendarModel.test.ts).
 *
 * Convention héritée (et conservée pour ne pas réinterpréter les données déjà
 * en base) : `endDate` est EXCLUSIVE pour le chevauchement et la largeur —
 * un projet du 1er au 15 occupe 14 jours.
 */

import type { AlternanceLegend } from './alternanceParser';
import type { PlacedProjectData } from '@/services/calendar.service';

export type { PlacedProjectData };

// ── Types ──────────────────────────────────────────────────────────────────

export type CalendarView = 'chronologie' | 'mois' | 'agenda';

export interface PlacedProject {
	id: string;
	projectId: string;
	name: string;
	xp: number;
	startDate: Date;
	endDate: Date;
	/** Conservé pour la compatibilité du format en base ; recalculé à l'enregistrement. */
	row: number;
}


export interface DateRange {
	start: Date;
	end: Date;
}

export type AlternanceKind = 'ecole' | 'entreprise' | 'distanciel';

// ── Dates ──────────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function startOfDay(date: Date): Date {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d;
}

export function startOfWeek(date: Date): Date {
	const d = startOfDay(date);
	const day = d.getDay();
	d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
	return d;
}

export function addDays(date: Date, days: number): Date {
	const d = new Date(date);
	d.setDate(d.getDate() + days);
	return d;
}

/** Nombre de jours calendaires de `a` à `b` (arrondi : insensible au changement d'heure). */
export function diffDays(a: Date, b: Date): number {
	return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_PER_DAY);
}

export function isSameDay(a: Date, b: Date): boolean {
	return a.getFullYear() === b.getFullYear()
		&& a.getMonth() === b.getMonth()
		&& a.getDate() === b.getDate();
}

export function formatDateKey(date: Date): string {
	// Année sur 4 chiffres : « 999-01-01 » serait refusé par le champ date et le backend.
	const y = String(date.getFullYear()).padStart(4, '0');
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

export function parseDateKey(key: string): Date {
	return new Date(key + 'T00:00:00');
}

export function isValidDate(d: Date): boolean {
	return d instanceof Date && !isNaN(d.getTime());
}

const FMT_SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const FMT_SHORT_YEAR = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const FMT_LONG = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const FMT_MONTH_YEAR = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

export const formatShort = (d: Date) => FMT_SHORT.format(d);
export const formatShortYear = (d: Date) => FMT_SHORT_YEAR.format(d);
export const formatLong = (d: Date) => capitalize(FMT_LONG.format(d));
export const formatMonthYear = (d: Date) => capitalize(FMT_MONTH_YEAR.format(d));

export function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

export function plural(n: number, word: string, pluralWord = word + 's'): string {
	return `${n} ${Math.abs(n) > 1 ? pluralWord : word}`;
}

export function formatXp(xp: number): string {
	return xp.toLocaleString('fr-FR');
}

// ── Jours fériés (France métropolitaine) ───────────────────────────────────

function getEasterSunday(year: number): Date {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31);
	const day = ((h + l - 7 * m + 114) % 31) + 1;
	return new Date(year, month - 1, day);
}

const holidayCache = new Map<number, Map<string, string>>();

/** Clé 'YYYY-MM-DD' → nom du jour férié. */
export function getFrenchHolidays(year: number): Map<string, string> {
	const cached = holidayCache.get(year);
	if (cached) return cached;
	const easter = getEasterSunday(year);
	const map = new Map<string, string>([
		[formatDateKey(new Date(year, 0, 1)), 'Jour de l’an'],
		[formatDateKey(addDays(easter, 1)), 'Lundi de Pâques'],
		[formatDateKey(new Date(year, 4, 1)), 'Fête du Travail'],
		[formatDateKey(new Date(year, 4, 8)), 'Victoire 1945'],
		[formatDateKey(addDays(easter, 39)), 'Ascension'],
		[formatDateKey(addDays(easter, 50)), 'Lundi de Pentecôte'],
		[formatDateKey(new Date(year, 6, 14)), 'Fête nationale'],
		[formatDateKey(new Date(year, 7, 15)), 'Assomption'],
		[formatDateKey(new Date(year, 10, 1)), 'Toussaint'],
		[formatDateKey(new Date(year, 10, 11)), 'Armistice'],
		[formatDateKey(new Date(year, 11, 25)), 'Noël'],
	]);
	holidayCache.set(year, map);
	return map;
}

export function getHolidayName(date: Date): string | null {
	return getFrenchHolidays(date.getFullYear()).get(formatDateKey(date)) ?? null;
}

// ── Grille de la frise ─────────────────────────────────────────────────────

export interface TimelineGrid {
	/** Lundi de la semaine qui contient le début de la période. */
	gridStart: Date;
	weekCount: number;
	totalDays: number;
}

export function getTimelineGrid(range: DateRange): TimelineGrid {
	const gridStart = startOfWeek(range.start);
	const lastMonday = startOfWeek(range.end);
	const weekCount = Math.max(1, diffDays(gridStart, lastMonday) / 7 + 1);
	return { gridStart, weekCount, totalDays: weekCount * 7 };
}

export interface MonthSegment {
	label: string;
	startDay: number;
	days: number;
}

/** Mois découpés AU JOUR PRÈS (et non à la semaine) sur la grille. */
export function getMonthSegments(gridStart: Date, totalDays: number): MonthSegment[] {
	const segments: MonthSegment[] = [];
	let i = 0;
	while (i < totalDays) {
		const d = addDays(gridStart, i);
		const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
		const days = Math.min(diffDays(d, nextMonth), totalDays - i);
		segments.push({ label: formatMonthYear(d), startDay: i, days });
		i += days;
	}
	return segments;
}

export interface HolidayMark {
	day: number;
	name: string;
	date: Date;
}

export function getHolidayMarks(gridStart: Date, totalDays: number): HolidayMark[] {
	const marks: HolidayMark[] = [];
	for (let i = 0; i < totalDays; i++) {
		const date = addDays(gridStart, i);
		const name = getHolidayName(date);
		if (name) marks.push({ day: i, name, date });
	}
	return marks;
}

// ── Rangement automatique des projets en lignes ────────────────────────────

/**
 * Range chaque projet dans la première ligne libre (algorithme glouton par
 * date de début). Deux projets d'une même ligne ne se chevauchent jamais.
 * L'ordre de départ est stable (début, fin, id) pour que les lignes ne
 * « sautent » pas d'un rendu à l'autre.
 */
export function packLanes(projects: PlacedProject[], minLanes = 3): { lanes: Map<string, number>; laneCount: number } {
	const sorted = [...projects].sort((a, b) =>
		a.startDate.getTime() - b.startDate.getTime()
		|| a.endDate.getTime() - b.endDate.getTime()
		|| a.id.localeCompare(b.id));
	const laneEnds: number[] = [];
	const lanes = new Map<string, number>();
	for (const p of sorted) {
		const start = p.startDate.getTime();
		let lane = laneEnds.findIndex(end => end <= start);
		if (lane === -1) {
			lane = laneEnds.length;
			laneEnds.push(p.endDate.getTime());
		} else {
			laneEnds[lane] = p.endDate.getTime();
		}
		lanes.set(p.id, lane);
	}
	return { lanes, laneCount: Math.max(minLanes, laneEnds.length) };
}

export function projectOverlaps(p: PlacedProject, from: Date, to: Date): boolean {
	return p.startDate < to && p.endDate > from;
}

export function projectOverlapsDay(p: PlacedProject, day: Date): boolean {
	const start = startOfDay(day);
	return projectOverlaps(p, start, addDays(start, 1));
}

// ── Statut ─────────────────────────────────────────────────────────────────

export type ProjectStatus = 'done' | 'active' | 'upcoming';

export function getProjectStatus(p: PlacedProject, today: Date): { status: ProjectStatus; daysLeft: number; daysUntilStart: number; progress: number } {
	const t = startOfDay(today);
	const duration = Math.max(1, diffDays(p.startDate, p.endDate));
	const daysLeft = diffDays(t, p.endDate);
	const daysUntilStart = diffDays(t, p.startDate);
	let status: ProjectStatus;
	if (daysLeft <= 0) status = 'done';
	else if (daysUntilStart <= 0) status = 'active';
	else status = 'upcoming';
	const elapsed = Math.min(duration, Math.max(0, diffDays(p.startDate, t)));
	return { status, daysLeft, daysUntilStart, progress: Math.round((elapsed / duration) * 100) };
}

// ── Alternance ─────────────────────────────────────────────────────────────

/**
 * Couleurs du rythme d'alternance : CELLES DE L'APP, plus celles du .xlsx. À
 * l'import, chaque jour reçoit la couleur de son type ; c'est elle qui est
 * enregistrée en base. Le type se lit donc directement dans la couleur, sur
 * tous les appareils — avant, il dépendait de la légende du fichier, gardée
 * seulement dans le navigateur qui l'avait importé (légende vide, « jours
 * d'école » à « — » partout ailleurs).
 */
export const ALTERNANCE_COLORS: Record<AlternanceKind, string> = {
	ecole: '#4f7be8',
	entreprise: '#ef8a3c',
	distanciel: '#2ea88a',
};

export const ALTERNANCE_KINDS: AlternanceKind[] = ['ecole', 'entreprise', 'distanciel'];

export function classifyAlternanceColor(color: string | undefined, legend: AlternanceLegend | null): AlternanceKind | null {
	if (!color) return null;
	const c = color.toLowerCase();
	for (const kind of ALTERNANCE_KINDS) if (ALTERNANCE_COLORS[kind] === c) return kind;
	if (!legend) return null;
	if (legend.ecole && legend.ecole.toLowerCase() === c) return 'ecole';
	if (legend.distanciel && legend.distanciel.toLowerCase() === c) return 'distanciel';
	if (legend.entreprise && legend.entreprise.toLowerCase() === c) return 'entreprise';
	return null;
}

/**
 * Remplace chaque couleur du fichier par la couleur de l'app pour son type —
 * sans rien demander à l'utilisateur :
 * 1. la légende du .xlsx décide quand elle est connue ;
 * 2. sinon, les couleurs restantes sont rattachées par fréquence : la plus
 *    présente devient Entreprise (l'alternance compte plus de jours en
 *    entreprise qu'à l'école), puis École, puis Distanciel. Au-delà de trois
 *    couleurs, les jours en trop sont ignorés.
 * Déterministe : le même planning donne le même résultat sur tous les appareils.
 */
const AUTO_ASSIGN_ORDER: AlternanceKind[] = ['entreprise', 'ecole', 'distanciel'];

export function normalizeAlternanceDays(days: Record<string, string>, legend: AlternanceLegend | null): Record<string, string> {
	const mapping = new Map<string, AlternanceKind>();
	const used = new Set<AlternanceKind>();
	for (const color of new Set(Object.values(days).map(c => c.toLowerCase()))) {
		const kind = classifyAlternanceColor(color, legend);
		if (kind) { mapping.set(color, kind); used.add(kind); }
	}
	const free = AUTO_ASSIGN_ORDER.filter(k => !used.has(k));
	for (const { color } of unknownAlternanceColors(days, legend)) {
		const kind = free.shift();
		if (!kind) break;
		mapping.set(color, kind);
	}
	let changed = false;
	const out: Record<string, string> = {};
	for (const [key, color] of Object.entries(days)) {
		const kind = mapping.get(color.toLowerCase());
		if (!kind) { changed = true; continue; } // 4ᵉ couleur et suivantes : ignorée
		const next = ALTERNANCE_COLORS[kind];
		if (next !== color) changed = true;
		out[key] = next;
	}
	return changed ? out : days;
}

/** Couleurs du planning non reconnues (ni couleur de l'app, ni légende), des plus fréquentes aux plus rares. */
export function unknownAlternanceColors(days: Record<string, string>, legend: AlternanceLegend | null = null): { color: string; days: number }[] {
	const counts = new Map<string, number>();
	for (const color of Object.values(days)) {
		if (classifyAlternanceColor(color, legend)) continue;
		const c = color.toLowerCase();
		counts.set(c, (counts.get(c) ?? 0) + 1);
	}
	return [...counts].map(([color, n]) => ({ color, days: n })).sort((a, b) => b.days - a.days);
}

/** Types présents dans le planning (pour la légende). */
export function alternanceKindsPresent(days: Record<string, string>): AlternanceKind[] {
	const present = new Set(Object.values(days).map(c => classifyAlternanceColor(c, null)).filter(Boolean));
	return ALTERNANCE_KINDS.filter(k => present.has(k));
}

export const ALTERNANCE_LABELS: Record<AlternanceKind, string> = {
	ecole: 'École',
	entreprise: 'Entreprise',
	distanciel: 'Distanciel',
};

export interface AlternanceRun {
	startDay: number;
	days: number;
	color: string;
	kind: AlternanceKind | null;
}

/** Jours consécutifs de même couleur regroupés en segments, sur la grille. */
export function getAlternanceRuns(
	alternanceDays: Record<string, string>,
	legend: AlternanceLegend | null,
	gridStart: Date,
	totalDays: number,
): AlternanceRun[] {
	const runs: AlternanceRun[] = [];
	for (let i = 0; i < totalDays; i++) {
		const color = alternanceDays[formatDateKey(addDays(gridStart, i))];
		if (!color) continue;
		const last = runs[runs.length - 1];
		if (last && last.color === color && last.startDay + last.days === i) {
			last.days++;
		} else {
			runs.push({ startDay: i, days: 1, color, kind: classifyAlternanceColor(color, legend) });
		}
	}
	return runs;
}

/**
 * Jours d'école (présentiel ou distanciel) dans [from, to).
 * null si la légende ne permet pas de savoir quelle couleur est l'école.
 */
export function countSchoolDays(
	alternanceDays: Record<string, string>,
	legend: AlternanceLegend | null,
	from: Date,
	to: Date,
): number | null {
	// Inconnu seulement si aucun jour du planning n'est rattaché à un type.
	const known = Object.values(alternanceDays).some(c => classifyAlternanceColor(c, legend) !== null);
	if (!known) return null;
	const fromKey = formatDateKey(from);
	const toKey = formatDateKey(to);
	let n = 0;
	for (const [key, color] of Object.entries(alternanceDays)) {
		if (key < fromKey || key >= toKey) continue;
		const kind = classifyAlternanceColor(color, legend);
		if (kind === 'ecole' || kind === 'distanciel') n++;
	}
	return n;
}

/** Couleur de texte lisible (noir ou blanc) sur un fond hex arbitraire. */
export function readableTextColor(hex: string): '#000000' | '#ffffff' {
	const m = /^#?([0-9a-f]{6})$/i.exec(hex);
	if (!m) return '#000000';
	const n = parseInt(m[1], 16);
	const channel = (v: number) => {
		const s = v / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	const lum = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
	// Noir pur plutôt qu'un gris très foncé : sur un rouge Excel #FF0000, #14171c
	// ne donnait que 4,49:1 (sous le seuil de 4,5:1), le noir donne 5,25:1.
	return (lum + 0.05) / 0.05 >= 1.05 / (lum + 0.05) ? '#000000' : '#ffffff';
}

// ── Édition ────────────────────────────────────────────────────────────────

export const DEFAULT_PROJECT_DAYS = 14;

/** Décale tout le projet de `days` jours. */
export function moveProject(p: PlacedProject, days: number): PlacedProject {
	if (days === 0) return p;
	return { ...p, startDate: addDays(p.startDate, days), endDate: addDays(p.endDate, days) };
}

/** Déplace un bord ; la durée ne descend jamais sous 1 jour. */
export function resizeProject(p: PlacedProject, edge: 'start' | 'end', days: number): PlacedProject {
	if (days === 0) return p;
	if (edge === 'start') {
		const latest = addDays(p.endDate, -1);
		const next = addDays(p.startDate, days);
		return { ...p, startDate: next > latest ? latest : next };
	}
	const earliest = addDays(p.startDate, 1);
	const next = addDays(p.endDate, days);
	return { ...p, endDate: next < earliest ? earliest : next };
}

export function setProjectDuration(p: PlacedProject, days: number): PlacedProject {
	return { ...p, endDate: addDays(p.startDate, Math.max(1, Math.round(days))) };
}

/** Date de départ quand on place un projet sans le glisser : aujourd'hui si visible, sinon le début de la période. */
export function defaultPlacementDate(today: Date, range: DateRange): Date {
	const t = startOfDay(today);
	if (t >= startOfDay(range.start) && t <= startOfDay(range.end)) return t;
	return startOfDay(range.start);
}

export function newPlacedProject(
	source: { id: string; name: string; xp: number },
	start: Date,
	now: number = Date.now(),
): PlacedProject {
	const s = startOfDay(start);
	return {
		id: `${source.id}-${now}`,
		projectId: source.id,
		name: source.name,
		xp: source.xp,
		startDate: s,
		endDate: addDays(s, DEFAULT_PROJECT_DAYS),
		row: 0,
	};
}

// ── Vue ────────────────────────────────────────────────────────────────────

/**
 * Lit la vue mémorisée. 'semaine' (vue supprimée) bascule sur 'mois' ;
 * sans préférence, un écran étroit démarre sur la liste.
 */
export function normalizeView(stored: string | null, isNarrow: boolean): CalendarView {
	if (stored === 'chronologie' || stored === 'mois' || stored === 'agenda') return stored;
	if (stored === 'semaine') return 'mois';
	return isNarrow ? 'agenda' : 'chronologie';
}

// ── Sérialisation ──────────────────────────────────────────────────────────

export function defaultDateRange(today: Date = new Date()): DateRange {
	return {
		start: new Date(today.getFullYear(), today.getMonth(), 1),
		end: new Date(today.getFullYear(), today.getMonth() + 6, 0),
	};
}

export function deserializeProjects(raw: unknown): PlacedProject[] {
	if (!Array.isArray(raw)) return [];
	const out: PlacedProject[] = [];
	const seen = new Set<string>();
	for (const item of raw) {
		if (!item || typeof item !== 'object') continue;
		const p = item as Record<string, unknown>;
		const startDate = new Date(p.startDate as string);
		const endDate = new Date(p.endDate as string);
		if (typeof p.id !== 'string' || typeof p.projectId !== 'string' || typeof p.name !== 'string') continue;
		// Champs vides : refusés par le backend, ils bloqueraient TOUS les enregistrements suivants.
		if (!p.id || !p.projectId || !p.name || seen.has(p.id)) continue;
		if (typeof p.startDate !== 'string' || typeof p.endDate !== 'string') continue;
		if (!isValidDate(startDate) || !isValidDate(endDate) || endDate <= startDate) continue;
		seen.add(p.id);
		out.push({
			id: p.id,
			projectId: p.projectId,
			name: p.name,
			xp: typeof p.xp === 'number' && isFinite(p.xp) ? clampXp(p.xp) : 0,
			startDate,
			endDate,
			row: typeof p.row === 'number' ? p.row : 0,
		});
	}
	return out;
}

/** Format en base : `row` = ligne calculée (le backend l'exige entre 0 et 200). */
export function serializeProjects(projects: PlacedProject[]): PlacedProjectData[] {
	const { lanes } = packLanes(projects);
	return projects.map(p => ({
		id: p.id,
		projectId: p.projectId,
		name: p.name,
		xp: clampXp(p.xp),
		startDate: p.startDate.toISOString(),
		endDate: p.endDate.toISOString(),
		row: Math.min(200, lanes.get(p.id) ?? 0),
	}));
}

// Bornes de la période : une période de 9 000 ans (acceptée jusqu'ici par le
// backend) créait des millions d'éléments et figeait l'onglet de quiconque
// consultait ce profil. Les mêmes bornes sont imposées par le backend.
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;
export const MAX_RANGE_DAYS = 3660; // ≈ 10 ans : largement plus qu'un contrat d'alternance

/** Message d'erreur si la période est invalide, sinon null. */
export function validateDateRange(start: Date, end: Date): string | null {
	if (!isValidDate(start) || !isValidDate(end)) return 'Choisis une date de début et une date de fin.';
	if (start.getFullYear() < MIN_YEAR || end.getFullYear() > MAX_YEAR) return `Choisis des dates entre ${MIN_YEAR} et ${MAX_YEAR}.`;
	if (end < start) return 'La fin doit être après le début.';
	if (diffDays(start, end) > MAX_RANGE_DAYS) return 'La période ne peut pas dépasser 10 ans.';
	return null;
}

export function parseDateRange(raw: unknown): DateRange | null {
	if (!raw || typeof raw !== 'object') return null;
	const { start, end } = raw as { start?: unknown; end?: unknown };
	if (typeof start !== 'string' || typeof end !== 'string') return null;
	const s = parseDateKey(start);
	const e = parseDateKey(end);
	if (validateDateRange(s, e) !== null) return null;
	return { start: s, end: e };
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;
export const MAX_ALTERNANCE_DAYS = 2000; // limite du backend

/**
 * Garde uniquement les entrées « YYYY-MM-DD » → « #RRGGBB » (ce que le backend
 * accepte) : une seule couleur invalide venue d'un .xlsx faisait refuser chaque
 * enregistrement, sans rien dire.
 */
export function sanitizeAlternanceDays(raw: unknown): Record<string, string> {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
	const entries = Object.entries(raw as Record<string, unknown>)
		.filter((e): e is [string, string] => DATE_KEY_RE.test(e[0]) && typeof e[1] === 'string' && HEX_RE.test(e[1]))
		.sort((a, b) => (a[0] < b[0] ? -1 : 1))
		.slice(0, MAX_ALTERNANCE_DAYS);
	return Object.fromEntries(entries);
}

function clampXp(xp: number): number {
	return Math.min(100_000, Math.max(0, Math.round(xp)));
}
