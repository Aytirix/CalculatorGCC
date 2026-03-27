import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Header from '@/components/Header/Header';
import { RNCP_DATA } from '@/data/rncp.data';
import type { SimulatorProject } from '@/types/rncp.types';
import { parseAlternanceXlsx, type AlternanceLegend } from './alternanceParser';
import { calendarService } from '@/services/calendar.service';
import './Calendar.scss';

// ── Types ──────────────────────────────────────────────────────────────────

type CalendarView = 'chronologie' | 'mois' | 'semaine' | 'agenda';

interface PlacedProject {
	id: string;
	projectId: string;
	name: string;
	xp: number;
	startDate: Date;
	endDate: Date;
	row: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'calendar_projects';
const RANGE_KEY = 'calendar_range';
const VIEW_KEY = 'calendar_view';
const ALTERNANCE_KEY = 'calendar_alternance';
const LEGEND_KEY = 'calendar_alternance_legend';

function loadAlternanceDays(): Record<string, string> {
	try {
		return JSON.parse(localStorage.getItem(ALTERNANCE_KEY) || '{}');
	} catch { return {}; }
}

function saveAlternanceDays(days: Record<string, string>) {
	localStorage.setItem(ALTERNANCE_KEY, JSON.stringify(days));
}

function loadAlternanceLegend(): AlternanceLegend | null {
	try {
		const raw = localStorage.getItem(LEGEND_KEY);
		if (!raw) return null;
		return JSON.parse(raw) as AlternanceLegend;
	} catch { return null; }
}

function saveAlternanceLegend(legend: AlternanceLegend | null) {
	if (legend) localStorage.setItem(LEGEND_KEY, JSON.stringify(legend));
	else localStorage.removeItem(LEGEND_KEY);
}

const PROJECT_COLORS = [
	'#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
	'#10b981', '#06b6d4', '#f97316', '#6366f1',
	'#14b8a6', '#e11d48', '#84cc16', '#a855f7',
];

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function startOfWeek(date: Date): Date {
	const d = new Date(date);
	const day = d.getDay();
	const diff = day === 0 ? 6 : day - 1;
	d.setDate(d.getDate() - diff);
	d.setHours(0, 0, 0, 0);
	return d;
}

function addDays(date: Date, days: number): Date {
	const d = new Date(date);
	d.setDate(d.getDate() + days);
	return d;
}

function diffDays(a: Date, b: Date): number {
	return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function isToday(date: Date): boolean {
	const now = new Date();
	return date.getFullYear() === now.getFullYear()
		&& date.getMonth() === now.getMonth()
		&& date.getDate() === now.getDate();
}

function formatMonthYear(date: Date): string {
	return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

const SHORT_DAY_MONTH_FORMATTER = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function formatShortDayMonth(date: Date): string {
	return SHORT_DAY_MONTH_FORMATTER.format(date);
}

const AUTO_SCROLL_SPEED_POINTS = [
	{ distance: 0, speed: 3600 },
	{ distance: 24, speed: 2600 },
	{ distance: 64, speed: 1600 },
	{ distance: 120, speed: 650 },
	{ distance: 180, speed: 0 },
] as const;

function getAutoScrollSpeed(distanceFromEdge: number): number {
	if (distanceFromEdge >= AUTO_SCROLL_SPEED_POINTS[AUTO_SCROLL_SPEED_POINTS.length - 1].distance) return 0;
	if (distanceFromEdge <= 0) return AUTO_SCROLL_SPEED_POINTS[0].speed;

	for (let i = 1; i < AUTO_SCROLL_SPEED_POINTS.length; i += 1) {
		const inner = AUTO_SCROLL_SPEED_POINTS[i - 1];
		const outer = AUTO_SCROLL_SPEED_POINTS[i];
		if (distanceFromEdge <= outer.distance) {
			const segmentProgress = (distanceFromEdge - inner.distance) / (outer.distance - inner.distance);
			return inner.speed + (outer.speed - inner.speed) * segmentProgress;
		}
	}

	return 0;
}

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

const frenchHolidayCache = new Map<number, Set<string>>();

function getFrenchPublicHolidayKeys(year: number): Set<string> {
	const cached = frenchHolidayCache.get(year);
	if (cached) return cached;

	const easterSunday = getEasterSunday(year);
	const holidays = new Set<string>([
		formatDate(new Date(year, 0, 1)),
		formatDate(addDays(easterSunday, 1)),
		formatDate(new Date(year, 4, 1)),
		formatDate(new Date(year, 4, 8)),
		formatDate(addDays(easterSunday, 39)),
		formatDate(addDays(easterSunday, 50)),
		formatDate(new Date(year, 6, 14)),
		formatDate(new Date(year, 7, 15)),
		formatDate(new Date(year, 10, 1)),
		formatDate(new Date(year, 10, 11)),
		formatDate(new Date(year, 11, 25)),
	]);

	frenchHolidayCache.set(year, holidays);
	return holidays;
}

function isFrenchPublicHoliday(date: Date): boolean {
	return getFrenchPublicHolidayKeys(date.getFullYear()).has(formatDate(date));
}

function parseDate(s: string): Date {
	return new Date(s + 'T00:00:00');
}

function getWeeks(start: Date, end: Date): Date[] {
	const weeks: Date[] = [];
	let current = startOfWeek(new Date(start));
	while (current <= end) {
		weeks.push(new Date(current));
		current = addDays(current, 7);
	}
	return weeks;
}

interface MonthSpan {
	label: string;
	startWeekIndex: number;
	weekCount: number;
}

function getMonthSpans(weeks: Date[]): MonthSpan[] {
	if (weeks.length === 0) return [];
	const spans: MonthSpan[] = [];
	let currentMonth = -1;
	let currentYear = -1;
	for (let i = 0; i < weeks.length; i++) {
		const m = weeks[i].getMonth();
		const y = weeks[i].getFullYear();
		if (m !== currentMonth || y !== currentYear) {
			spans.push({ label: formatMonthYear(weeks[i]), startWeekIndex: i, weekCount: 1 });
			currentMonth = m;
			currentYear = y;
		} else {
			spans[spans.length - 1].weekCount++;
		}
	}
	return spans;
}

function getMonthGridDays(year: number, month: number): Date[] {
	const firstDay = new Date(year, month, 1);
	const monday = startOfWeek(firstDay);
	return Array.from({ length: 42 }, (_, i) => addDays(monday, i));
}

function projectOverlapsDay(proj: PlacedProject, day: Date): boolean {
	const dayStart = new Date(day);
	dayStart.setHours(0, 0, 0, 0);
	const dayEnd = addDays(dayStart, 1);
	return proj.startDate < dayEnd && proj.endDate > dayStart;
}

function getSimulatedProjects(): { projects: SimulatorProject[] } {
	const simulatedIds: string[] = JSON.parse(localStorage.getItem('simulated_projects') || '[]');
	const simulatedSubProjects: Record<string, string[]> = JSON.parse(localStorage.getItem('simulated_sub_projects') || '{}');

	const projects: SimulatorProject[] = [];
	const seen = new Set<string>();

	RNCP_DATA.forEach(rncp => {
		rncp.categories.forEach(cat => {
			cat.projects.forEach(p => {
				if (seen.has(p.id)) return;
				if (simulatedIds.includes(p.id) || simulatedIds.includes(p.slug || '')) {
					seen.add(p.id);
					projects.push(p);
					return;
				}
				if (p.subProjects && simulatedSubProjects[p.id]) {
					if (p.subProjects.every(sub => simulatedSubProjects[p.id].includes(sub.id))) {
						seen.add(p.id);
						projects.push(p);
					}
				}
			});
		});
	});

	return { projects };
}

function loadPlacedProjects(): PlacedProject[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		return JSON.parse(raw).map((p: PlacedProject) => ({
			...p,
			startDate: new Date(p.startDate),
			endDate: new Date(p.endDate),
		}));
	} catch {
		return [];
	}
}

function savePlacedProjects(projects: PlacedProject[]) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function loadDateRange(): { start: Date; end: Date } {
	try {
		const raw = localStorage.getItem(RANGE_KEY);
		if (raw) {
			const { start, end } = JSON.parse(raw);
			return { start: parseDate(start), end: parseDate(end) };
		}
	} catch { /* fallback */ }
	const now = new Date();
	return {
		start: new Date(now.getFullYear(), now.getMonth(), 1),
		end: new Date(now.getFullYear(), now.getMonth() + 6, 0),
	};
}

function saveDateRange(start: Date, end: Date) {
	localStorage.setItem(RANGE_KEY, JSON.stringify({ start: formatDate(start), end: formatDate(end) }));
}

// ── Constants ──────────────────────────────────────────────────────────────

const ZOOM_LEVELS = [60, 120, 240] as const;
const ZOOM_LABELS = ['Mois', 'Semaine', 'Jour'] as const;
const ROW_HEIGHT = 52;
const HEADER_HEIGHT = 70;
const PROJECT_VERTICAL_INSET = 4;
const HOLIDAY_COLOR = '#B56A86';

// ── Component ──────────────────────────────────────────────────────────────

const Calendar: React.FC = () => {
	const [view, setView] = useState<CalendarView>(() =>
		(localStorage.getItem(VIEW_KEY) as CalendarView) || 'chronologie'
	);
	const [currentDate, setCurrentDate] = useState(() => new Date());
	const [dateRange, setDateRange] = useState(loadDateRange);
	const [placedProjects, setPlacedProjects] = useState<PlacedProject[]>(loadPlacedProjects);
	const [simulatedProjects, setSimulatedProjects] = useState<SimulatorProject[]>([]);
	const [dragData, setDragData] = useState<{ projectId: string; name: string; xp: number } | null>(null);
	const [resizing, setResizing] = useState<{
		id: string; edge: 'left' | 'right'; startGridX: number;
		originalStart: Date; originalEnd: Date;
	} | null>(null);
	const [moving, setMoving] = useState<{
		id: string; grabOffsetX: number; startY: number;
		originalStart: Date; originalEnd: Date; originalRow: number;
	} | null>(null);
	const [movingGhost, setMovingGhost] = useState<{
		id: string;
		name: string;
		color: string;
		width: number;
		height: number;
		pointerOffsetX: number;
		pointerOffsetY: number;
		startLabel: string;
		endLabel: string;
	} | null>(null);
	const [alternanceDays, setAlternanceDays] = useState<Record<string, string>>(loadAlternanceDays);
	const [alternanceLegend, setAlternanceLegend] = useState<AlternanceLegend | null>(loadAlternanceLegend);
	const [hoveredProject, setHoveredProject] = useState<{ proj: PlacedProject; rect: DOMRect } | null>(null);
	const [zoomIndex, setZoomIndex] = useState(1);
	const weekWidth = ZOOM_LEVELS[zoomIndex];
	const [contractPrompt, setContractPrompt] = useState<{ start: Date; end: Date } | null>(null);
	const [importError, setImportError] = useState<string | null>(null);
	const [chronoFullscreen, setChronoFullscreen] = useState(false);
	const chronoFullscreenRef = useRef(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const gridRef = useRef<HTMLDivElement>(null);
	const currentClientXRef = useRef(0);    // Dernière position X du curseur (pour le RAF)
	const currentClientYRef = useRef(0);    // Dernière position Y du curseur (pour le RAF)
	const autoScrollLastFrameRef = useRef<number | null>(null);
	// Refs miroir de state/valeurs — mis à jour à chaque render pour éviter les stale closures dans le RAF
	const resizingRef = useRef<typeof resizing>(null);
	resizingRef.current = resizing;
	const movingRef = useRef<typeof moving>(null);
	movingRef.current = moving;
	const movingGhostDataRef = useRef<typeof movingGhost>(null);
	movingGhostDataRef.current = movingGhost;
	const weekWidthRef = useRef(weekWidth);
	weekWidthRef.current = weekWidth;
	// Refs pour la manipulation DOM directe pendant le drag (évite les re-renders React)
	const dragElRef = useRef<HTMLDivElement | null>(null);
	const dragGhostRef = useRef<HTMLDivElement | null>(null);
	const dragOrigLeftRef = useRef(0);
	const dragOrigWidthRef = useRef(0);
	const moveTooltipKeyRef = useRef('');
	const gridViewportRectRef = useRef<DOMRect | null>(null);

	useEffect(() => {
		const { projects } = getSimulatedProjects();
		setSimulatedProjects(projects);
	}, []);

	useEffect(() => { savePlacedProjects(placedProjects); }, [placedProjects]);
	useEffect(() => { saveDateRange(dateRange.start, dateRange.end); }, [dateRange]);
	useEffect(() => { localStorage.setItem(VIEW_KEY, view); }, [view]);
	useEffect(() => { saveAlternanceDays(alternanceDays); }, [alternanceDays]);
	useEffect(() => { saveAlternanceLegend(alternanceLegend); }, [alternanceLegend]);

	// ── Chrono fullscreen (in-app landscape) ───────────────────────────────

	useEffect(() => { chronoFullscreenRef.current = chronoFullscreen; }, [chronoFullscreen]);

	const handleChronoFullscreen = useCallback(async () => {
		setChronoFullscreen(prev => {
			if (!prev) setView('chronologie');
			return !prev;
		});
		try {
			if (!document.fullscreenElement) {
				await document.documentElement.requestFullscreen();
			} else {
				await document.exitFullscreen();
			}
		} catch { /* non supporté sur certains navigateurs */ }
	}, []);

	// Transforme les coordonnées touch pour compenser la rotation 90° CW
	const rotateTouchCoords = (clientX: number, clientY: number) =>
		chronoFullscreenRef.current
			? { clientX: clientY, clientY: -clientX }
			: { clientX, clientY };

	// ── DB sync ────────────────────────────────────────────────────────────

	const [dbSynced, setDbSynced] = useState(false);

	// Load from DB on mount (overrides localStorage if data exists)
	useEffect(() => {
		calendarService.load().then(data => {
			if (!data) return;
			setPlacedProjects(data.placedProjects.map(p => ({
				...p,
				startDate: new Date(p.startDate),
				endDate: new Date(p.endDate),
			})));
			setDateRange({
				start: parseDate(data.dateRange.start),
				end: parseDate(data.dateRange.end),
			});
			if (data.alternanceDays && Object.keys(data.alternanceDays).length > 0) {
				setAlternanceDays(data.alternanceDays);
			}
		}).catch(() => {
			// Not authenticated or network error — keep localStorage data
		}).finally(() => setDbSynced(true));
	}, []);

	// Debounced save to DB (2s after last change)
	useEffect(() => {
		if (!dbSynced) return;
		const timer = setTimeout(() => {
			calendarService.save({
				placedProjects: placedProjects.map(p => ({
					...p,
					startDate: p.startDate.toISOString(),
					endDate: p.endDate.toISOString(),
				})),
				dateRange: {
					start: formatDate(dateRange.start),
					end: formatDate(dateRange.end),
				},
				alternanceDays,
			}).catch(() => { /* silent — localStorage still holds data */ });
		}, 2000);
		return () => clearTimeout(timer);
	}, [placedProjects, dateRange, alternanceDays, dbSynced]);


	// ── Colors ─────────────────────────────────────────────────────────────

	const projectColors = useMemo(() => {
		const map: Record<string, string> = {};
		[...new Set(placedProjects.map(p => p.projectId))].forEach((id, i) => {
			map[id] = PROJECT_COLORS[i % PROJECT_COLORS.length];
		});
		return map;
	}, [placedProjects]);

	const availableProjects = useMemo(() => {
		const placedIds = new Set(placedProjects.map(p => p.projectId));
		return simulatedProjects.filter(p => !placedIds.has(p.id));
	}, [simulatedProjects, placedProjects]);

	// ── Alternance import ──────────────────────────────────────────────────

	const handleImportClick = () => {
		setImportError(null);
		fileInputRef.current?.click();
	};

	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		e.target.value = '';

		try {
			const data = await parseAlternanceXlsx(file);

			if (Object.keys(data.days).length === 0) {
				setImportError('Aucune couleur trouvée dans le fichier. Vérifiez le format.');
				return;
			}

			setAlternanceDays(data.days);
			setAlternanceLegend(data.legend);

			// Check if contract dates differ from current calendar range
			if (data.contractStart && data.contractEnd) {
				const startDiffers = formatDate(data.contractStart) !== formatDate(dateRange.start);
				const endDiffers = formatDate(data.contractEnd) !== formatDate(dateRange.end);
				if (startDiffers || endDiffers) {
					setContractPrompt({ start: data.contractStart, end: data.contractEnd });
				}
			}
		} catch {
			setImportError('Erreur lors de la lecture du fichier. Vérifiez qu\'il s\'agit d\'un fichier .xlsx valide.');
		}
	};

	const handleContractAccept = () => {
		if (!contractPrompt) return;
		setDateRange({ start: contractPrompt.start, end: contractPrompt.end });
		if (view !== 'chronologie') setView('chronologie');
		setContractPrompt(null);
	};

	const handleContractDecline = () => setContractPrompt(null);

	const handleClearAlternance = () => {
		setAlternanceDays({});
		setAlternanceLegend(null);
		calendarService.save({
			placedProjects: placedProjects.map(p => ({
				...p,
				startDate: p.startDate.toISOString(),
				endDate: p.endDate.toISOString(),
			})),
			dateRange: {
				start: formatDate(dateRange.start),
				end: formatDate(dateRange.end),
			},
			alternanceDays: {},
		}).catch(() => { });
	};

	// ── Navigation ─────────────────────────────────────────────────────────

	const goToToday = () => setCurrentDate(new Date());

	const goPrev = () => {
		if (view === 'mois') setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
		if (view === 'semaine') setCurrentDate(d => addDays(d, -7));
	};

	const goNext = () => {
		if (view === 'mois') setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
		if (view === 'semaine') setCurrentDate(d => addDays(d, 7));
	};

	const navLabel = useMemo(() => {
		if (view === 'mois') return formatMonthYear(currentDate);
		if (view === 'semaine') {
			const mon = startOfWeek(currentDate);
			const sun = addDays(mon, 6);
			const sameMonth = mon.getMonth() === sun.getMonth();
			if (sameMonth) {
				return `${mon.getDate()} – ${sun.getDate()} ${sun.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;
			}
			return `${mon.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${sun.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
		}
		return null;
	}, [view, currentDate]);

	// ── Chronologie helpers ────────────────────────────────────────────────

	const weeks = useMemo(() => getWeeks(dateRange.start, dateRange.end), [dateRange]);
	const monthSpans = useMemo(() => getMonthSpans(weeks), [weeks]);
	const totalWidth = weeks.length * weekWidth;
	const dayWidth = weekWidth / 7;
	const totalDays = weeks.length * 7;
	const showDayDividers = zoomIndex === 2;
	const rowCount = 3;

	const dateToX = useCallback((date: Date): number => {
		const rangeStart = startOfWeek(new Date(dateRange.start));
		return (diffDays(rangeStart, date) / 7) * weekWidth;
	}, [dateRange.start, weekWidth]);

	const xToDate = useCallback((x: number): Date => {
		const rangeStart = startOfWeek(new Date(dateRange.start));
		return addDays(rangeStart, Math.round((x / weekWidth) * 7));
	}, [dateRange.start, weekWidth]);

	const yToRow = useCallback((y: number): number => Math.min(rowCount - 1, Math.max(0, Math.floor(y / ROW_HEIGHT))), []);

	const clientXToGridX = useCallback((clientX: number): number => {
		const grid = gridRef.current;
		if (!grid) return 0;
		const rect = gridViewportRectRef.current ?? grid.getBoundingClientRect();
		return grid.scrollLeft + clientX - rect.left;
	}, []);

	const getMovePreview = useCallback((m: NonNullable<typeof moving>, clientX: number, clientY: number) => {
		const ww = weekWidthRef.current;
		const nextLeft = clientXToGridX(clientX) - m.grabOffsetX;
		const pixelDeltaX = nextLeft - dragOrigLeftRef.current;
		const rowDelta = Math.round((clientY - m.startY) / ROW_HEIGHT);
		const daysDelta = Math.round((pixelDeltaX / ww) * 7);
		return {
			nextLeft,
			nextTop: m.originalRow * ROW_HEIGHT + PROJECT_VERTICAL_INSET + rowDelta * ROW_HEIGHT,
			pixelDeltaX,
			rowDelta,
			daysDelta,
			newStart: addDays(m.originalStart, daysDelta),
			newEnd: addDays(m.originalEnd, daysDelta),
		};
	}, [clientXToGridX]);

	const getResizePreview = useCallback((r: NonNullable<typeof resizing>, clientX: number) => {
		const ww = weekWidthRef.current;
		const pixelDeltaX = clientXToGridX(clientX) - r.startGridX;
		const daysDelta = Math.round((pixelDeltaX / ww) * 7);
		return {
			pixelDeltaX,
			daysDelta,
			nextLeft: dragOrigLeftRef.current + pixelDeltaX,
			nextWidthRight: Math.max(30, dragOrigWidthRef.current + pixelDeltaX),
			nextWidthLeft: Math.max(30, dragOrigWidthRef.current - pixelDeltaX),
			newStart: addDays(r.originalStart, daysDelta),
			newEnd: addDays(r.originalEnd, daysDelta),
		};
	}, [clientXToGridX]);

	const updateMovingGhostDOM = useCallback((clientX: number, clientY: number, m: NonNullable<typeof moving>) => {
		const ghostEl = dragGhostRef.current;
		const ghostData = movingGhostDataRef.current;
		if (!ghostEl || !ghostData) return;
		const preview = getMovePreview(m, clientX, clientY);
		ghostEl.style.transform = `translate3d(${clientX - ghostData.pointerOffsetX}px, ${clientY - ghostData.pointerOffsetY}px, 0)`;
		const nextStartLabel = formatShortDayMonth(preview.newStart);
		const nextEndLabel = formatShortDayMonth(preview.newEnd);
		const nextTooltipKey = `${nextStartLabel}|${nextEndLabel}`;
		if (moveTooltipKeyRef.current !== nextTooltipKey) {
			moveTooltipKeyRef.current = nextTooltipKey;
			const spans = ghostEl.querySelectorAll<HTMLSpanElement>('.drag-tooltip span');
			if (spans.length >= 2) {
				spans[0].textContent = nextStartLabel;
				spans[1].textContent = nextEndLabel;
			}
		}
	}, [getMovePreview]);

	// ── Scroll to today (on mount and when switching back to chronologie) ────

	useEffect(() => {
		if (view !== 'chronologie' || !gridRef.current) return;
		const todayX = dateToX(new Date());
		const center = todayX - gridRef.current.clientWidth / 2;
		gridRef.current.scrollTo({ left: Math.max(0, center), behavior: 'instant' });
	}, [view, dateToX]);

	// ── Drag helpers ───────────────────────────────────────────────────────

	const handleSidebarDragStart = (project: SimulatorProject) => (e: React.DragEvent) => {
		setDragData({ projectId: project.id, name: project.name, xp: project.xp });
		e.dataTransfer.effectAllowed = 'copy';
	};

	const handleGridDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'copy';
	};

	const dropProjectDirect = useCallback((data: { projectId: string; name: string; xp: number }, startDate: Date, row: number) => {
		setPlacedProjects(prev => [...prev, {
			id: `${data.projectId}-${Date.now()}`,
			projectId: data.projectId,
			name: data.name,
			xp: data.xp,
			startDate,
			endDate: addDays(startDate, 14),
			row,
		}]);
	}, []);

	const dropProject = (startDate: Date, row: number) => {
		if (!dragData) return;
		dropProjectDirect(dragData, startDate, row);
		setDragData(null);
	};

	// Mobile: tap sidebar project → place at center of currently visible grid area
	const handleSidebarTap = (project: SimulatorProject) => () => {
		let defaultDate: Date;
		if (gridRef.current) {
			const centerX = gridRef.current.scrollLeft + gridRef.current.clientWidth / 2;
			defaultDate = xToDate(centerX);
		} else {
			const today = new Date();
			defaultDate = today >= dateRange.start && today <= dateRange.end
				? today
				: new Date(dateRange.start);
		}
		dropProjectDirect({ projectId: project.id, name: project.name, xp: project.xp }, defaultDate, 0);
	};


	const handleGridDrop = (e: React.DragEvent) => {
		e.preventDefault();
		if (!dragData || !gridRef.current) return;
		const rect = gridRef.current.getBoundingClientRect();
		const x = e.clientX - rect.left + gridRef.current.scrollLeft;
		const y = e.clientY - rect.top - HEADER_HEIGHT;
		dropProject(xToDate(x), yToRow(y));
	};

	const handleDayCellDrop = (day: Date) => (e: React.DragEvent) => {
		e.preventDefault();
		if (!dragData) return;
		dropProject(day, 0);
	};

	// ── Resize / Move ──────────────────────────────────────────────────────

	const handleResizeStart = (projectId: string, edge: 'left' | 'right') => (e: React.MouseEvent) => {
		e.stopPropagation();
		e.preventDefault();
		const proj = placedProjects.find(p => p.id === projectId);
		if (!proj) return;
		gridViewportRectRef.current = gridRef.current?.getBoundingClientRect() ?? null;
		setHoveredProject(null);
		setMovingGhost(null);
		movingGhostDataRef.current = null;
		currentClientXRef.current = e.clientX;
		currentClientYRef.current = e.clientY;
		dragOrigLeftRef.current = dateToX(proj.startDate);
		dragOrigWidthRef.current = dateToX(proj.endDate) - dragOrigLeftRef.current;
		setResizing({
			id: projectId,
			edge,
			startGridX: clientXToGridX(e.clientX),
			originalStart: proj.startDate,
			originalEnd: proj.endDate,
		});
	};

	const handleResizeTouchStart = (projectId: string, edge: 'left' | 'right') => (e: React.TouchEvent) => {
		e.stopPropagation();
		e.preventDefault();
		const proj = placedProjects.find(p => p.id === projectId);
		if (!proj) return;
		gridViewportRectRef.current = gridRef.current?.getBoundingClientRect() ?? null;
		setHoveredProject(null);
		setMovingGhost(null);
		movingGhostDataRef.current = null;
		const { clientX, clientY } = rotateTouchCoords(e.touches[0].clientX, e.touches[0].clientY);
		currentClientXRef.current = clientX;
		currentClientYRef.current = clientY;
		dragOrigLeftRef.current = dateToX(proj.startDate);
		dragOrigWidthRef.current = dateToX(proj.endDate) - dragOrigLeftRef.current;
		setResizing({
			id: projectId,
			edge,
			startGridX: clientXToGridX(clientX),
			originalStart: proj.startDate,
			originalEnd: proj.endDate,
		});
	};

	const updateResizeDOM = useCallback((clientX: number, r: typeof resizing) => {
		const el = dragElRef.current;
		if (!el) return;
		if (r) {
			const preview = getResizePreview(r, clientX);
			if (r.edge === 'right') {
				el.style.width = `${preview.nextWidthRight}px`;
				const spans = el.querySelectorAll<HTMLSpanElement>('.drag-tooltip span');
				if (spans.length >= 2) spans[1].textContent = preview.newEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
			} else {
				el.style.left = `${preview.nextLeft}px`;
				el.style.width = `${preview.nextWidthLeft}px`;
				const spans = el.querySelectorAll<HTMLSpanElement>('.drag-tooltip span');
				if (spans.length >= 2) spans[0].textContent = preview.newStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
			}
		}
	}, [getResizePreview]);

	const trackPointerPosition = useCallback((clientX: number, clientY: number) => {
		currentClientXRef.current = clientX;
		currentClientYRef.current = clientY;
	}, []);

	const updateActiveDragDOM = useCallback((clientX: number, clientY: number) => {
		const activeResize = resizingRef.current;
		const activeMove = movingRef.current;
		if (activeResize) updateResizeDOM(clientX, activeResize);
		if (activeMove) updateMovingGhostDOM(clientX, clientY, activeMove);
	}, [updateResizeDOM, updateMovingGhostDOM]);

	const handleMouseUp = useCallback(() => {
		const m = movingRef.current;
		const r = resizingRef.current;
		const cx = currentClientXRef.current;
		const cy = currentClientYRef.current;
		const el = dragElRef.current;

		if (m) {
			const preview = getMovePreview(m, cx, cy);
			setPlacedProjects(prev => prev.map(p => {
				if (p.id !== m.id) return p;
				return {
					...p,
					startDate: preview.newStart,
					endDate: preview.newEnd,
					row: Math.min(4, Math.max(0, m.originalRow + preview.rowDelta)),
				};
			}));
		}
		if (r) {
			const preview = getResizePreview(r, cx);
			// Positionner à l'endroit final avant que React commite
			if (el) {
				if (r.edge === 'right') {
					el.style.width = `${preview.nextWidthRight}px`;
				} else {
					el.style.left = `${preview.nextLeft}px`;
					el.style.width = `${preview.nextWidthLeft}px`;
				}
			}
			setPlacedProjects(prev => prev.map(p => {
				if (p.id !== r.id) return p;
				if (r.edge === 'left') {
					if (preview.newStart < p.endDate) return { ...p, startDate: preview.newStart };
				} else {
					if (preview.newEnd > p.startDate) return { ...p, endDate: preview.newEnd };
				}
				return p;
			}));
		}
		dragElRef.current = null;
		dragGhostRef.current = null;
		movingGhostDataRef.current = null;
		moveTooltipKeyRef.current = '';
		gridViewportRectRef.current = null;
		setMovingGhost(null);
		setResizing(null);
		setMoving(null);
	}, [getMovePreview, getResizePreview]);

	useEffect(() => {
		if (resizing || moving) {
			let animFrameId: number | null = null;
			autoScrollLastFrameRef.current = null;

			const autoScrollLoop = (timestamp: number) => {
				const grid = gridRef.current;
				if (grid) {
					const prevTimestamp = autoScrollLastFrameRef.current;
					const deltaMs = prevTimestamp === null ? 16.67 : Math.min(100, Math.max(1, timestamp - prevTimestamp));
					autoScrollLastFrameRef.current = timestamp;
					const rect = gridViewportRectRef.current ?? grid.getBoundingClientRect();
					const x = currentClientXRef.current;
					const ghostData = movingGhostDataRef.current;
					const pointerDistanceLeft = x - rect.left;
					const pointerDistanceRight = rect.right - x;
					const dragLeft = ghostData ? x - ghostData.pointerOffsetX : x;
					const dragRight = ghostData ? dragLeft + ghostData.width : x;
					const distanceLeft = Math.min(pointerDistanceLeft, dragLeft - rect.left);
					const distanceRight = Math.min(pointerDistanceRight, rect.right - dragRight);
					const leftSpeed = getAutoScrollSpeed(distanceLeft);
					const rightSpeed = getAutoScrollSpeed(distanceRight);
					let speedPxPerSec = 0;

					if (leftSpeed > 0 || rightSpeed > 0) {
						speedPxPerSec = rightSpeed > leftSpeed ? rightSpeed : -leftSpeed;
					}

					if (speedPxPerSec !== 0) {
						grid.scrollLeft += speedPxPerSec * (deltaMs / 1000);
					}
				}
				updateActiveDragDOM(currentClientXRef.current, currentClientYRef.current);
				animFrameId = requestAnimationFrame(autoScrollLoop);
			};
			animFrameId = requestAnimationFrame(autoScrollLoop);

			const handleTouchMove = (e: TouchEvent) => {
				e.preventDefault();
				const { clientX, clientY } = chronoFullscreenRef.current
					? { clientX: e.touches[0].clientY, clientY: -e.touches[0].clientX }
					: { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
				trackPointerPosition(clientX, clientY);
			};
			const handleMouseMoveWithTracking = (e: MouseEvent) => {
				trackPointerPosition(e.clientX, e.clientY);
			};
			const handleTouchEnd = () => handleMouseUp();
			window.addEventListener('mousemove', handleMouseMoveWithTracking);
			window.addEventListener('mouseup', handleMouseUp);
			window.addEventListener('touchmove', handleTouchMove, { passive: false });
			window.addEventListener('touchend', handleTouchEnd);
			return () => {
				if (animFrameId !== null) cancelAnimationFrame(animFrameId);
				autoScrollLastFrameRef.current = null;
				window.removeEventListener('mousemove', handleMouseMoveWithTracking);
				window.removeEventListener('mouseup', handleMouseUp);
				window.removeEventListener('touchmove', handleTouchMove);
				window.removeEventListener('touchend', handleTouchEnd);
			};
		}
	}, [resizing, moving, handleMouseUp, trackPointerPosition, updateActiveDragDOM]);

	const handleMoveStart = (projectId: string) => (e: React.MouseEvent) => {
		if ((e.target as HTMLElement).classList.contains('resize-handle')) return;
		e.preventDefault();
		const proj = placedProjects.find(p => p.id === projectId);
		if (!proj) return;
		gridViewportRectRef.current = gridRef.current?.getBoundingClientRect() ?? null;
		const target = e.currentTarget as HTMLDivElement;
		const rect = target.getBoundingClientRect();
		const color = projectColors[proj.projectId] || '#3b82f6';
		const ghostData = {
			id: projectId,
			name: proj.name,
			color,
			width: rect.width,
			height: rect.height,
			pointerOffsetX: e.clientX - rect.left,
			pointerOffsetY: e.clientY - rect.top,
			startLabel: formatShortDayMonth(proj.startDate),
			endLabel: formatShortDayMonth(proj.endDate),
		};
		setHoveredProject(null);
		moveTooltipKeyRef.current = '';
		currentClientXRef.current = e.clientX;
		currentClientYRef.current = e.clientY;
		dragOrigLeftRef.current = dateToX(proj.startDate);
		dragOrigWidthRef.current = dateToX(proj.endDate) - dragOrigLeftRef.current;
		movingGhostDataRef.current = ghostData;
		setMovingGhost(ghostData);
		setMoving({
			id: projectId,
			grabOffsetX: clientXToGridX(e.clientX) - dragOrigLeftRef.current,
			startY: e.clientY,
			originalStart: proj.startDate,
			originalEnd: proj.endDate,
			originalRow: proj.row,
		});
	};

	const handleMoveTouchStart = (projectId: string) => (e: React.TouchEvent) => {
		if ((e.target as HTMLElement).classList.contains('resize-handle')) return;
		e.preventDefault();
		const proj = placedProjects.find(p => p.id === projectId);
		if (!proj) return;
		gridViewportRectRef.current = gridRef.current?.getBoundingClientRect() ?? null;
		const target = e.currentTarget as HTMLDivElement;
		const rect = target.getBoundingClientRect();
		setHoveredProject(null);
		const { clientX, clientY } = rotateTouchCoords(e.touches[0].clientX, e.touches[0].clientY);
		const color = projectColors[proj.projectId] || '#3b82f6';
		const ghostData = {
			id: projectId,
			name: proj.name,
			color,
			width: rect.width,
			height: rect.height,
			pointerOffsetX: clientX - rect.left,
			pointerOffsetY: clientY - rect.top,
			startLabel: formatShortDayMonth(proj.startDate),
			endLabel: formatShortDayMonth(proj.endDate),
		};
		moveTooltipKeyRef.current = '';
		currentClientXRef.current = clientX;
		currentClientYRef.current = clientY;
		dragOrigLeftRef.current = dateToX(proj.startDate);
		dragOrigWidthRef.current = dateToX(proj.endDate) - dragOrigLeftRef.current;
		movingGhostDataRef.current = ghostData;
		setMovingGhost(ghostData);
		setMoving({
			id: projectId,
			grabOffsetX: clientXToGridX(clientX) - dragOrigLeftRef.current,
			startY: clientY,
			originalStart: proj.startDate,
			originalEnd: proj.endDate,
			originalRow: proj.row,
		});
	};

	const handleRemoveProject = (projectId: string) => (e: React.MouseEvent) => {
		e.stopPropagation();
		setPlacedProjects(prev => prev.filter(p => p.id !== projectId));
	};

	// ── Mois view ──────────────────────────────────────────────────────────

	const monthGridDays = useMemo(() =>
		getMonthGridDays(currentDate.getFullYear(), currentDate.getMonth()),
		[currentDate]
	);

	const holidayDaysInChronology = useMemo(() => {
		const start = startOfWeek(new Date(dateRange.start));
		return Array.from({ length: totalDays }, (_, i) => addDays(start, i))
			.filter(isFrenchPublicHoliday);
	}, [dateRange.start, totalDays]);

	const renderMoisView = () => (
		<div className="view-mois">
			<div className="mois-day-names">
				{DAY_NAMES.map(d => <div key={d} className="mois-day-name">{d}</div>)}
			</div>
			<div className="mois-grid">
				{monthGridDays.map((day, i) => {
					const isCurrentMonth = day.getMonth() === currentDate.getMonth();
					const isHoliday = isFrenchPublicHoliday(day);
					const dayProjects = placedProjects.filter(p => projectOverlapsDay(p, day));
					const visible = dayProjects.slice(0, 3);
					const overflow = dayProjects.length - 3;
					const altColor = alternanceDays[formatDate(day)];

					return (
						<div
							key={i}
							className={[
								'mois-day-cell',
								isHoliday ? 'holiday' : '',
								isToday(day) ? 'today' : '',
								!isCurrentMonth ? 'outside-month' : '',
							].join(' ')}
							onDragOver={handleGridDragOver}
							onDrop={handleDayCellDrop(day)}
						>
							{altColor && (
								<div className="alternance-strip" style={{ backgroundColor: altColor }} />
							)}
							<span className="mois-day-number">{day.getDate()}</span>
							<div className="mois-day-projects">
								{visible.map(proj => (
									<div
										key={proj.id}
										className="mois-project-chip"
										style={{ backgroundColor: projectColors[proj.projectId] || '#3b82f6' }}
										title={proj.name}
									>
										{proj.name}
									</div>
								))}
								{overflow > 0 && (
									<div className="mois-project-more">+{overflow} autre{overflow > 1 ? 's' : ''}</div>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);

	// ── Semaine view ───────────────────────────────────────────────────────

	const weekDays = useMemo(() => {
		const mon = startOfWeek(currentDate);
		return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
	}, [currentDate]);

	const renderSemaineView = () => (
		<div className="view-semaine">
			<div className="semaine-grid">
				{weekDays.map((day, i) => {
					const isHoliday = isFrenchPublicHoliday(day);
					const dayProjects = placedProjects.filter(p => projectOverlapsDay(p, day));
					const altColor = alternanceDays[formatDate(day)];
					return (
						<div
							key={i}
							className={`semaine-day-col ${isHoliday ? 'holiday' : ''} ${isToday(day) ? 'today' : ''}`}
							onDragOver={handleGridDragOver}
							onDrop={handleDayCellDrop(day)}
						>
							<div className="semaine-day-header">
								{altColor && <div className="alternance-strip" style={{ backgroundColor: altColor }} />}
								<span className="semaine-day-name">{DAY_NAMES[i]}</span>
								<span className={`semaine-day-num ${isToday(day) ? 'today-badge' : ''}`}>
									{day.getDate()}
								</span>
							</div>
							<div className="semaine-day-body">
								{dayProjects.length === 0 ? (
									<div className="semaine-drop-hint">Déposer ici</div>
								) : (
									dayProjects.map(proj => {
										const duration = diffDays(proj.startDate, proj.endDate);
										return (
											<div
												key={proj.id}
												className="semaine-project-chip"
												style={{ backgroundColor: projectColors[proj.projectId] || '#3b82f6' }}
											>
												<span className="semaine-chip-name">{proj.name}</span>
												<span className="semaine-chip-meta">{duration}j · {proj.xp.toLocaleString()} XP</span>
											</div>
										);
									})
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);

	// ── Agenda view ────────────────────────────────────────────────────────

	const agendaByMonth = useMemo(() => {
		const sorted = [...placedProjects].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
		const groups: { label: string; projects: PlacedProject[] }[] = [];
		sorted.forEach(proj => {
			const label = formatMonthYear(proj.startDate);
			const last = groups[groups.length - 1];
			if (last && last.label === label) {
				last.projects.push(proj);
			} else {
				groups.push({ label, projects: [proj] });
			}
		});
		return groups;
	}, [placedProjects]);

	const renderAgendaView = () => {
		if (placedProjects.length === 0) {
			return (
				<div className="agenda-empty">
					<div className="agenda-empty-icon">📅</div>
					<p>Aucun projet planifié.</p>
					<p>Glissez des projets depuis la vue Chronologie ou Mois.</p>
				</div>
			);
		}
		return (
			<div className="view-agenda">
				{agendaByMonth.map(group => (
					<div key={group.label} className="agenda-month-group">
						<h3 className="agenda-month-label">{group.label}</h3>
						{group.projects.map(proj => {
							const duration = diffDays(proj.startDate, proj.endDate);
							const color = projectColors[proj.projectId] || '#3b82f6';
							return (
								<div key={proj.id} className="agenda-item">
									<div className="agenda-item-dot" style={{ backgroundColor: color }} />
									<div className="agenda-item-body">
										<div className="agenda-item-name">{proj.name}</div>
										<div className="agenda-item-meta">
											<span>
												{proj.startDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
												{' → '}
												{proj.endDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
											</span>
											<span className="agenda-meta-sep">·</span>
											<span>{duration} jour{duration > 1 ? 's' : ''}</span>
											<span className="agenda-meta-sep">·</span>
											<span>{proj.xp.toLocaleString()} XP</span>
										</div>
									</div>
									<button
										className="agenda-item-remove"
										onClick={handleRemoveProject(proj.id)}
										title="Retirer du calendrier"
									>
										×
									</button>
								</div>
							);
						})}
					</div>
				))}
			</div>
		);
	};

	// ── Render ─────────────────────────────────────────────────────────────

	const showSidebar = view !== 'agenda';

	return (
		<>
			<div className="calendar-page">
				<Header />
				<div className="calendar-container">

					{/* Controls bar */}
					<div className="calendar-controls">
						<div className="view-switcher">
							{(['agenda', 'semaine', 'mois', 'chronologie'] as CalendarView[]).map(v => (
								<button
									key={v}
									className={`view-btn ${view === v ? 'active' : ''}`}
									onClick={() => setView(v)}
								>
									{v.charAt(0).toUpperCase() + v.slice(1)}
								</button>
							))}
						</div>

						{view === 'chronologie' ? (
							<div className="date-range-picker">
								<label>
									<span>Du</span>
									<input
										type="date"
										value={formatDate(dateRange.start)}
										onChange={e => {
											const d = parseDate(e.target.value);
											if (!isNaN(d.getTime())) setDateRange(prev => ({ ...prev, start: d }));
										}}
									/>
								</label>
								<label>
									<span>Au</span>
									<input
										type="date"
										value={formatDate(dateRange.end)}
										onChange={e => {
											const d = parseDate(e.target.value);
											if (!isNaN(d.getTime())) setDateRange(prev => ({ ...prev, end: d }));
										}}
									/>
								</label>
							</div>
						) : navLabel ? (
							<div className="calendar-nav">
								<button className="nav-arrow" onClick={goPrev} aria-label="Précédent">‹</button>
								<button className="nav-today" onClick={goToToday}>Aujourd'hui</button>
								<span className="nav-label">{navLabel}</span>
								<button className="nav-arrow" onClick={goNext} aria-label="Suivant">›</button>
							</div>
						) : null}

						<div className="calendar-right-controls">
							<div className="alternance-legend">
								{alternanceLegend?.entreprise && (
									<div className="alternance-legend-item">
										<span className="alternance-legend-dot" style={{ backgroundColor: alternanceLegend.entreprise }} />
										<span className="alternance-legend-label">Entreprise</span>
									</div>
								)}
								{alternanceLegend?.ecole && (
									<div className="alternance-legend-item">
										<span className="alternance-legend-dot" style={{ backgroundColor: alternanceLegend.ecole }} />
										<span className="alternance-legend-label">École</span>
									</div>
								)}
								{alternanceLegend?.distanciel && (
									<div className="alternance-legend-item">
										<span className="alternance-legend-dot" style={{ backgroundColor: alternanceLegend.distanciel }} />
										<span className="alternance-legend-label">Distanciel</span>
									</div>
								)}
								<div className="alternance-legend-item">
									<span className="alternance-legend-dot" style={{ backgroundColor: HOLIDAY_COLOR }} />
									<span className="alternance-legend-label">Jour férié</span>
								</div>
							</div>
							<div className="alternance-import-group">
								<input
									ref={fileInputRef}
									type="file"
									accept=".xlsx"
									style={{ display: 'none' }}
									onChange={handleFileChange}
								/>
								<button className="import-btn" onClick={handleImportClick} title="Importer un planning d'alternance (.xlsx)">
									Importer planning
								</button>
								{Object.keys(alternanceDays).length > 0 && (
									<button className="clear-alternance-btn" onClick={handleClearAlternance} title="Effacer le planning importé">
										×
									</button>
								)}
							</div>
						</div>
					</div>

					{/* Import error */}
					{importError && (
						<div className="import-error">
							<span>{importError}</span>
							<button onClick={() => setImportError(null)}>×</button>
						</div>
					)}

					{/* Contract dates confirmation */}
					{contractPrompt && (
						<div className="contract-prompt">
							<div className="contract-prompt-icon">📅</div>
							<div className="contract-prompt-body">
								<p className="contract-prompt-title">Dates de contrat détectées</p>
								<p className="contract-prompt-text">
									Le contrat couvre du{' '}
									<strong>{contractPrompt.start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
									{' '}au{' '}
									<strong>{contractPrompt.end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.
									<br />
									Mettre à jour la plage du calendrier pour correspondre ?
								</p>
							</div>
							<div className="contract-prompt-actions">
								<button className="prompt-btn-confirm" onClick={handleContractAccept}>Oui</button>
								<button className="prompt-btn-cancel" onClick={handleContractDecline}>Non</button>
							</div>
						</div>
					)}

					<div className={`calendar-layout${chronoFullscreen ? ' chrono-landscape' : ''}`}>
						{showSidebar && !chronoFullscreen && (
							<div className="calendar-sidebar">
								<h3 className="sidebar-title">Projets simulés</h3>
								{availableProjects.length === 0 ? (
									<p className="sidebar-empty">
										Tous les projets simulés sont placés, ou aucun n'est simulé.
									</p>
								) : (
									<div className="sidebar-projects">
										{availableProjects.map(p => (
											<div
												key={p.id}
												className="sidebar-project"
												draggable
												onDragStart={handleSidebarDragStart(p)}
												onClick={handleSidebarTap(p)}
											>
												<span className="sidebar-project-name">{p.name}</span>
												<span className="sidebar-project-xp">{p.xp.toLocaleString()} XP</span>
											</div>
										))}
									</div>
								)}
							</div>
						)}

						{/* Chronologie (Gantt) */}
						{view === 'chronologie' && (
							<>
								<div className="grid-zoom-bar">
									<button
										className="fullscreen-landscape-btn"
										onClick={handleChronoFullscreen}
										title={chronoFullscreen ? 'Réduire' : 'Vue paysage'}
									>
										{chronoFullscreen ? '✕' : '⛶'}
									</button>
									{chronoFullscreen && (
										<div className="landscape-sidebar-projects">
											{availableProjects.map(p => (
												<div
													key={p.id}
													className="sidebar-project"
													draggable
													onDragStart={handleSidebarDragStart(p)}
													onClick={handleSidebarTap(p)}
												>
													<span className="sidebar-project-name">{p.name}</span>
													<span className="sidebar-project-xp">{p.xp.toLocaleString()} XP</span>
												</div>
											))}
										</div>
									)}
									<div className="zoom-group">
										{ZOOM_LABELS.map((label, i) => (
											<button
												key={label}
												className={`zoom-btn ${zoomIndex === i ? 'active' : ''}`}
												onClick={() => setZoomIndex(i)}
											>
												{label}
											</button>
										))}
									</div>
								</div>
								<div
									className="calendar-grid-wrapper"
									ref={gridRef}
									onDragOver={handleGridDragOver}
									onDrop={handleGridDrop}
								>
									<div
										className="calendar-grid"
										style={{ width: totalWidth, minHeight: rowCount * ROW_HEIGHT + HEADER_HEIGHT }}
									>
										<div className="month-headers" style={{ height: 32 }}>
											{monthSpans.map((span, i) => {
												const label = span.weekCount <= 1
													? span.label.replace(/^(.+)\s+(\d{4})$/, (_, m, y) => `${m} '${y.slice(2)}`)
													: span.label;
												return (
													<div
														key={i}
														className="month-header"
														style={{ left: span.startWeekIndex * weekWidth, width: span.weekCount * weekWidth }}
													>
														{label}
													</div>
												);
											})}
											{monthSpans
												.filter(span => span.startWeekIndex > 0)
												.map(span => (
													<div
														key={`month-sep-${span.startWeekIndex}`}
														className="month-header-separator"
														style={{ left: span.startWeekIndex * weekWidth }}
													/>
												))}
										</div>
										<div className="week-headers" style={{ top: 32, height: 38 }}>
											{weeks.map((w, i) => {
												const endOfWeek = addDays(w, 6);
												return (
													<div
														key={i}
														className="week-header"
														style={{ left: i * weekWidth, width: weekWidth }}
													>
														<span className="week-day">{w.getDate()}</span>
														<span className="week-sep">–</span>
														<span className="week-day">{endOfWeek.getDate()}</span>
													</div>
												);
											})}
											{monthSpans
												.filter(span => span.startWeekIndex > 0)
												.map(span => (
													<div
														key={`week-sep-${span.startWeekIndex}`}
														className="week-header-separator"
														style={{ left: span.startWeekIndex * weekWidth }}
													/>
												))}
										</div>
										<div className="grid-body" style={{ top: HEADER_HEIGHT }}>
											{holidayDaysInChronology.map(day => {
												const x = dateToX(day);
												if (x < -dayWidth || x > totalWidth) return null;
												return (
													<div
														key={`holiday-${formatDate(day)}`}
														className="holiday-day-bg"
														style={{ left: x, width: dayWidth }}
													/>
												);
											})}
											{/* Alternance day background strips */}
											{Object.entries(alternanceDays).map(([dateKey, color]) => {
												const day = parseDate(dateKey);
												const x = dateToX(day);
												if (x < -dayWidth || x > totalWidth) return null;
												return (
													<div
														key={dateKey}
														className="alternance-day-bg"
														style={{ left: x, width: dayWidth, backgroundColor: color }}
													/>
												);
											})}
											{/* Today indicator */}
											{(() => {
												const todayX = dateToX(new Date());
												if (todayX < 0 || todayX > totalWidth) return null;
												return <div className="grid-today-line" style={{ left: todayX }} />;
											})()}
											{/* Day dividers (only in "Jour" zoom) */}
											{showDayDividers && totalDays > 1 && Array.from({ length: totalDays - 1 }, (_, i) => {
												const dayIndex = i + 1;
												if (dayIndex % 7 === 0) return null; // week borders already rendered
												return (
													<div
														key={`dvl-${dayIndex}`}
														className="grid-day-vline"
														style={{ left: dayIndex * dayWidth }}
													/>
												);
											})}
											{weeks.map((_, i) => (
												<div
													key={`vl-${i}`}
													className={`grid-vline ${i > 0 && monthSpans.some(s => s.startWeekIndex === i) ? 'month-border' : ''}`}
													style={{ left: i * weekWidth }}
												/>
											))}
											{Array.from({ length: rowCount }, (_, i) => (
												<div key={`hl-${i}`} className="grid-hline" style={{ top: i * ROW_HEIGHT }} />
											))}
											{placedProjects.map(proj => {
												const x = dateToX(proj.startDate);
												const w = dateToX(proj.endDate) - x;
												const y = proj.row * ROW_HEIGHT;
												const color = projectColors[proj.projectId] || '#3b82f6';
												return (
													<div
														key={proj.id}
														ref={(el: HTMLDivElement | null) => { if (resizing?.id === proj.id) dragElRef.current = el; }}
														className={`placed-project ${resizing?.id === proj.id ? 'active' : ''} ${moving?.id === proj.id ? 'ghost-source-hidden' : ''}`}
														style={{ left: x, width: Math.max(w, 30), top: y + PROJECT_VERTICAL_INSET, height: ROW_HEIGHT - PROJECT_VERTICAL_INSET * 2, backgroundColor: color }}
														onMouseDown={handleMoveStart(proj.id)}
														onTouchStart={handleMoveTouchStart(proj.id)}
														onMouseEnter={(e) => {
															if (!moving && !resizing) setHoveredProject({ proj, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() });
														}}
														onMouseLeave={() => setHoveredProject(null)}
														onClick={(e) => {
															if (moving || resizing) return;
															const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
															setHoveredProject(prev => prev?.proj.id === proj.id ? null : { proj, rect });
														}}
													>
														<div className="resize-handle resize-left" onMouseDown={handleResizeStart(proj.id, 'left')}
															onTouchStart={handleResizeTouchStart(proj.id, 'left')} />
														<div className="placed-project-content">
															<span className="placed-project-name">{proj.name}</span>
															<div className="placed-project-right">
																<button
																	className="placed-project-remove"
																	onClick={handleRemoveProject(proj.id)}
																	title="Retirer"
																>
																	×
																</button>
															</div>
														</div>
														{(moving?.id === proj.id || resizing?.id === proj.id) && (
															<div className="drag-tooltip">
																<span className={resizing?.id === proj.id && resizing.edge === 'left' ? 'drag-tooltip-active' : ''}>
																	{proj.startDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
																</span>
																{" → "}
																<span className={resizing?.id === proj.id && resizing.edge === 'right' ? 'drag-tooltip-active' : ''}>
																	{proj.endDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
																</span>
															</div>
														)}
														<div className="resize-handle resize-right" onMouseDown={handleResizeStart(proj.id, 'right')}
															onTouchStart={handleResizeTouchStart(proj.id, 'right')} />
													</div>
												);
											})}
										</div>
									</div>
								</div>
							</>
						)}

						{view === 'mois' && renderMoisView()}
						{view === 'semaine' && renderSemaineView()}
						{view === 'agenda' && renderAgendaView()}
					</div>
				</div>
			</div>

			{movingGhost && moving && createPortal(
				<div
					ref={dragGhostRef}
					className="placed-project drag-ghost-project active"
					style={{
						left: 0,
						top: 0,
						transform: `translate3d(${currentClientXRef.current - movingGhost.pointerOffsetX}px, ${currentClientYRef.current - movingGhost.pointerOffsetY}px, 0)`,
						width: movingGhost.width,
						height: movingGhost.height,
						backgroundColor: movingGhost.color,
					}}
				>
					<div className="placed-project-content">
						<span className="placed-project-name">{movingGhost.name}</span>
					</div>
					<div className="drag-tooltip">
						<span>{movingGhost.startLabel}</span>
						{" → "}
						<span>{movingGhost.endLabel}</span>
					</div>
				</div>,
				document.body,
			)}

			{/* Hover tooltip — portal so it escapes overflow:auto containers */}
			{hoveredProject && !moving && !resizing && (() => {
				const { proj, rect } = hoveredProject;
				const today = new Date(); today.setHours(0, 0, 0, 0);
				const durationDays = diffDays(proj.startDate, proj.endDate);
				const daysLeft = diffDays(today, proj.endDate);
				const schoolColors = new Set(
					[alternanceLegend?.ecole, alternanceLegend?.distanciel].filter(Boolean) as string[]
				);
				const schoolDaysLeft = Object.entries(alternanceDays).filter(([dateKey, color]) => {
					if (!schoolColors.has(color)) return false;
					const d = new Date(dateKey + 'T00:00:00');
					return d >= today && d < proj.endDate;
				}).length;
				const tooltipX = rect.left + rect.width / 2;
				const tooltipY = rect.top - 8;
				return createPortal(
					<div
						className="project-hover-tooltip"
						style={{ position: 'fixed', left: tooltipX, top: tooltipY, transform: 'translate(-50%, -100%)' }}
					>
						<div className="hover-tooltip-row">
							<span className="hover-tooltip-label">Début</span>
							<span>{proj.startDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
						</div>
						<div className="hover-tooltip-row">
							<span className="hover-tooltip-label">Fin</span>
							<span>{proj.endDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
						</div>
						<div className="hover-tooltip-row">
							<span className="hover-tooltip-label">Durée</span>
							<span>{durationDays} jour{durationDays > 1 ? 's' : ''}</span>
						</div>
						<div className="hover-tooltip-row">
							<span className="hover-tooltip-label">Reste</span>
							<span>
								{daysLeft > 0 ? `${daysLeft} jour${daysLeft > 1 ? 's' : ''}` : daysLeft === 0 ? "Aujourd'hui" : 'Terminé'}
							</span>
						</div>
						{schoolColors.size > 0 && (
							<div className="hover-tooltip-row">
								<span className="hover-tooltip-label">J. école restants</span>
								<span>{schoolDaysLeft}</span>
							</div>
						)}
						<div className="hover-tooltip-row">
							<span className="hover-tooltip-label">XP</span>
							<span>{proj.xp.toLocaleString()}</span>
						</div>
					</div>,
					document.body,
				);
			})()}
		</>
	);
};

export default Calendar;
