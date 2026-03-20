import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Header from '@/components/Header/Header';
import { RNCP_DATA } from '@/data/rncp.data';
import type { SimulatorProject } from '@/types/rncp.types';
import { parseAlternanceXlsx } from './alternanceParser';
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

function loadAlternanceDays(): Record<string, string> {
	try {
		return JSON.parse(localStorage.getItem(ALTERNANCE_KEY) || '{}');
	} catch { return {}; }
}

function saveAlternanceDays(days: Record<string, string>) {
	localStorage.setItem(ALTERNANCE_KEY, JSON.stringify(days));
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

function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10);
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

const WEEK_WIDTH = 120;
const ROW_HEIGHT = 52;
const HEADER_HEIGHT = 70;

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
		id: string; edge: 'left' | 'right'; startX: number;
		originalStart: Date; originalEnd: Date;
	} | null>(null);
	const [moving, setMoving] = useState<{
		id: string; startX: number; startY: number;
		originalStart: Date; originalEnd: Date; originalRow: number;
	} | null>(null);
	const [alternanceDays, setAlternanceDays] = useState<Record<string, string>>(loadAlternanceDays);
	const [contractPrompt, setContractPrompt] = useState<{ start: Date; end: Date } | null>(null);
	const [importError, setImportError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const gridRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const { projects } = getSimulatedProjects();
		setSimulatedProjects(projects);
	}, []);

	useEffect(() => { savePlacedProjects(placedProjects); }, [placedProjects]);
	useEffect(() => { saveDateRange(dateRange.start, dateRange.end); }, [dateRange]);
	useEffect(() => { localStorage.setItem(VIEW_KEY, view); }, [view]);
	useEffect(() => { saveAlternanceDays(alternanceDays); }, [alternanceDays]);

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

	const handleClearAlternance = () => setAlternanceDays({});

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
	const totalWidth = weeks.length * WEEK_WIDTH;
	const maxRow = useMemo(() =>
		placedProjects.length === 0 ? 0 : Math.max(...placedProjects.map(p => p.row)),
		[placedProjects]
	);
	const rowCount = Math.max(10, maxRow + 2);

	const dateToX = useCallback((date: Date): number => {
		const rangeStart = startOfWeek(new Date(dateRange.start));
		return (diffDays(rangeStart, date) / 7) * WEEK_WIDTH;
	}, [dateRange.start]);

	const xToDate = useCallback((x: number): Date => {
		const rangeStart = startOfWeek(new Date(dateRange.start));
		return addDays(rangeStart, Math.round((x / WEEK_WIDTH) * 7));
	}, [dateRange.start]);

	const yToRow = useCallback((y: number): number => Math.max(0, Math.floor(y / ROW_HEIGHT)), []);

	// ── Drag helpers ───────────────────────────────────────────────────────

	const handleSidebarDragStart = (project: SimulatorProject) => (e: React.DragEvent) => {
		setDragData({ projectId: project.id, name: project.name, xp: project.xp });
		e.dataTransfer.effectAllowed = 'copy';
	};

	const handleGridDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'copy';
	};

	const dropProject = (startDate: Date, row: number) => {
		if (!dragData) return;
		setPlacedProjects(prev => [...prev, {
			id: `${dragData.projectId}-${Date.now()}`,
			projectId: dragData.projectId,
			name: dragData.name,
			xp: dragData.xp,
			startDate,
			endDate: addDays(startDate, 14),
			row,
		}]);
		setDragData(null);
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
		setResizing({ id: projectId, edge, startX: e.clientX, originalStart: proj.startDate, originalEnd: proj.endDate });
	};

	const handleMouseMove = useCallback((e: MouseEvent) => {
		if (resizing) {
			const daysDelta = Math.round(((e.clientX - resizing.startX) / WEEK_WIDTH) * 7);
			setPlacedProjects(prev => prev.map(p => {
				if (p.id !== resizing.id) return p;
				if (resizing.edge === 'left') {
					const newStart = addDays(resizing.originalStart, daysDelta);
					if (newStart < p.endDate) return { ...p, startDate: newStart };
				} else {
					const newEnd = addDays(resizing.originalEnd, daysDelta);
					if (newEnd > p.startDate) return { ...p, endDate: newEnd };
				}
				return p;
			}));
		}
		if (moving) {
			const daysDelta = Math.round(((e.clientX - moving.startX) / WEEK_WIDTH) * 7);
			const rowDelta = Math.round((e.clientY - moving.startY) / ROW_HEIGHT);
			setPlacedProjects(prev => prev.map(p => {
				if (p.id !== moving.id) return p;
				return {
					...p,
					startDate: addDays(moving.originalStart, daysDelta),
					endDate: addDays(moving.originalEnd, daysDelta),
					row: Math.max(0, moving.originalRow + rowDelta),
				};
			}));
		}
	}, [resizing, moving]);

	const handleMouseUp = useCallback(() => { setResizing(null); setMoving(null); }, []);

	useEffect(() => {
		if (resizing || moving) {
			window.addEventListener('mousemove', handleMouseMove);
			window.addEventListener('mouseup', handleMouseUp);
			return () => {
				window.removeEventListener('mousemove', handleMouseMove);
				window.removeEventListener('mouseup', handleMouseUp);
			};
		}
	}, [resizing, moving, handleMouseMove, handleMouseUp]);

	const handleMoveStart = (projectId: string) => (e: React.MouseEvent) => {
		if ((e.target as HTMLElement).classList.contains('resize-handle')) return;
		e.preventDefault();
		const proj = placedProjects.find(p => p.id === projectId);
		if (!proj) return;
		setMoving({ id: projectId, startX: e.clientX, startY: e.clientY, originalStart: proj.startDate, originalEnd: proj.endDate, originalRow: proj.row });
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

	const renderMoisView = () => (
		<div className="view-mois">
			<div className="mois-day-names">
				{DAY_NAMES.map(d => <div key={d} className="mois-day-name">{d}</div>)}
			</div>
			<div className="mois-grid">
				{monthGridDays.map((day, i) => {
					const isCurrentMonth = day.getMonth() === currentDate.getMonth();
					const dayProjects = placedProjects.filter(p => projectOverlapsDay(p, day));
					const visible = dayProjects.slice(0, 3);
					const overflow = dayProjects.length - 3;
					const altColor = alternanceDays[formatDate(day)];

					return (
						<div
							key={i}
							className={[
								'mois-day-cell',
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
					const dayProjects = placedProjects.filter(p => projectOverlapsDay(p, day));
					const altColor = alternanceDays[formatDate(day)];
					return (
						<div
							key={i}
							className={`semaine-day-col ${isToday(day) ? 'today' : ''}`}
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

				<div className="calendar-layout">
					{/* Sidebar */}
					{showSidebar && (
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
									{monthSpans.map((span, i) => (
										<div
											key={i}
											className="month-header"
											style={{ left: span.startWeekIndex * WEEK_WIDTH, width: span.weekCount * WEEK_WIDTH }}
										>
											{span.label}
										</div>
									))}
								</div>
								<div className="week-headers" style={{ top: 32, height: 38 }}>
									{weeks.map((w, i) => {
										const endOfWeek = addDays(w, 6);
										return (
											<div key={i} className="week-header" style={{ left: i * WEEK_WIDTH, width: WEEK_WIDTH }}>
												<span className="week-day">{w.getDate()}</span>
												<span className="week-sep">–</span>
												<span className="week-day">{endOfWeek.getDate()}</span>
												<span className="week-month">
													{w.toLocaleDateString('fr-FR', { month: 'short' })}
												</span>
											</div>
										);
									})}
								</div>
								<div className="grid-body" style={{ top: HEADER_HEIGHT }}>
									{/* Alternance day background strips */}
									{Object.entries(alternanceDays).map(([dateKey, color]) => {
										const day = parseDate(dateKey);
										const x = dateToX(day);
										const dayWidth = WEEK_WIDTH / 7;
										if (x < -dayWidth || x > totalWidth) return null;
										return (
											<div
												key={dateKey}
												className="alternance-day-bg"
												style={{ left: x, width: dayWidth, backgroundColor: color }}
											/>
										);
									})}
									{weeks.map((_, i) => (
										<div
											key={`vl-${i}`}
											className={`grid-vline ${i > 0 && monthSpans.some(s => s.startWeekIndex === i) ? 'month-border' : ''}`}
											style={{ left: i * WEEK_WIDTH }}
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
										const durationDays = diffDays(proj.startDate, proj.endDate);
										const durationWeeks = Math.round(durationDays / 7 * 10) / 10;
										return (
											<div
												key={proj.id}
												className={`placed-project ${resizing?.id === proj.id || moving?.id === proj.id ? 'active' : ''}`}
												style={{ left: x, width: Math.max(w, 30), top: y + 4, height: ROW_HEIGHT - 8, backgroundColor: color }}
												onMouseDown={handleMoveStart(proj.id)}
											>
												<div className="resize-handle resize-left" onMouseDown={handleResizeStart(proj.id, 'left')} />
												<div className="placed-project-content">
													<span className="placed-project-name">{proj.name}</span>
													<span className="placed-project-duration">
														{durationWeeks <= 1 ? `${durationDays}j` : `${durationWeeks}sem`}
													</span>
												</div>
												<button
													className="placed-project-remove"
													onClick={handleRemoveProject(proj.id)}
													title="Retirer"
												>
													×
												</button>
												<div className="resize-handle resize-right" onMouseDown={handleResizeStart(proj.id, 'right')} />
											</div>
										);
									})}
								</div>
							</div>
						</div>
					)}

					{view === 'mois' && renderMoisView()}
					{view === 'semaine' && renderSemaineView()}
					{view === 'agenda' && renderAgendaView()}
				</div>
			</div>
		</div>
	);
};

export default Calendar;
