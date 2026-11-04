import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { calendarService } from '@/services/calendar.service';
import type { AlternanceLegend } from './alternanceParser';
import {
	defaultDateRange, deserializeProjects, formatDateKey, parseDateRange, sanitizeAlternanceDays, serializeProjects,
	type DateRange, type PlacedProject,
} from './calendarModel';

/**
 * Données de la page Calendrier : chargement, enregistrement, annulation.
 *
 * Deux modes, choisis une fois au montage (App.tsx remonte la page à chaque
 * changement d'utilisateur consulté via `key={viewKey}`) :
 * - propriétaire : localStorage pour un affichage immédiat, puis la base
 *   (qui fait foi, sauf si l'utilisateur a déjà modifié entre-temps) ;
 *   enregistrement différé de 2 s, et vidé au démontage — y compris quand on
 *   part sur le profil d'un autre (saveOwn).
 * - lecture seule (profil d'un autre) : la base UNIQUEMENT. Rien n'est lu ni
 *   écrit dans le localStorage — sinon on montrait ses propres données sous le
 *   nom de l'autre, et on écrasait sa copie locale avec celles de l'autre.
 */

const STORAGE_KEY = 'calendar_projects';
const RANGE_KEY = 'calendar_range';
const ALTERNANCE_KEY = 'calendar_alternance';
const LEGEND_KEY = 'calendar_alternance_legend';
export const HISTORY_LIMIT = 30;
const SAVE_DELAY_MS = 2000;

function readJson(key: string): unknown {
	try {
		const raw = localStorage.getItem(key);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

function writeJson(key: string, value: unknown) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch { /* quota plein ou stockage bloqué : la base reste la source de vérité */ }
}

function readAlternanceDays(): Record<string, string> {
	return sanitizeAlternanceDays(readJson(ALTERNANCE_KEY));
}

function readLegend(): AlternanceLegend | null {
	const raw = readJson(LEGEND_KEY);
	return raw && typeof raw === 'object' ? raw as AlternanceLegend : null;
}

// ── Projets + historique (reducer pur : sûr en StrictMode) ─────────────────

export interface ProjectsState {
	projects: PlacedProject[];
	past: PlacedProject[][];
}

export type ProjectsAction =
	| { type: 'apply'; fn: (prev: PlacedProject[]) => PlacedProject[] }
	| { type: 'replace'; projects: PlacedProject[] }
	| { type: 'undo' };

export function projectsReducer(state: ProjectsState, action: ProjectsAction): ProjectsState {
	switch (action.type) {
		case 'apply': {
			const next = action.fn(state.projects);
			if (next === state.projects) return state;
			return { projects: next, past: [...state.past.slice(-(HISTORY_LIMIT - 1)), state.projects] };
		}
		case 'replace':
			return { projects: action.projects, past: [] };
		case 'undo': {
			if (state.past.length === 0) return state;
			return { projects: state.past[state.past.length - 1], past: state.past.slice(0, -1) };
		}
	}
}

export type ProjectsOp = (prev: PlacedProject[]) => PlacedProject[];

/**
 * Modifications faites PENDANT le chargement, rejouées sur les données de la
 * base quand elles arrivent. Ni « garder le local » (sur un nouvel appareil,
 * la copie locale est vide : placer un projet pendant le chargement effaçait
 * tout en base), ni « garder la base » (la modification était perdue).
 */
export function replayOps(base: PlacedProject[], ops: ProjectsOp[]): PlacedProject[] {
	return ops.reduce((acc, op) => op(acc), base);
}

export type LoadStatus = 'loading' | 'ready' | 'empty' | 'error';

export function useCalendarData(readOnly: boolean) {
	const [{ projects, past }, dispatch] = useReducer(projectsReducer, undefined, () => ({
		projects: readOnly ? [] : deserializeProjects(readJson(STORAGE_KEY)),
		past: [],
	}));
	const [dateRange, setDateRangeState] = useState<DateRange>(() =>
		(readOnly ? null : parseDateRange(readJson(RANGE_KEY))) ?? defaultDateRange());
	const [alternanceDays, setAlternanceDays] = useState<Record<string, string>>(() =>
		readOnly ? {} : readAlternanceDays());
	const [alternanceLegend, setAlternanceLegend] = useState<AlternanceLegend | null>(() =>
		readOnly ? null : readLegend());
	const [status, setStatus] = useState<LoadStatus>('loading');
	const [dbSynced, setDbSynced] = useState(false);
	// Enregistrer en base seulement si l'utilisateur a modifié quelque chose, ou
	// pour y créer le calendrier la première fois (rien en base, copie locale).
	// Sinon chaque ouverture de la page renvoyait au serveur ce qu'elle venait
	// de recevoir — ou pire, l'état périmé d'un vieil onglet.
	const dirtyRef = useRef(false);
	const needsFirstSaveRef = useRef(false);
	// Pendant le chargement : modifications à rejouer, et champs que l'utilisateur
	// a lui-même changés (ceux-là seuls priment sur la base).
	const loadedRef = useRef(false);
	const opsDuringLoadRef = useRef<ProjectsOp[]>([]);
	const rangeTouchedRef = useRef(false);
	const alternanceTouchedRef = useRef(false);
	const pastLengthRef = useRef(past.length);
	pastLengthRef.current = past.length;

	// ── Chargement depuis la base ──────────────────────────────────────────
	useEffect(() => {
		let cancelled = false;
		calendarService.load().then(data => {
			if (cancelled) return;
			if (!data) {
				needsFirstSaveRef.current = !readOnly;
				setStatus(readOnly ? 'empty' : 'ready');
				return;
			}
			// La base fait foi ; les modifications faites pendant le chargement sont
			// rejouées par-dessus (et seront enregistrées, dirtyRef étant vrai).
			const ops = opsDuringLoadRef.current;
			opsDuringLoadRef.current = [];
			dispatch({ type: 'replace', projects: replayOps(deserializeProjects(data.placedProjects), ops) });
			if (!rangeTouchedRef.current) {
				const range = parseDateRange(data.dateRange);
				if (range) setDateRangeState(range);
			}
			if (!alternanceTouchedRef.current) {
				const days = sanitizeAlternanceDays(data.alternanceDays);
				if (Object.keys(days).length > 0) setAlternanceDays(days);
			}
			setStatus('ready');
		}).catch(() => {
			if (cancelled) return;
			// Propriétaire : on garde la copie locale. Consultation : rien à montrer.
			setStatus(readOnly ? 'error' : 'ready');
		}).finally(() => {
			if (cancelled) return;
			loadedRef.current = true;
			opsDuringLoadRef.current = [];
			setDbSynced(true);
		});
		return () => { cancelled = true; };
	}, [readOnly]);

	// ── Copie locale (propriétaire uniquement) ─────────────────────────────
	// On n'écrit que ce qui a CHANGÉ depuis le montage : réécrire au montage
	// ce qu'on vient de lire ne sert à rien, et un onglet ouvert avec un état
	// périmé écrasait alors les données d'un autre onglet (constaté : planning
	// d'alternance vidé).
	const initialRef = useRef({ projects, dateRange, alternanceDays, alternanceLegend });
	useEffect(() => {
		if (readOnly || projects === initialRef.current.projects) return;
		writeJson(STORAGE_KEY, projects);
	}, [projects, readOnly]);
	useEffect(() => {
		if (readOnly || dateRange === initialRef.current.dateRange) return;
		writeJson(RANGE_KEY, { start: formatDateKey(dateRange.start), end: formatDateKey(dateRange.end) });
	}, [dateRange, readOnly]);
	useEffect(() => {
		if (readOnly || alternanceDays === initialRef.current.alternanceDays) return;
		writeJson(ALTERNANCE_KEY, alternanceDays);
	}, [alternanceDays, readOnly]);
	useEffect(() => {
		if (readOnly || alternanceLegend === initialRef.current.alternanceLegend) return;
		try {
			if (alternanceLegend) localStorage.setItem(LEGEND_KEY, JSON.stringify(alternanceLegend));
			else localStorage.removeItem(LEGEND_KEY);
		} catch { /* idem */ }
	}, [alternanceLegend, readOnly]);

	// ── Enregistrement en base (différé, vidé au démontage) ────────────────
	const pendingRef = useRef<(() => void) | null>(null);
	useEffect(() => {
		if (readOnly) return;
		// Une modification part même si la base n'a pas encore répondu (sinon, quitter
		// la page avant la réponse la perdait) ; la première création, elle, attend de
		// savoir que la base est vide.
		const firstSave = dbSynced && needsFirstSaveRef.current;
		if (!dirtyRef.current && !firstSave) return;
		needsFirstSaveRef.current = false;
		const payload = {
			placedProjects: serializeProjects(projects),
			dateRange: { start: formatDateKey(dateRange.start), end: formatDateKey(dateRange.end) },
			alternanceDays,
		};
		const run = () => {
			pendingRef.current = null;
			// saveOwn : cette instance est propriétaire depuis son montage (la garde
			// « profil consulté » de save() annulait l'enregistrement du démontage).
			calendarService.saveOwn(payload).catch(() => { /* la copie locale garde les données */ });
		};
		pendingRef.current = run;
		const timer = setTimeout(run, SAVE_DELAY_MS);
		return () => clearTimeout(timer);
	}, [projects, dateRange, alternanceDays, dbSynced, readOnly]);
	useEffect(() => () => { pendingRef.current?.(); }, []);

	// ── API ────────────────────────────────────────────────────────────────
	const apply = useCallback((fn: ProjectsOp) => {
		if (readOnly) return;
		dirtyRef.current = true;
		if (!loadedRef.current) opsDuringLoadRef.current.push(fn);
		dispatch({ type: 'apply', fn });
	}, [readOnly]);

	const undo = useCallback(() => {
		// Rien à annuler, ou chargement en cours (l'historique va être remplacé) :
		// surtout ne pas marquer « modifié », ce qui enverrait l'état local en base.
		if (readOnly || !loadedRef.current || pastLengthRef.current === 0) return;
		dirtyRef.current = true;
		dispatch({ type: 'undo' });
	}, [readOnly]);

	const setDateRange = useCallback((range: DateRange) => {
		if (readOnly) return;
		dirtyRef.current = true;
		rangeTouchedRef.current = true;
		setDateRangeState(range);
	}, [readOnly]);

	const setAlternance = useCallback((days: Record<string, string>, legend: AlternanceLegend | null) => {
		if (readOnly) return;
		dirtyRef.current = true;
		alternanceTouchedRef.current = true;
		setAlternanceDays(sanitizeAlternanceDays(days));
		setAlternanceLegend(legend);
	}, [readOnly]);

	return {
		projects,
		canUndo: past.length > 0,
		dateRange,
		alternanceDays,
		alternanceLegend,
		status,
		apply,
		undo,
		setDateRange,
		setAlternance,
	};
}
