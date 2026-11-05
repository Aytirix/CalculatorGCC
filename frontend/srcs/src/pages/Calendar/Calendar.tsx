import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
	ChevronLeft, ChevronRight, Settings, Undo2, ZoomIn, ZoomOut,
} from 'lucide-react';
import Header from '@/components/Header/Header';
import { useRncpData } from '@/contexts/useRncpData';
import { useViewingUser } from '@/contexts/useViewingUser';
import type { RNCP, SimulatorProject } from '@/types/rncp.types';
import { isPoolCovered } from '@/services/xp.service';
import { parseAlternanceXlsx } from './alternanceParser';
import { useCalendarData } from './useCalendarData';
import Timeline, { ZOOM_LEVELS } from './Timeline';
import MonthView from './MonthView';
import ListView from './ListView';
import ProjectDetail from './ProjectDetail';
import Tray from './Tray';
import SettingsDialog, { type ImportResult } from './SettingsDialog';
import {
	addDays, countSchoolDays, defaultPlacementDate, diffDays, formatDateKey,
	formatShort, formatShortYear, formatXp, getProjectStatus, getTimelineGrid,
	newPlacedProject, normalizeView, plural, startOfDay,
	ALTERNANCE_COLORS, ALTERNANCE_LABELS, alternanceKindsPresent,
	type CalendarView, type DateRange, type PlacedProject,
} from './calendarModel';
import './Calendar.scss';

// ── Préférences d'affichage (propres à ce navigateur, pas des données) ─────

const VIEW_KEY = 'calendar_view';
const ZOOM_KEY = 'calendar_zoom';
const TONE_COUNT = 8;
const TOAST_MS = 6000;
const WIDE_QUERY = '(min-width: 1200px)';
const NARROW_QUERY = '(max-width: 640px)';

function readPref(key: string): string | null {
	try { return localStorage.getItem(key); } catch { return null; }
}
function writePref(key: string, value: string) {
	try { localStorage.setItem(key, value); } catch { /* préférence perdue, sans gravité */ }
}

function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
	useEffect(() => {
		const mql = window.matchMedia(query);
		const onChange = () => setMatches(mql.matches);
		onChange();
		mql.addEventListener('change', onChange);
		return () => mql.removeEventListener('change', onChange);
	}, [query]);
	return matches;
}

/** Projets cochés dans le simulateur (propriétaire uniquement). */
function getSimulatedProjects(rncpData: RNCP[]): SimulatorProject[] {
	let simulatedIds: string[] = [];
	let simulatedSubProjects: Record<string, string[]> = {};
	try {
		simulatedIds = JSON.parse(localStorage.getItem('simulated_projects') || '[]');
		simulatedSubProjects = JSON.parse(localStorage.getItem('simulated_sub_projects') || '{}');
	} catch { /* données illisibles : liste vide */ }
	const out: SimulatorProject[] = [];
	const seen = new Set<string>();
	rncpData.forEach(rncp => rncp.categories.forEach(cat => cat.projects.forEach(p => {
		if (seen.has(p.id)) return;
		const direct = simulatedIds.includes(p.id) || (!!p.slug && simulatedIds.includes(p.slug));
		const viaPool = !!p.subProjects && !!simulatedSubProjects[p.id]
			&& isPoolCovered(p, subId => simulatedSubProjects[p.id].includes(subId));
		if (direct || viaPool) {
			seen.add(p.id);
			out.push(p);
		}
	})));
	return out;
}

const VIEW_TABS: { id: CalendarView; label: string }[] = [
	{ id: 'chronologie', label: 'Frise' },
	{ id: 'mois', label: 'Mois' },
	{ id: 'agenda', label: 'Liste' },
];

interface Toast {
	text: string;
	onUndo?: () => void;
}

const Calendar: React.FC = () => {
	const { viewingUser, isViewingOther } = useViewingUser();
	const readOnly = isViewingOther;
	const ownerName = viewingUser?.login ?? '';
	const { rncpData } = useRncpData();
	const data = useCalendarData(readOnly);
	const { projects, dateRange, alternanceDays, alternanceLegend } = data;

	const isWide = useMediaQuery(WIDE_QUERY);
	const today = useMemo(() => startOfDay(new Date()), []);

	const [view, setView] = useState<CalendarView>(() =>
		normalizeView(readPref(VIEW_KEY), typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches));
	const [zoomIndex, setZoomIndex] = useState(() => {
		// Number(null) vaut 0 : sans préférence, on retombait sur « Mois » au lieu de « Semaine ».
		const raw = readPref(ZOOM_KEY);
		const z = raw === null ? NaN : Number(raw);
		return Number.isInteger(z) && z >= 0 && z < ZOOM_LEVELS.length ? z : 1;
	});
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
	const [selectedDay, setSelectedDay] = useState(today);
	const [toast, setToast] = useState<Toast | null>(null);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [settingsSession, setSettingsSession] = useState(0);

	const viewportRef = useRef<HTMLDivElement>(null);
	const draggingRef = useRef(false);
	const pendingCenterRef = useRef<Date | null>(null);
	const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => { writePref(VIEW_KEY, view); }, [view]);
	useEffect(() => { writePref(ZOOM_KEY, String(zoomIndex)); }, [zoomIndex]);

	// ── Dérivés ────────────────────────────────────────────────────────────

	const simulatedProjects = useMemo(
		() => (readOnly ? [] : getSimulatedProjects(rncpData)),
		[rncpData, readOnly],
	);
	const trayProjects = useMemo(() => {
		const placed = new Set(projects.map(p => p.projectId));
		return simulatedProjects.filter(p => !placed.has(p.id));
	}, [simulatedProjects, projects]);

	const toneMap = useMemo(() => {
		const map = new Map<string, number>();
		projects.forEach(p => { if (!map.has(p.projectId)) map.set(p.projectId, map.size % TONE_COUNT); });
		return map;
	}, [projects]);
	const toneOf = useCallback((projectId: string) => toneMap.get(projectId) ?? 0, [toneMap]);

	const selected = useMemo(() => projects.find(p => p.id === selectedId) ?? null, [projects, selectedId]);
	const grid = useMemo(() => getTimelineGrid(dateRange), [dateRange]);
	const weekWidth = ZOOM_LEVELS[zoomIndex].weekWidth;

	const kpis = useMemo(() => {
		const totalXp = projects.reduce((a, p) => a + p.xp, 0);
		const next = projects
			.filter(p => getProjectStatus(p, today).status !== 'done')
			.sort((a, b) => a.endDate.getTime() - b.endDate.getTime())[0];
		const school = countSchoolDays(alternanceDays, alternanceLegend, today, addDays(dateRange.end, 1));
		return { totalXp, next, school };
	}, [projects, today, alternanceDays, alternanceLegend, dateRange.end]);

	// ── Notifications ──────────────────────────────────────────────────────

	const showToast = useCallback((t: Toast) => {
		if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
		setToast(t);
		toastTimerRef.current = setTimeout(() => setToast(null), TOAST_MS);
	}, []);
	useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

	// ── Actions sur les projets ────────────────────────────────────────────

	const { apply, undo } = data;

	const undoLast = useCallback(() => {
		undo();
		setToast(null);
	}, [undo]);

	const placeProject = useCallback((source: SimulatorProject, date?: Date) => {
		if (readOnly) return;
		// Déjà placé (double clic, double dépôt) : rien à faire — surtout pas de
		// notification « Annuler », qui annulerait alors l'action précédente.
		if (projects.some(p => p.projectId === source.id)) return;
		const np = newPlacedProject(source, date ?? defaultPlacementDate(today, dateRange));
		apply(prev => (prev.some(p => p.projectId === np.projectId) ? prev : [...prev, np]));
		setSelectedId(np.id);
		showToast({ text: `${np.name} placé le ${formatShort(np.startDate)}`, onUndo: undoLast });
	}, [readOnly, projects, today, dateRange, apply, showToast, undoLast]);

	const dropProject = useCallback((projectId: string, date: Date) => {
		const source = simulatedProjects.find(p => p.id === projectId);
		if (source) placeProject(source, date);
	}, [simulatedProjects, placeProject]);

	// Une nouvelle modification retire la notification : son « Annuler » visait
	// l'action précédente, il annulerait désormais celle-ci.
	const commitDates = useCallback((id: string, next: { startDate: Date; endDate: Date }) => {
		apply(prev => prev.map(p => (p.id === id ? { ...p, ...next } : p)));
		setToast(null);
	}, [apply]);

	const changeProject = useCallback((next: PlacedProject) => {
		const current = projects.find(p => p.id === next.id);
		// Rien ne change (« Fin −1 » au minimum, durée déjà choisie) : pas d'entrée
		// d'historique vide, qui rendrait Ctrl+Z apparemment inopérant.
		if (current && current.startDate.getTime() === next.startDate.getTime() && current.endDate.getTime() === next.endDate.getTime()) return;
		// Seulement les dates : rejouée sur les données de la base (fin de
		// chargement), l'opération ne doit pas réimposer les autres champs locaux.
		apply(prev => prev.map(p => (p.id === next.id ? { ...p, startDate: next.startDate, endDate: next.endDate } : p)));
		setToast(null);
	}, [apply, projects]);

	const removeSelected = useCallback(() => {
		if (!selected) return;
		const name = selected.name;
		const id = selected.id;
		apply(prev => prev.filter(p => p.id !== id));
		setSelectedId(null);
		showToast({ text: `${name} retiré du calendrier`, onUndo: undoLast });
	}, [selected, apply, showToast, undoLast]);

	// ── Clavier : Ctrl+Z, Échap ────────────────────────────────────────────

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
			// Pas d'annulation en plein glisser : la barre tenue disparaîtrait sous le pointeur.
			if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing && !readOnly && !draggingRef.current) {
				e.preventDefault();
				undoLast();
			} else if (e.key === 'Escape') {
				// Échap dans les réglages ferme seulement la fenêtre (géré par <dialog>).
				if (!settingsOpen) setSelectedId(null);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [readOnly, settingsOpen, undoLast]);

	// ── Frise : centrage et navigation ─────────────────────────────────────

	const labelWidth = () => viewportRef.current?.querySelector<HTMLElement>('.cal-tl-label')?.offsetWidth ?? 0;

	const scrollToDate = useCallback((date: Date, behavior: ScrollBehavior = 'auto') => {
		const vp = viewportRef.current;
		if (!vp) return;
		const x = diffDays(grid.gridStart, date) * (weekWidth / 7);
		vp.scrollTo({ left: Math.max(0, x - (vp.clientWidth - labelWidth()) / 2), behavior });
	}, [grid.gridStart, weekWidth]);

	const centerDate = useCallback((): Date | null => {
		const vp = viewportRef.current;
		if (!vp) return null;
		const x = vp.scrollLeft + (vp.clientWidth - labelWidth()) / 2;
		return addDays(grid.gridStart, Math.round(x / (weekWidth / 7)));
	}, [grid.gridStart, weekWidth]);

	const gridKey = `${formatDateKey(grid.gridStart)}|${grid.weekCount}`;
	useLayoutEffect(() => {
		if (view !== 'chronologie') return;
		const target = pendingCenterRef.current
			?? (today >= dateRange.start && today <= dateRange.end ? today : dateRange.start);
		pendingCenterRef.current = null;
		scrollToDate(target);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [view, weekWidth, gridKey]);

	const changeZoom = (delta: number) => {
		const next = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, zoomIndex + delta));
		if (next === zoomIndex) return;
		pendingCenterRef.current = centerDate();
		setZoomIndex(next);
	};

	const goPrev = () => {
		if (view === 'mois') setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
		else if (view === 'chronologie') viewportRef.current?.scrollBy({ left: -((viewportRef.current.clientWidth - labelWidth()) * 0.8), behavior: 'smooth' });
	};
	const goNext = () => {
		if (view === 'mois') setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));
		else if (view === 'chronologie') viewportRef.current?.scrollBy({ left: (viewportRef.current.clientWidth - labelWidth()) * 0.8, behavior: 'smooth' });
	};
	const goToday = () => {
		if (view === 'mois') {
			setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
			setSelectedDay(today);
		} else if (view === 'chronologie') {
			scrollToDate(today, 'smooth');
		}
	};

	// ── Réglages : période et planning d'alternance ────────────────────────

	const saveRange = (range: DateRange) => data.setDateRange(range);

	const importPlanning = async (file: File): Promise<ImportResult> => {
		try {
			const parsed = await parseAlternanceXlsx(file);
			const days = Object.keys(parsed.days).length;
			if (days === 0) return { ok: false, error: 'Aucune couleur trouvée dans le fichier. Vérifie que les jours sont colorés.' };
			data.setAlternance(parsed.days, parsed.legend);
			return {
				ok: true,
				days,
				contract: parsed.contractStart && parsed.contractEnd ? { start: parsed.contractStart, end: parsed.contractEnd } : null,
			};
		} catch {
			return { ok: false, error: 'Impossible de lire ce fichier. Il faut un fichier .xlsx valide.' };
		}
	};

	// Renvoie de quoi annuler : la fenêtre ⚙ (modale) affiche elle-même le bouton
	// « Annuler » — une notification resterait cachée sous son fond.
	const clearAlternance = () => {
		const prevDays = alternanceDays;
		const prevLegend = alternanceLegend;
		data.setAlternance({}, null);
		return () => data.setAlternance(prevDays, prevLegend);
	};

	// ── Rendu ──────────────────────────────────────────────────────────────

	const alternanceDayCount = Object.keys(alternanceDays).length;
	const alternanceKinds = useMemo(() => alternanceKindsPresent(alternanceDays), [alternanceDays]);
	const openSettings = () => { setSettingsSession(n => n + 1); setSettingsOpen(true); };
	const showTray = !readOnly;
	const loadingOther = readOnly && data.status === 'loading';

	const emptyMessage = readOnly
		? data.status === 'error'
			? <p>Impossible de charger le calendrier de {ownerName}. Réessaie plus tard.</p>
			: <p>{ownerName} n'a pas encore planifié de projet.</p>
		: <p>Aucun projet planifié. {trayProjects.length > 0 ? 'Place un projet depuis « À placer ».' : 'Coche des projets dans le simulateur, ils apparaîtront dans « À placer ».'}</p>;

	const detailMode: 'panel' | 'sheet' = isWide ? 'panel' : 'sheet';

	const mainView = (() => {
		if (loadingOther) return <div className="cal-card cal-empty"><p>Chargement du calendrier de {ownerName}…</p></div>;
		if (view === 'mois') {
			return (
				<MonthView
					month={month}
					onPrev={goPrev}
					onNext={goNext}
					onToday={goToday}
					projects={projects}
					toneOf={toneOf}
					selectedDay={selectedDay}
					onSelectDay={setSelectedDay}
					onSelectProject={setSelectedId}
					onDropProject={readOnly ? undefined : dropProject}
					readOnly={readOnly}
					alternanceDays={alternanceDays}
					alternanceLegend={alternanceLegend}
					today={today}
				/>
			);
		}
		if (view === 'agenda') {
			return (
				<ListView
					projects={projects}
					toneOf={toneOf}
					selectedId={selectedId}
					onSelect={setSelectedId}
					alternanceDays={alternanceDays}
					alternanceLegend={alternanceLegend}
					today={today}
					emptyMessage={emptyMessage}
				/>
			);
		}
		return (
			<section className="cal-card cal-frise" aria-label="Frise">
				<div className="cal-frise-head">
					<h2>Frise</h2>
					<div className="cal-frise-controls">
						<div className="cal-group" role="group" aria-label="Se déplacer dans la frise">
							<button type="button" className="cal-group-btn" onClick={goPrev} aria-label="Reculer" title="Reculer">
								<ChevronLeft size={18} aria-hidden="true" />
							</button>
							<button type="button" className="cal-group-text" onClick={goToday}>Aujourd'hui</button>
							<button type="button" className="cal-group-btn" onClick={goNext} aria-label="Avancer" title="Avancer">
								<ChevronRight size={18} aria-hidden="true" />
							</button>
						</div>
						<div className="cal-group" role="group" aria-label="Zoom">
							<button type="button" className="cal-group-btn" onClick={() => changeZoom(-1)} disabled={zoomIndex === 0} aria-label="Dézoomer" title="Dézoomer">
								<ZoomOut size={18} aria-hidden="true" />
							</button>
							<span className="cal-group-label" aria-live="polite">{ZOOM_LEVELS[zoomIndex].label}</span>
							<button type="button" className="cal-group-btn" onClick={() => changeZoom(1)} disabled={zoomIndex === ZOOM_LEVELS.length - 1} aria-label="Zoomer" title="Zoomer">
								<ZoomIn size={18} aria-hidden="true" />
							</button>
						</div>
					</div>
					<div className="cal-legend">
						{/* Couleurs de l'app (et non du .xlsx) : la légende est la même partout. */}
						{alternanceKinds.map(k => (
							<span key={k} className="cal-legend-item"><span className="cal-legend-swatch" style={{ background: ALTERNANCE_COLORS[k] }} />{ALTERNANCE_LABELS[k]}</span>
						))}

						<span className="cal-legend-item"><span className="cal-legend-swatch cal-legend-swatch--weekend" />Week-end</span>
						<span className="cal-legend-item"><span className="cal-legend-swatch cal-legend-swatch--holiday" />Férié</span>
						<span className="cal-legend-item"><span className="cal-legend-today" />Aujourd'hui</span>
					</div>
				</div>
				<Timeline
					grid={grid}
					weekWidth={weekWidth}
					projects={projects}
					toneOf={toneOf}
					selectedId={selectedId}
					onSelect={setSelectedId}
					onCommit={commitDates}
					onDropProject={readOnly ? undefined : dropProject}
					readOnly={readOnly}
					alternanceDays={alternanceDays}
					alternanceLegend={alternanceLegend}
					today={today}
					viewportRef={viewportRef}
					selectAfterDrag={isWide}
					onDraggingChange={d => { draggingRef.current = d; }}
				/>
				{projects.length === 0 ? (
					<div className="cal-frise-foot">{emptyMessage}</div>
				) : !readOnly && (
					<p className="cal-frise-foot cal-muted">
						Glisse une barre pour la déplacer, tire ses bords pour changer sa durée. Au doigt : reste appuyé sur la barre (ou sur un bord) puis glisse.
					</p>
				)}
			</section>
		);
	})();

	return (
		<div className="calendar-page">
			{/* Fiche du bas ouverte : le reste de la page est inerte (Tab ne s'échappe
			    plus derrière le fond assombri). */}
			<div className="cal-page-content" inert={!isWide && !!selected}>
			<Header />
			<main className={`cal-container${isWide ? ' is-wide' : ''}`}>

				{/* Pas de bandeau « lecture seule » ici : le Header en affiche déjà un sur
				    toutes les pages, et le titre dit « Calendrier de X ». */}
				<div className="cal-head">
					<div>
						<h1 tabIndex={-1}>{readOnly ? `Calendrier de ${ownerName}` : 'Calendrier'}</h1>
						<p className="cal-muted">
							{readOnly ? 'Ses projets planifiés sur sa période d’alternance.' : 'Place tes projets simulés sur ta période d’alternance.'}
						</p>
					</div>
					{/* Choix de la vue dans l'en-tête, à côté des actions (comme le sélecteur
					    Jour / Semaine / Mois d'un agenda) : avant, il occupait seul une carte
					    pleine largeur, loin de la vue qu'il commande. */}
					<div className="cal-head-actions">
						<div className="cal-segmented" role="group" aria-label="Vue">
							{VIEW_TABS.map(t => (
								<button key={t.id} type="button" aria-pressed={view === t.id} className={view === t.id ? 'is-active' : ''} onClick={() => setView(t.id)}>
									{t.label}
								</button>
							))}
						</div>
						{!readOnly && (
							<>
								<button type="button" className="cal-icon-btn" onClick={undoLast} disabled={!data.canUndo} aria-label="Annuler la dernière action" title="Annuler (Ctrl+Z)">
									<Undo2 size={18} aria-hidden="true" />
								</button>
								<button type="button" className="cal-icon-btn" onClick={openSettings} aria-label="Réglages du calendrier (période, planning d'alternance)" title="Réglages du calendrier" aria-haspopup="dialog">
									<Settings size={18} aria-hidden="true" />
								</button>
							</>
						)}
					</div>
				</div>

				{data.syncError && (
					<div className="cal-sync-error" role="alert">
						Impossible de joindre le serveur : tu vois ta copie locale, mais tes modifications ne seront pas enregistrées. Recharge la page pour réessayer.
					</div>
				)}

				<div className="cal-kpis">
					<div className="cal-kpi">
						<span className="cal-kpi-label">XP planifiés</span>
						<span className="cal-kpi-value">{formatXp(kpis.totalXp)}</span>
						<span className="cal-kpi-sub">{plural(projects.length, 'projet')} au calendrier</span>
					</div>
					<div className="cal-kpi">
						<span className="cal-kpi-label">Prochaine échéance</span>
						<span className="cal-kpi-value cal-ellipsis">{kpis.next ? kpis.next.name : '—'}</span>
						<span className="cal-kpi-sub">
							{kpis.next ? `${formatShort(kpis.next.endDate)} · dans ${plural(Math.max(0, diffDays(today, kpis.next.endDate)), 'jour')}` : 'rien en cours'}
						</span>
					</div>
					<div className="cal-kpi">
						<span className="cal-kpi-label">Jours d'école restants</span>
						<span className="cal-kpi-value">{kpis.school ?? '—'}</span>
						<span className="cal-kpi-sub">{kpis.school === null ? (readOnly ? 'planning non disponible' : 'importe ton planning') : `jusqu'au ${formatShortYear(dateRange.end)}`}</span>
					</div>
					{showTray && (
						<div className="cal-kpi">
							<span className="cal-kpi-label">À placer</span>
							<span className="cal-kpi-value">{trayProjects.length}</span>
							<span className="cal-kpi-sub">projets simulés sans dates</span>
						</div>
					)}
				</div>

				<div className="cal-body">
					{showTray && (
						<Tray
							projects={trayProjects}
							onPlace={p => placeProject(p)}
							// Toujours en bande au-dessus de la vue : sur grand écran, la frise
							// récupère la largeur de l'ancienne colonne de gauche.
							layout="strip"
							canDrop={isWide && view !== 'agenda'}
						/>
					)}
					<div className="cal-main">{mainView}</div>
					{isWide && (
						<ProjectDetail
							project={selected}
							tone={selected ? toneOf(selected.projectId) : 0}
							today={today}
							alternanceDays={alternanceDays}
							alternanceLegend={alternanceLegend}
							readOnly={readOnly}
							mode={detailMode}
							onChange={changeProject}
							onRemove={removeSelected}
							onClose={() => setSelectedId(null)}
						/>
					)}
				</div>
			</main>
			</div>

			{!isWide && selected && (
				<ProjectDetail
					project={selected}
					tone={toneOf(selected.projectId)}
					today={today}
					alternanceDays={alternanceDays}
					alternanceLegend={alternanceLegend}
					readOnly={readOnly}
					mode={detailMode}
					onChange={changeProject}
					onRemove={removeSelected}
					onClose={() => setSelectedId(null)}
				/>
			)}

			{!readOnly && (
				<SettingsDialog
					open={settingsOpen}
					sessionKey={settingsSession}
					onClose={() => setSettingsOpen(false)}
					dateRange={dateRange}
					onSaveRange={saveRange}
					alternanceDayCount={alternanceDayCount}
					onImport={importPlanning}
					onClearAlternance={clearAlternance}
				/>
			)}

			{toast && (
				<div className={`cal-toast${!isWide && selected ? ' is-raised' : ''}`} role="status">
					<span>{toast.text}</span>
					{toast.onUndo && !readOnly && (
						<button type="button" onClick={toast.onUndo}>Annuler</button>
					)}
				</div>
			)}
		</div>
	);
};

export default Calendar;
