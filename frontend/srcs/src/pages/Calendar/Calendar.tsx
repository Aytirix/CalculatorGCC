import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Header from '@/components/Header/Header';
import { RNCP_DATA } from '@/data/rncp.data';
import type { SimulatorProject } from '@/types/rncp.types';
import './Calendar.scss';

// ── Types ──────────────────────────────────────────────────────────────────

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

function startOfWeek(date: Date): Date {
	const d = new Date(date);
	const day = d.getDay();
	const diff = day === 0 ? 6 : day - 1; // Monday = start
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

function formatMonthYear(date: Date): string {
	return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function parseDate(s: string): Date {
	const d = new Date(s + 'T00:00:00');
	return d;
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
			spans.push({
				label: formatMonthYear(weeks[i]),
				startWeekIndex: i,
				weekCount: 1,
			});
			currentMonth = m;
			currentYear = y;
		} else {
			spans[spans.length - 1].weekCount++;
		}
	}
	return spans;
}

function getSimulatedProjects(): { projects: SimulatorProject[]; subProjectIds: Record<string, string[]> } {
	const simulatedIds: string[] = JSON.parse(localStorage.getItem('simulated_projects') || '[]');
	const simulatedSubProjects: Record<string, string[]> = JSON.parse(localStorage.getItem('simulated_sub_projects') || '{}');

	const projects: SimulatorProject[] = [];
	const seen = new Set<string>();

	RNCP_DATA.forEach(rncp => {
		rncp.categories.forEach(cat => {
			cat.projects.forEach(p => {
				if (seen.has(p.id)) return;

				// Direct simulation
				if (simulatedIds.includes(p.id) || simulatedIds.includes(p.slug || '')) {
					seen.add(p.id);
					projects.push(p);
					return;
				}

				// Sub-project simulation (if all sub-projects simulated)
				if (p.subProjects && simulatedSubProjects[p.id]) {
					const checkedSubs = simulatedSubProjects[p.id];
					if (p.subProjects.every(sub => checkedSubs.includes(sub.id))) {
						seen.add(p.id);
						projects.push(p);
					}
				}
			});
		});
	});

	return { projects, subProjectIds: simulatedSubProjects };
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
	const start = new Date(now.getFullYear(), now.getMonth(), 1);
	const end = new Date(now.getFullYear(), now.getMonth() + 6, 0);
	return { start, end };
}

function saveDateRange(start: Date, end: Date) {
	localStorage.setItem(RANGE_KEY, JSON.stringify({ start: formatDate(start), end: formatDate(end) }));
}

// ── Constants ──────────────────────────────────────────────────────────────

const WEEK_WIDTH = 120; // px per week column
const ROW_HEIGHT = 52;  // px per row
const HEADER_HEIGHT = 70; // month + week header

// ── Component ──────────────────────────────────────────────────────────────

const Calendar: React.FC = () => {
	const [dateRange, setDateRange] = useState(loadDateRange);
	const [placedProjects, setPlacedProjects] = useState<PlacedProject[]>(loadPlacedProjects);
	const [simulatedProjects, setSimulatedProjects] = useState<SimulatorProject[]>([]);
	const [dragData, setDragData] = useState<{ projectId: string; name: string; xp: number } | null>(null);
	const [resizing, setResizing] = useState<{ id: string; edge: 'left' | 'right'; startX: number; originalStart: Date; originalEnd: Date } | null>(null);
	const [moving, setMoving] = useState<{ id: string; startX: number; startY: number; originalStart: Date; originalEnd: Date; originalRow: number } | null>(null);
	const gridRef = useRef<HTMLDivElement>(null);

	// Load simulated projects
	useEffect(() => {
		const { projects } = getSimulatedProjects();
		setSimulatedProjects(projects);
	}, []);

	// Persist placed projects
	useEffect(() => {
		savePlacedProjects(placedProjects);
	}, [placedProjects]);

	// Persist date range
	useEffect(() => {
		saveDateRange(dateRange.start, dateRange.end);
	}, [dateRange]);

	const weeks = useMemo(() => getWeeks(dateRange.start, dateRange.end), [dateRange]);
	const monthSpans = useMemo(() => getMonthSpans(weeks), [weeks]);
	const totalWidth = weeks.length * WEEK_WIDTH;

	// Compute max row count
	const maxRow = useMemo(() => {
		if (placedProjects.length === 0) return 0;
		return Math.max(...placedProjects.map(p => p.row));
	}, [placedProjects]);
	const rowCount = Math.max(10, maxRow + 2);

	// Available (not yet placed) simulated projects
	const availableProjects = useMemo(() => {
		const placedIds = new Set(placedProjects.map(p => p.projectId));
		return simulatedProjects.filter(p => !placedIds.has(p.id));
	}, [simulatedProjects, placedProjects]);

	// ── Date range handlers ────────────────────────────────────────────────

	const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const d = parseDate(e.target.value);
		if (!isNaN(d.getTime())) {
			setDateRange(prev => ({ ...prev, start: d }));
		}
	};

	const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const d = parseDate(e.target.value);
		if (!isNaN(d.getTime())) {
			setDateRange(prev => ({ ...prev, end: d }));
		}
	};

	// ── Coordinate helpers ─────────────────────────────────────────────────

	const dateToX = useCallback((date: Date): number => {
		const rangeStart = startOfWeek(new Date(dateRange.start));
		const days = diffDays(rangeStart, date);
		return (days / 7) * WEEK_WIDTH;
	}, [dateRange.start]);

	const xToDate = useCallback((x: number): Date => {
		const rangeStart = startOfWeek(new Date(dateRange.start));
		const days = Math.round((x / WEEK_WIDTH) * 7);
		return addDays(rangeStart, days);
	}, [dateRange.start]);

	const yToRow = useCallback((y: number): number => {
		return Math.max(0, Math.floor(y / ROW_HEIGHT));
	}, []);

	// ── Drag from sidebar ──────────────────────────────────────────────────

	const handleSidebarDragStart = (project: SimulatorProject) => (e: React.DragEvent) => {
		setDragData({ projectId: project.id, name: project.name, xp: project.xp });
		e.dataTransfer.effectAllowed = 'copy';
	};

	const handleGridDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'copy';
	};

	const handleGridDrop = (e: React.DragEvent) => {
		e.preventDefault();
		if (!dragData || !gridRef.current) return;

		const rect = gridRef.current.getBoundingClientRect();
		const x = e.clientX - rect.left + gridRef.current.scrollLeft;
		const y = e.clientY - rect.top - HEADER_HEIGHT;

		const dropDate = xToDate(x);
		const row = yToRow(y);
		const endDate = addDays(dropDate, 14); // Default 2 weeks

		setPlacedProjects(prev => [
			...prev,
			{
				id: `${dragData.projectId}-${Date.now()}`,
				projectId: dragData.projectId,
				name: dragData.name,
				xp: dragData.xp,
				startDate: dropDate,
				endDate,
				row,
			},
		]);
		setDragData(null);
	};

	// ── Resize logic ───────────────────────────────────────────────────────

	const handleResizeStart = (projectId: string, edge: 'left' | 'right') => (e: React.MouseEvent) => {
		e.stopPropagation();
		e.preventDefault();
		const proj = placedProjects.find(p => p.id === projectId);
		if (!proj) return;
		setResizing({
			id: projectId,
			edge,
			startX: e.clientX,
			originalStart: proj.startDate,
			originalEnd: proj.endDate,
		});
	};

	const handleMouseMove = useCallback((e: MouseEvent) => {
		if (resizing) {
			const dx = e.clientX - resizing.startX;
			const daysDelta = Math.round((dx / WEEK_WIDTH) * 7);

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
			const dx = e.clientX - moving.startX;
			const dy = e.clientY - moving.startY;
			const daysDelta = Math.round((dx / WEEK_WIDTH) * 7);
			const rowDelta = Math.round(dy / ROW_HEIGHT);

			setPlacedProjects(prev => prev.map(p => {
				if (p.id !== moving.id) return p;
				const newStart = addDays(moving.originalStart, daysDelta);
				const newEnd = addDays(moving.originalEnd, daysDelta);
				const newRow = Math.max(0, moving.originalRow + rowDelta);
				return { ...p, startDate: newStart, endDate: newEnd, row: newRow };
			}));
		}
	}, [resizing, moving]);

	const handleMouseUp = useCallback(() => {
		setResizing(null);
		setMoving(null);
	}, []);

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

	// ── Move logic ─────────────────────────────────────────────────────────

	const handleMoveStart = (projectId: string) => (e: React.MouseEvent) => {
		// Don't start move if clicking on resize handle
		if ((e.target as HTMLElement).classList.contains('resize-handle')) return;
		e.preventDefault();
		const proj = placedProjects.find(p => p.id === projectId);
		if (!proj) return;
		setMoving({
			id: projectId,
			startX: e.clientX,
			startY: e.clientY,
			originalStart: proj.startDate,
			originalEnd: proj.endDate,
			originalRow: proj.row,
		});
	};

	// ── Remove project from calendar ───────────────────────────────────────

	const handleRemoveProject = (projectId: string) => (e: React.MouseEvent) => {
		e.stopPropagation();
		setPlacedProjects(prev => prev.filter(p => p.id !== projectId));
	};

	// ── Render colors ──────────────────────────────────────────────────────

	const projectColors = useMemo(() => {
		const colors = [
			'#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
			'#10b981', '#06b6d4', '#f97316', '#6366f1',
			'#14b8a6', '#e11d48', '#84cc16', '#a855f7',
		];
		const map: Record<string, string> = {};
		const allProjectIds = [...new Set(placedProjects.map(p => p.projectId))];
		allProjectIds.forEach((id, i) => {
			map[id] = colors[i % colors.length];
		});
		return map;
	}, [placedProjects]);

	// ── Render ─────────────────────────────────────────────────────────────

	return (
		<div className="calendar-page">
			<Header />
			<div className="calendar-container">
				{/* Controls bar */}
				<div className="calendar-controls">
					<div className="date-range-picker">
						<label>
							<span>Du</span>
							<input
								type="date"
								value={formatDate(dateRange.start)}
								onChange={handleStartChange}
							/>
						</label>
						<label>
							<span>Au</span>
							<input
								type="date"
								value={formatDate(dateRange.end)}
								onChange={handleEndChange}
							/>
						</label>
					</div>
					<div className="calendar-info">
						{placedProjects.length} projet{placedProjects.length !== 1 ? 's' : ''} planifié{placedProjects.length !== 1 ? 's' : ''}
					</div>
				</div>

				{/* Sidebar: available projects */}
				<div className="calendar-layout">
					<div className="calendar-sidebar">
						<h3 className="sidebar-title">Projets simulés</h3>
						{availableProjects.length === 0 && (
							<p className="sidebar-empty">
								Tous les projets simulés sont placés, ou aucun projet n'est simulé.
							</p>
						)}
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
					</div>

					{/* Calendar grid */}
					<div
						className="calendar-grid-wrapper"
						ref={gridRef}
						onDragOver={handleGridDragOver}
						onDrop={handleGridDrop}
					>
						<div className="calendar-grid" style={{ width: totalWidth, minHeight: rowCount * ROW_HEIGHT + HEADER_HEIGHT }}>
							{/* Month headers */}
							<div className="month-headers" style={{ height: 32 }}>
								{monthSpans.map((span, i) => (
									<div
										key={i}
										className="month-header"
										style={{
											left: span.startWeekIndex * WEEK_WIDTH,
											width: span.weekCount * WEEK_WIDTH,
										}}
									>
										{span.label}
									</div>
								))}
							</div>

							{/* Week headers */}
							<div className="week-headers" style={{ top: 32, height: 38 }}>
								{weeks.map((w, i) => {
									const endOfWeek = addDays(w, 6);
									return (
										<div
											key={i}
											className="week-header"
											style={{ left: i * WEEK_WIDTH, width: WEEK_WIDTH }}
										>
											<span className="week-day">{w.getDate()}</span>
											<span className="week-sep">-</span>
											<span className="week-day">{endOfWeek.getDate()}</span>
											<span className="week-month">{w.toLocaleDateString('fr-FR', { month: 'short' })}</span>
										</div>
									);
								})}
							</div>

							{/* Grid lines */}
							<div className="grid-body" style={{ top: HEADER_HEIGHT }}>
								{/* Week vertical lines */}
								{weeks.map((_, i) => (
									<div
										key={`vl-${i}`}
										className={`grid-vline ${i > 0 && monthSpans.some(s => s.startWeekIndex === i) ? 'month-border' : ''}`}
										style={{ left: i * WEEK_WIDTH }}
									/>
								))}

								{/* Row horizontal lines */}
								{Array.from({ length: rowCount }, (_, i) => (
									<div
										key={`hl-${i}`}
										className="grid-hline"
										style={{ top: i * ROW_HEIGHT }}
									/>
								))}

								{/* Placed projects */}
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
											style={{
												left: x,
												width: Math.max(w, 30),
												top: y + 4,
												height: ROW_HEIGHT - 8,
												backgroundColor: color,
											}}
											onMouseDown={handleMoveStart(proj.id)}
										>
											<div
												className="resize-handle resize-left"
												onMouseDown={handleResizeStart(proj.id, 'left')}
											/>
											<div className="placed-project-content">
												<span className="placed-project-name">{proj.name}</span>
												<span className="placed-project-duration">
													{durationWeeks <= 1 ? `${durationDays}j` : `${durationWeeks}sem`}
												</span>
											</div>
											<button
												className="placed-project-remove"
												onClick={handleRemoveProject(proj.id)}
												title="Retirer du calendrier"
											>
												x
											</button>
											<div
												className="resize-handle resize-right"
												onMouseDown={handleResizeStart(proj.id, 'right')}
											/>
										</div>
									);
								})}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default Calendar;
