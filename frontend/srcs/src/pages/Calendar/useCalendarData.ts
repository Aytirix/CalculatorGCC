import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { calendarService } from '@/services/calendar.service';
import type { AlternanceLegend } from './alternanceParser';
import {
	defaultDateRange, deserializeProjects, formatDateKey, normalizeAlternanceDays, parseDateRange, sanitizeAlternanceDays, serializeProjects,
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
// État de la copie locale du planning par rapport à la base : 'synced' (la base
// a reçu cette version) ou 'pending:<id>:<empreinte>' (modifiée ici, pas encore
// confirmée par la base ; empreinte = planning de la base connu au moment de la
// modification, '?' si inconnu) suivi du login du compte qui l'a faite : sur un
// navigateur partagé, la modification d'un compte ne doit jamais partir dans la
// base d'un autre. Absent : navigateur d'avant ce marqueur.
const ALTERNANCE_SYNC_KEY = 'calendar_alternance_sync';
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
	// Un planning importé avant le passage aux couleurs de l'app est converti à la
	// lecture, si la légende du fichier est connue dans ce navigateur.
	return normalizeAlternanceDays(sanitizeAlternanceDays(readJson(ALTERNANCE_KEY)), readLegend());
}

export type AlternanceSync = 'synced' | 'unknown' | { pendingBase: string };

/** Empreinte courte et stable d'un planning (ordre des clés indifférent). */
export function alternanceFingerprint(days: Record<string, string>): string {
	const text = Object.keys(days).sort().map(k => `${k}=${days[k]}`).join(';');
	let h = 5381;
	for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
	return `${Object.keys(days).length}-${h.toString(36)}`;
}

// Jetons « en attente » créés par CET onglet : seul l'onglet qui a fait la
// modification peut la déclarer confirmée (un autre onglet, resté sur une
// version périmée, enverrait autre chose avec le même jeton).
const ownPendingTokens = new Set<string>();

function readAlternanceSyncRaw(): string | null {
	try { return localStorage.getItem(ALTERNANCE_SYNC_KEY); } catch { return null; }
}

function writeAlternanceSyncRaw(value: string) {
	try { localStorage.setItem(ALTERNANCE_SYNC_KEY, value); } catch { /* idem */ }
}

/**
 * Jeton d'un envoi fait pendant que la question « garder le planning de cet
 * appareil ? » est ouverte : ne correspond jamais au marqueur, donc l'envoi ne
 * déclare RIEN confirmé (sinon le planning local, jamais envoyé, était perdu au
 * rechargement suivant sans que l'utilisateur ait répondu).
 */
export const UNDECIDED_SYNC_TOKEN = 'undecided';

/** Nouveau jeton « en attente », retenu comme créé par cet onglet. */
export function pendingToken(base: string, login: string | null): string {
	const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
	const token = `pending:${id}:${base}:${encodeURIComponent(login ?? '')}`;
	ownPendingTokens.add(token);
	return token;
}

/** Marqueur lu pour le compte `login` : une attente d'un AUTRE compte ne compte pas. */
export function readAlternanceSync(login: string | null): AlternanceSync {
	const raw = readAlternanceSyncRaw();
	if (raw === 'synced') return 'synced';
	if (raw?.startsWith('pending:')) {
		const [, , base, owner] = raw.split(':');
		if (!login || owner === undefined || decodeURIComponent(owner) !== login) return 'synced';
		return { pendingBase: base || '?' };
	}
	return 'unknown';
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

export interface CalendarSnapshot {
	projects: PlacedProject[];
	dateRange: DateRange;
	alternanceDays: Record<string, string>;
}

/**
 * Planning d'alternance à garder au chargement : celui de la base ou la copie
 * locale. La base fait foi, MÊME VIDE, quand la copie locale lui a déjà été
 * envoyée ('synced') : un planning effacé sur un autre appareil revenait sinon
 * depuis ce navigateur. La copie locale l'emporte quand elle contient une
 * modification pas encore confirmée par la base (« en attente » : effacé puis
 * page rechargée avant l'envoi, envoi en échec…) — SAUF si la base a changé
 * depuis cette modification (autre appareil) : la version la plus récente de
 * la base gagne alors —, ou quand l'utilisateur l'a changée pendant le
 * chargement. Navigateur sans marqueur, base vide et copie locale remplie :
 * impossible de savoir si c'est un effacement fait ailleurs (le backend renvoie
 * toujours `{}` par défaut) ou un planning jamais envoyé — 'ask' : on affiche la
 * copie locale SANS l'envoyer et on demande à l'utilisateur.
 */
export function alternanceSource(
	dbAlternanceDays: unknown,
	touched: boolean,
	localSync: AlternanceSync,
	localHasDays = true,
): 'db' | 'local' | 'ask' {
	if (touched || dbAlternanceDays == null) return 'local';
	if (typeof localSync === 'object') {
		const base = localSync.pendingBase;
		return base === '?' || base === alternanceFingerprint(sanitizeAlternanceDays(dbAlternanceDays)) ? 'local' : 'db';
	}
	if (localSync === 'unknown' && localHasDays && Object.keys(sanitizeAlternanceDays(dbAlternanceDays)).length === 0) return 'ask';
	return 'db';
}

/**
 * Ce que la page doit afficher (et enregistrer) une fois la réponse de la base
 * arrivée : les projets de la base avec les modifications du chargement
 * rejouées ; période locale seulement si l'utilisateur l'a changée ; planning
 * selon `alternanceSource`. Base vide (`null`) : la copie locale, qui contient
 * déjà ces modifications. Sert aussi quand on quitte la page avant la réponse :
 * on attend la base, on fusionne, PUIS on enregistre — jamais l'état local seul.
 */
export function mergeAfterLoad(
	db: { placedProjects?: unknown; dateRange?: unknown; alternanceDays?: unknown } | null,
	local: CalendarSnapshot,
	ops: ProjectsOp[],
	touched: { range: boolean; alternance: boolean },
	localSync: AlternanceSync = 'synced',
): CalendarSnapshot {
	if (!db) return local;
	const dbRange = parseDateRange(db.dateRange);
	return {
		projects: replayOps(deserializeProjects(db.placedProjects), ops),
		dateRange: touched.range || !dbRange ? local.dateRange : dbRange,
		// 'ask' : la copie locale reste affichée en attendant la réponse de l'utilisateur.
		alternanceDays: alternanceSource(db.alternanceDays, touched.alternance, localSync, Object.keys(local.alternanceDays).length > 0) !== 'db'
			? local.alternanceDays
			: sanitizeAlternanceDays(db.alternanceDays),
	};
}

function toPayload(snap: CalendarSnapshot) {
	return {
		placedProjects: serializeProjects(snap.projects),
		dateRange: { start: formatDateKey(snap.dateRange.start), end: formatDateKey(snap.dateRange.end) },
		alternanceDays: snap.alternanceDays,
	};
}

export type LoadStatus = 'loading' | 'ready' | 'empty' | 'error';

/**
 * File des enregistrements, PARTAGÉE entre les montages de la page (niveau
 * module). Quitter la page puis y revenir crée une nouvelle instance : sans
 * file, son chargement pouvait lire la base AVANT que l'ancienne n'y ait écrit
 * (la modification disparaissait), ou l'ancienne écraser ce que la nouvelle
 * venait d'enregistrer. Tous les PUT passent par cette file, dans l'ordre, et
 * le chargement propriétaire attend qu'elle soit vide — au plus quelques
 * secondes, pour qu'un envoi bloqué ne fige jamais la page.
 */
let saveQueue: Promise<void> = Promise.resolve();
// Chaque tâche est BORNÉE (les requêtes elles-mêmes expirent à 15 s) : une
// tâche pendue bloquait tous les envois suivants. Le chargement peut donc
// attendre la file entière, sans plafond séparé (un plafond le laissait lire la
// base avant l'écriture de l'instance précédente).
const SAVE_TASK_MAX_MS = 20_000;

function withTimeout(promise: Promise<unknown>, ms: number): Promise<unknown> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return Promise.race([
		promise,
		new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); }),
	]).finally(() => clearTimeout(timer));
}

function enqueueSave(task: () => Promise<unknown>): void {
	saveQueue = saveQueue.then(() => withTimeout(task(), SAVE_TASK_MAX_MS)).then(() => undefined, () => undefined);
}

/**
 * Enregistre puis, si le planning local n'a pas changé depuis la préparation de
 * l'envoi (même jeton, créé par cet onglet), le marque « confirmé par la base ».
 */
export function saveOwnAndMark(
	payload: ReturnType<typeof toPayload>,
	syncToken: string | null,
	onSaved?: () => void,
): Promise<void> {
	return calendarService.saveOwn(payload).then(() => {
		onSaved?.();
		if (readAlternanceSyncRaw() !== syncToken) return;
		if (syncToken === null || ownPendingTokens.has(syncToken)) {
			if (syncToken) ownPendingTokens.delete(syncToken);
			writeAlternanceSyncRaw('synced');
		}
	});
}

function waitForSaveQueue(): Promise<void> {
	return saveQueue;
}

export function useCalendarData(readOnly: boolean, ownerLogin: string | null) {
	const ownerLoginRef = useRef(ownerLogin);
	ownerLoginRef.current = ownerLogin;
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
	// Chargement échoué : on n'enregistre plus rien (la copie locale peut être
	// vide ou périmée, l'envoyer écraserait la base) et on le dit à l'utilisateur.
	const loadFailedRef = useRef(false);
	const [syncError, setSyncError] = useState(false);
	const loadPromiseRef = useRef<Promise<unknown> | null>(null);
	const latestRef = useRef<CalendarSnapshot>({ projects, dateRange, alternanceDays });
	latestRef.current = { projects, dateRange, alternanceDays };
	const legendRef = useRef(alternanceLegend);
	legendRef.current = alternanceLegend;
	// Fusion avec la base faite, mais l'enregistrement pas encore programmé (il
	// l'est au rendu suivant) : si la page se démonte entre les deux, c'est ce
	// résultat-là qu'on enregistre — surtout pas latestRef, encore pré-fusion.
	const unsavedMergeRef = useRef<CalendarSnapshot | null>(null);
	// Empreinte du planning que la base contient (dernier chargement ou dernier
	// envoi réussi) ; '?' tant qu'on ne la connaît pas.
	const dbAltFingerprintRef = useRef('?');
	// Planning local d'un ancien navigateur, base vide : affiché mais JAMAIS
	// envoyé tant que l'utilisateur n'a pas choisi de le garder ou non.
	const undecidedAltRef = useRef(false);
	const [alternanceToConfirm, setAlternanceToConfirm] = useState(false);

	// ── Chargement depuis la base ──────────────────────────────────────────
	useEffect(() => {
		let cancelled = false;
		// Propriétaire : attendre les enregistrements d'une instance précédente.
		const loading = (readOnly ? Promise.resolve() : waitForSaveQueue()).then(() => calendarService.load());
		loadPromiseRef.current = loading;
		loading.then(data => {
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
			const sync = readOnly ? 'synced' : readAlternanceSync(ownerLoginRef.current);
			const altSource = alternanceSource(data.alternanceDays, alternanceTouchedRef.current, sync,
				Object.keys(latestRef.current.alternanceDays).length > 0);
			dbAltFingerprintRef.current = alternanceFingerprint(sanitizeAlternanceDays(data.alternanceDays));
			if (!readOnly) {
				// Modification locale jamais confirmée par la base : on la renvoie.
				// Cette page en devient responsable : son envoi réussi la confirmera
				// (sinon le marqueur restait « en attente » pour toujours).
				if (typeof sync === 'object' && altSource === 'local') {
					dirtyRef.current = true;
					const raw = readAlternanceSyncRaw();
					if (raw) ownPendingTokens.add(raw);
				}
				// La copie locale va devenir celle de la base.
				if (altSource === 'db') writeAlternanceSyncRaw('synced');
				if (altSource === 'ask') {
					undecidedAltRef.current = true;
					setAlternanceToConfirm(true);
				}
			}
			const merged = mergeAfterLoad(data, latestRef.current, ops, {
				range: rangeTouchedRef.current, alternance: alternanceTouchedRef.current,
			}, sync);
			const finalSnap = { ...merged, alternanceDays: normalizeAlternanceDays(merged.alternanceDays, legendRef.current) };
			// À confirmer : si la page se ferme avant l'envoi, c'est le planning de
			// la base (vide) qui part, jamais la copie locale.
			if (dirtyRef.current && !readOnly) {
				unsavedMergeRef.current = altSource === 'ask'
					? { ...finalSnap, alternanceDays: sanitizeAlternanceDays(data.alternanceDays) }
					: finalSnap;
			}
			dispatch({ type: 'replace', projects: finalSnap.projects });
			setDateRangeState(finalSnap.dateRange);
			setAlternanceDays(finalSnap.alternanceDays);
			setStatus('ready');
		}).catch(() => {
			if (cancelled) return;
			// Propriétaire : on garde la copie locale à l'écran, mais on n'enregistre
			// plus rien. Consultation : rien à montrer.
			loadFailedRef.current = true;
			if (!readOnly) setSyncError(true);
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
		// Jamais avant la réponse de la base : l'état local seul (vide sur un nouvel
		// appareil) l'écraserait. Jamais après un chargement en échec, pour la même
		// raison. Quitter la page avant la réponse : voir l'effet de démontage.
		if (readOnly || !dbSynced || loadFailedRef.current) return;
		if (!dirtyRef.current && !needsFirstSaveRef.current) return;
		needsFirstSaveRef.current = false;
		unsavedMergeRef.current = null;
		const payload = toPayload({ projects, dateRange, alternanceDays: undecidedAltRef.current ? {} : alternanceDays });
		const syncToken = undecidedAltRef.current ? UNDECIDED_SYNC_TOKEN : readAlternanceSyncRaw();
		const run = () => {
			pendingRef.current = null;
			// saveOwn : cette instance est propriétaire depuis son montage (la garde
			// « profil consulté » de save() annulait l'enregistrement du démontage).
			enqueueSave(() => saveOwnAndMark(payload, syncToken, () => {
				dbAltFingerprintRef.current = alternanceFingerprint(payload.alternanceDays);
			}));
		};
		pendingRef.current = run;
		const timer = setTimeout(run, SAVE_DELAY_MS);
		return () => clearTimeout(timer);
	}, [projects, dateRange, alternanceDays, dbSynced, readOnly]);
	useEffect(() => () => {
		if (pendingRef.current) {
			pendingRef.current();
			return;
		}
		if (unsavedMergeRef.current && !loadFailedRef.current && !readOnly) {
			const snap = unsavedMergeRef.current;
			const syncToken = undecidedAltRef.current ? UNDECIDED_SYNC_TOKEN : readAlternanceSyncRaw();
			enqueueSave(() => saveOwnAndMark(toPayload(snap), syncToken));
			return;
		}
		// Page quittée AVANT la réponse de la base, avec des modifications : on
		// attend la base, on rejoue dessus, puis on enregistre le résultat fusionné.
		if (readOnly || !dirtyRef.current || loadedRef.current || !loadPromiseRef.current) return;
		const ops = [...opsDuringLoadRef.current];
		const local = latestRef.current;
		const touched = { range: rangeTouchedRef.current, alternance: alternanceTouchedRef.current };
		const loading = loadPromiseRef.current;
		const legend = legendRef.current;
		const syncToken = readAlternanceSyncRaw();
		const sync = readAlternanceSync(ownerLoginRef.current);
		enqueueSave(() => loading.then(data => {
			const db = data as Parameters<typeof mergeAfterLoad>[0];
			const merged = mergeAfterLoad(db, local, ops, touched, sync);
			// Planning à confirmer : on n'envoie surtout pas la copie locale.
			const undecided = !!db && alternanceSource(db.alternanceDays, touched.alternance, sync, Object.keys(local.alternanceDays).length > 0) === 'ask';
			const alt = undecided ? sanitizeAlternanceDays(db.alternanceDays) : normalizeAlternanceDays(merged.alternanceDays, legend);
			return saveOwnAndMark(toPayload({ ...merged, alternanceDays: alt }), undecided ? UNDECIDED_SYNC_TOKEN : syncToken);
		})); // chargement en échec : la file avale l'erreur, rien n'est écrasé
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

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
		// Avant la confirmation de la base, cette version locale prime au
		// rechargement (sinon « Effacer » puis F5 dans les 2 s faisait revenir
		// l'ancien planning).
		writeAlternanceSyncRaw(pendingToken(dbAltFingerprintRef.current, ownerLoginRef.current));
		undecidedAltRef.current = false;
		setAlternanceToConfirm(false);
		setAlternanceDays(normalizeAlternanceDays(sanitizeAlternanceDays(days), legend));
		setAlternanceLegend(legend);
	}, [readOnly]);

	/** Réponse à « garder le planning de cet appareil ? » (ancien navigateur, base vide). */
	const confirmLocalAlternance = useCallback((keep: boolean) => {
		if (keep) setAlternance(latestRef.current.alternanceDays, legendRef.current);
		else setAlternance({}, null);
	}, [setAlternance]);


	return {
		projects,
		canUndo: past.length > 0,
		dateRange,
		alternanceDays,
		alternanceLegend,
		status,
		syncError,
		apply,
		undo,
		setDateRange,
		setAlternance,
		alternanceToConfirm,
		confirmLocalAlternance,
	};
}
