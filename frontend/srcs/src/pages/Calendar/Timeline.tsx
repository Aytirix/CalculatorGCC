import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AlternanceLegend } from './alternanceParser';
import {
	ALTERNANCE_LABELS, addDays, diffDays, formatShort, getAlternanceRuns,
	getHolidayMarks, getMonthSegments, moveProject, packLanes, plural, readableTextColor,
	resizeProject,
	type AlternanceRun, type HolidayMark, type MonthSegment, type PlacedProject, type TimelineGrid,
} from './calendarModel';

/**
 * La frise : semaines en colonnes, projets rangés automatiquement en lignes.
 *
 * Interactions (Pointer Events : souris, doigt et stylet par le même chemin) :
 * - clic / toucher bref sur une barre → sélection (la fiche s'ouvre) ;
 * - souris : glisser une barre la déplace, glisser un bord la redimensionne ;
 * - doigt / stylet : APPUI LONG (350 ms) pour soulever la barre, puis glisser ;
 *   commencé sur un bord, il redimensionne. Avant ce délai, un glissé reste un
 *   défilement de la frise (aucun projet déplacé par accident) ;
 * - clavier sur une barre : ←/→ déplace d'un jour, Maj+←/→ change la fin.
 * Une seule session de glisser à la fois ; elle s'arrête si la barre disparaît
 * (annulation, rechargement) ou si la grille change (zoom, période).
 * Pendant le glisser, seul un brouillon local bouge ; la modification n'est
 * enregistrée (et annulable) qu'au relâchement.
 */

export const ZOOM_LEVELS = [
	{ label: 'Mois', weekWidth: 60 },
	{ label: 'Semaine', weekWidth: 120 },
	{ label: 'Jour', weekWidth: 240 },
] as const;

const DRAG_THRESHOLD_PX = 4;
const LONG_PRESS_MS = 350;
const LONG_PRESS_SLOP_PX = 10;
const EDGE_ZONE_PX = 24;
const MIN_BAR_PX = 28;

/**
 * Défilement automatique quand le pointeur approche d'un bord pendant un
 * glisser. La zone (et donc la vitesse max) se réduit sur petit écran : sur un
 * téléphone, 72 px de chaque côté couvraient un tiers de la frise et la barre
 * filait de plusieurs semaines.
 */
const AUTO_SCROLL_MAX_ZONE_PX = 72;
const AUTO_SCROLL_MAX_SPEED = 1400; // px/s, au ras du bord, zone pleine

function getAutoScrollSpeed(distanceFromEdge: number, zone: number): number {
	if (distanceFromEdge >= zone) return 0;
	const t = 1 - Math.max(0, distanceFromEdge) / zone;
	return AUTO_SCROLL_MAX_SPEED * (zone / AUTO_SCROLL_MAX_ZONE_PX) * t * t;
}

export const PROJECT_DRAG_TYPE = 'application/x-calendar-project';

// ── Fond de grille (mémoïsé : ne bouge pas pendant un glisser) ─────────────

interface GridBackgroundProps {
	weekCount: number;
	weekWidth: number;
	totalDays: number;
	months: MonthSegment[];
	holidays: HolidayMark[];
	runs: AlternanceRun[];
	showDayLines: boolean;
}

const GridBackground = memo(function GridBackground({ weekCount, weekWidth, totalDays, months, holidays, runs, showDayLines }: GridBackgroundProps) {
	const dayWidth = weekWidth / 7;
	return (
		<div className="cal-tl-bg" aria-hidden="true">
			{/* Rythme d'alternance prolongé sous les barres, en version douce : on voit
			    d'un coup d'œil si un projet tombe sur des jours d'école ou d'entreprise. */}
			{runs.map(r => (
				<div
					key={`alt-${r.startDay}`}
					className="cal-tl-alt"
					style={{ left: r.startDay * dayWidth, width: r.days * dayWidth, background: `color-mix(in srgb, ${r.color} var(--cal-alt-strength), transparent)` }}
				/>
			))}
			{Array.from({ length: weekCount }, (_, w) => (
				<div key={`we-${w}`} className="cal-tl-weekend" style={{ left: w * weekWidth + 5 * dayWidth, width: 2 * dayWidth }} />
			))}
			{showDayLines && Array.from({ length: totalDays }, (_, i) => (
				i % 7 === 0 ? null : <div key={`dl-${i}`} className="cal-tl-dayline" style={{ left: i * dayWidth }} />
			))}
			{Array.from({ length: weekCount }, (_, w) => (
				<div key={`wl-${w}`} className="cal-tl-weekline" style={{ left: w * weekWidth }} />
			))}
			{months.filter(m => m.startDay > 0).map(m => (
				<div key={`ml-${m.startDay}`} className="cal-tl-monthline" style={{ left: m.startDay * dayWidth }} />
			))}
			{holidays.map(h => (
				<div key={`h-${h.day}`} className="cal-tl-holiday" style={{ left: h.day * dayWidth, width: dayWidth }} />
			))}
		</div>
	);
});

// ── Frise ──────────────────────────────────────────────────────────────────

interface Draft {
	id: string;
	startDate: Date;
	endDate: Date;
}

interface DragSession {
	id: string;
	mode: 'move' | 'start' | 'end';
	pointerId: number;
	startX: number;
	orig: PlacedProject;
	moved: boolean;
	lastClientX: number;
	startClientX: number;
	/** Le pointeur a réellement bougé : avant, pas de défilement automatique (appui long près d'un bord). */
	travelled: boolean;
	/** Glisser au doigt : on ne sélectionne pas à la fin (la fiche du bas couvrirait la frise). */
	touch: boolean;
}

export interface TimelineProps {
	grid: TimelineGrid;
	weekWidth: number;
	projects: PlacedProject[];
	toneOf: (projectId: string) => number;
	selectedId: string | null;
	onSelect: (id: string) => void;
	onCommit: (id: string, next: { startDate: Date; endDate: Date }) => void;
	onDropProject?: (projectId: string, date: Date) => void;
	readOnly: boolean;
	alternanceDays: Record<string, string>;
	alternanceLegend: AlternanceLegend | null;
	today: Date;
	viewportRef: React.RefObject<HTMLDivElement | null>;
	/** Sélectionner la barre après un glisser à la souris (oui seulement quand la fiche est une colonne, pas un panneau qui couvrirait la frise). */
	selectAfterDrag: boolean;
	/** Prévenu au début / à la fin d'un glisser (Ctrl+Z est ignoré pendant un glisser). */
	onDraggingChange?: (dragging: boolean) => void;
}

const Timeline: React.FC<TimelineProps> = ({
	grid, weekWidth, projects, toneOf, selectedId, onSelect, onCommit, onDropProject,
	readOnly, alternanceDays, alternanceLegend, today, viewportRef, selectAfterDrag, onDraggingChange,
}) => {
	const { gridStart, weekCount, totalDays } = grid;
	const dayWidth = weekWidth / 7;
	const totalWidth = weekCount * weekWidth;

	const trackRef = useRef<HTMLDivElement>(null);
	const labelRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<DragSession | null>(null);
	const suppressClickRef = useRef(false);
	const rafRef = useRef<number | null>(null);
	const longPressRef = useRef<{ pointerId: number; startClientX: number; startClientY: number; timer: ReturnType<typeof setTimeout> } | null>(null);
	const sessionCleanupRef = useRef<(() => void) | null>(null);
	const onDraggingChangeRef = useRef(onDraggingChange);
	onDraggingChangeRef.current = onDraggingChange;
	const [draft, setDraft] = useState<Draft | null>(null);
	const [dropActive, setDropActive] = useState(false);

	const months = useMemo(() => getMonthSegments(gridStart, totalDays), [gridStart, totalDays]);
	const holidays = useMemo(() => getHolidayMarks(gridStart, totalDays), [gridStart, totalDays]);
	const runs = useMemo(
		() => getAlternanceRuns(alternanceDays, alternanceLegend, gridStart, totalDays),
		[alternanceDays, alternanceLegend, gridStart, totalDays],
	);

	// Les lignes suivent le brouillon : on voit le rangement final pendant le glisser.
	const displayed = useMemo(() => projects.map(p =>
		draft && draft.id === p.id ? { ...p, startDate: draft.startDate, endDate: draft.endDate } : p,
	), [projects, draft]);
	const { lanes, laneCount } = useMemo(() => packLanes(displayed), [displayed]);

	const todayDay = diffDays(gridStart, today);
	const todayVisible = todayDay >= 0 && todayDay < totalDays;

	// ── Glisser ────────────────────────────────────────────────────────────

	const trackX = useCallback((clientX: number) => {
		const track = trackRef.current;
		return track ? clientX - track.getBoundingClientRect().left : 0;
	}, []);

	const computeNext = useCallback((drag: DragSession, clientX: number): PlacedProject => {
		const days = Math.round((trackX(clientX) - drag.startX) / dayWidth);
		if (drag.mode === 'move') return moveProject(drag.orig, days);
		return resizeProject(drag.orig, drag.mode, days);
	}, [trackX, dayWidth]);

	const updateDraft = useCallback((clientX: number) => {
		const drag = dragRef.current;
		if (!drag) return;
		const next = computeNext(drag, clientX);
		setDraft(prev => (
			prev && prev.id === next.id
				&& prev.startDate.getTime() === next.startDate.getTime()
				&& prev.endDate.getTime() === next.endDate.getTime()
		) ? prev : { id: next.id, startDate: next.startDate, endDate: next.endDate });
	}, [computeNext]);

	const stopAutoScroll = useCallback(() => {
		if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
		rafRef.current = null;
	}, []);

	const startAutoScroll = useCallback(() => {
		stopAutoScroll();
		let last: number | null = null;
		const loop = (ts: number) => {
			const drag = dragRef.current;
			const viewport = viewportRef.current;
			if (!drag || !viewport) { rafRef.current = null; return; }
			const dt = last === null ? 16 : Math.min(100, ts - last);
			last = ts;
			const rect = viewport.getBoundingClientRect();
			const leftEdge = rect.left + (labelRef.current?.offsetWidth ?? 0);
			const zone = Math.min(AUTO_SCROLL_MAX_ZONE_PX, (rect.right - leftEdge) * 0.12);
			const left = drag.travelled ? getAutoScrollSpeed(drag.lastClientX - leftEdge, zone) : 0;
			const right = drag.travelled ? getAutoScrollSpeed(rect.right - drag.lastClientX, zone) : 0;
			const speed = right > left ? right : -left;
			if (speed !== 0) {
				viewport.scrollLeft += speed * (dt / 1000);
				updateDraft(drag.lastClientX);
			}
			rafRef.current = requestAnimationFrame(loop);
		};
		rafRef.current = requestAnimationFrame(loop);
	}, [stopAutoScroll, updateDraft, viewportRef]);

	useEffect(() => stopAutoScroll, [stopAutoScroll]);

	const endDrag = useCallback((commit: boolean) => {
		const drag = dragRef.current;
		dragRef.current = null;
		sessionCleanupRef.current?.();
		sessionCleanupRef.current = null;
		stopAutoScroll();
		if (drag) onDraggingChangeRef.current?.(false);
		if (drag?.moved) {
			// Le clic qui suit le relâchement ne doit pas compter comme une sélection.
			// Remis à zéro au tour suivant au cas où le navigateur n'émet pas ce clic.
			suppressClickRef.current = true;
			setTimeout(() => { suppressClickRef.current = false; }, 0);
			if (commit) {
				const next = computeNext(drag, drag.lastClientX);
				if (next.startDate.getTime() !== drag.orig.startDate.getTime()
					|| next.endDate.getTime() !== drag.orig.endDate.getTime()) {
					onCommit(drag.id, { startDate: next.startDate, endDate: next.endDate });
				}
				// À la souris, la barre qu'on vient de bouger devient la sélection : sa fiche
				// (colonne de droite) montre les nouvelles dates.
				if (!drag.touch && selectAfterDrag) onSelect(drag.id);
			}
		}
		setDraft(null);
	}, [computeNext, onCommit, onSelect, selectAfterDrag, stopAutoScroll]);

	/**
	 * Écouteurs posés sur `window` pendant toute la session. Ceux de la barre ne
	 * suffisent pas : si elle disparaît en plein glisser (Ctrl+Z, rechargement),
	 * le relâchement n'arrive plus jamais jusqu'à elle et la session restait
	 * ouverte — défilement automatique sans fin, défilement au doigt bloqué.
	 */
	const beginSession = useCallback(() => {
		sessionCleanupRef.current?.();
		const onUp = (ev: PointerEvent) => { if (dragRef.current?.pointerId === ev.pointerId) endDrag(true); };
		const onCancel = (ev: PointerEvent) => { if (dragRef.current?.pointerId === ev.pointerId) endDrag(false); };
		// Souris relâchée hors de la page : le bouton n'est plus enfoncé au mouvement suivant.
		const onMove = (ev: PointerEvent) => {
			if (ev.pointerType === 'mouse' && ev.buttons === 0 && dragRef.current?.pointerId === ev.pointerId) endDrag(true);
		};
		window.addEventListener('pointerup', onUp, true);
		window.addEventListener('pointercancel', onCancel, true);
		window.addEventListener('pointermove', onMove, true);
		sessionCleanupRef.current = () => {
			window.removeEventListener('pointerup', onUp, true);
			window.removeEventListener('pointercancel', onCancel, true);
			window.removeEventListener('pointermove', onMove, true);
		};
	}, [endDrag]);
	// Démontage en plein glisser (changement de vue) : on prévient le parent, sinon
	// il croirait le glisser toujours en cours et ignorerait Ctrl+Z.
	useEffect(() => () => {
		sessionCleanupRef.current?.();
		if (dragRef.current) onDraggingChangeRef.current?.(false);
	}, []);

	// La barre glissée a disparu, ou la grille a changé (zoom, période) : on arrête
	// sans enregistrer — les coordonnées de départ ne veulent plus rien dire.
	useEffect(() => {
		const drag = dragRef.current;
		if (drag && !projects.some(p => p.id === drag.id)) endDrag(false);
	}, [projects, endDrag]);
	useEffect(() => {
		if (dragRef.current) endDrag(false);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [dayWidth, gridStart.getTime()]);

	// Au doigt : appui long = « soulever » la barre. Avant ce délai, un glissé
	// reste un défilement de la frise, et un toucher bref ouvre la fiche.
	const cancelLongPress = useCallback(() => {
		const lp = longPressRef.current;
		if (lp) clearTimeout(lp.timer);
		longPressRef.current = null;
	}, []);
	useEffect(() => cancelLongPress, [cancelLongPress]);

	const handlePointerDown = (p: PlacedProject) => (e: React.PointerEvent<HTMLButtonElement>) => {
		if (readOnly || e.button !== 0) return;
		// Un seul glisser à la fois : un 2ᵉ doigt ne « vole » pas la barre déjà soulevée.
		if (!e.isPrimary || dragRef.current || longPressRef.current) return;

		if (e.pointerType === 'mouse') {
			const edge = (e.target as HTMLElement).closest('[data-edge]')?.getAttribute('data-edge');
			dragRef.current = {
				id: p.id,
				mode: edge === 'start' || edge === 'end' ? edge : 'move',
				pointerId: e.pointerId,
				startX: trackX(e.clientX),
				orig: p,
				moved: false,
				lastClientX: e.clientX,
				touch: false,
				startClientX: e.clientX,
				travelled: false,
			};
			try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
			beginSession();
			return;
		}

		// Doigt / stylet : le bord touché décide (zone de 24 px, au plus un quart de la barre).
		const rect = e.currentTarget.getBoundingClientRect();
		const zone = Math.min(EDGE_ZONE_PX, rect.width / 4);
		const mode: DragSession['mode'] = e.clientX - rect.left < zone ? 'start'
			: rect.right - e.clientX < zone ? 'end' : 'move';
		const target = e.currentTarget;
		const pointerId = e.pointerId;
		const startClientX = e.clientX;
		cancelLongPress();
		longPressRef.current = {
			pointerId,
			startClientX,
			startClientY: e.clientY,
			timer: setTimeout(() => {
				longPressRef.current = null;
				dragRef.current = {
					id: p.id, mode, pointerId, startX: trackX(startClientX), orig: p,
					moved: true, lastClientX: startClientX, touch: true, startClientX, travelled: false,
				};
				try { target.setPointerCapture(pointerId); } catch { /* relâché entre-temps */ }
				beginSession();
				onDraggingChangeRef.current?.(true);
				setDraft({ id: p.id, startDate: p.startDate, endDate: p.endDate });
				try { navigator.vibrate?.(12); } catch { /* non supporté */ }
				startAutoScroll();
			}, LONG_PRESS_MS),
		};
	};

	const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
		const lp = longPressRef.current;
		if (lp && lp.pointerId === e.pointerId) {
			// Le doigt bouge avant la fin de l'appui long : c'est un défilement.
			if (Math.hypot(e.clientX - lp.startClientX, e.clientY - lp.startClientY) > LONG_PRESS_SLOP_PX) cancelLongPress();
			return;
		}
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== e.pointerId) return;
		drag.lastClientX = e.clientX;
		if (!drag.travelled && Math.abs(e.clientX - drag.startClientX) >= DRAG_THRESHOLD_PX) drag.travelled = true;
		if (!drag.moved) {
			if (Math.abs(trackX(e.clientX) - drag.startX) < DRAG_THRESHOLD_PX) return;
			drag.moved = true;
			onDraggingChangeRef.current?.(true);
			startAutoScroll();
		}
		updateDraft(e.clientX);
	};

	const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
		if (longPressRef.current?.pointerId === e.pointerId) cancelLongPress();
		if (dragRef.current?.pointerId !== e.pointerId) return;
		endDrag(true);
	};

	const handlePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
		if (longPressRef.current?.pointerId === e.pointerId) cancelLongPress();
		if (dragRef.current?.pointerId !== e.pointerId) return;
		endDrag(false);
	};

	// Une fois la barre soulevée, le doigt ne doit plus faire défiler la page :
	// seul un écouteur `touchmove` NON passif peut l'empêcher (React les rend passifs).
	useEffect(() => {
		const track = trackRef.current;
		if (!track) return;
		const onTouchMove = (ev: TouchEvent) => { if (dragRef.current) ev.preventDefault(); };
		track.addEventListener('touchmove', onTouchMove, { passive: false });
		return () => track.removeEventListener('touchmove', onTouchMove);
	}, []);

	const handleClick = (id: string) => () => {
		if (suppressClickRef.current) {
			suppressClickRef.current = false;
			return;
		}
		onSelect(id);
	};

	const handleKeyDown = (p: PlacedProject) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
		if (readOnly || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
		// Alt/Cmd/Ctrl+flèche appartiennent au navigateur (Précédent…) : on ne les vole pas.
		if (e.altKey || e.metaKey || e.ctrlKey) return;
		e.preventDefault();
		const step = e.key === 'ArrowLeft' ? -1 : 1;
		const next = e.shiftKey ? resizeProject(p, 'end', step) : moveProject(p, step);
		// Au minimum d'un jour, rien ne change : pas d'entrée d'historique vide.
		if (next.startDate.getTime() === p.startDate.getTime() && next.endDate.getTime() === p.endDate.getTime()) return;
		onCommit(p.id, { startDate: next.startDate, endDate: next.endDate });
		const btn = e.currentTarget;
		requestAnimationFrame(() => btn.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
	};

	// ── Dépôt depuis la liste « À placer » ─────────────────────────────────

	const acceptsDrop = (e: React.DragEvent) => !readOnly && !!onDropProject && e.dataTransfer.types.includes(PROJECT_DRAG_TYPE);

	const handleDragOver = (e: React.DragEvent) => {
		if (!acceptsDrop(e)) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = 'copy';
		if (!dropActive) setDropActive(true);
	};

	const handleDrop = (e: React.DragEvent) => {
		setDropActive(false);
		if (!acceptsDrop(e)) return;
		e.preventDefault();
		const projectId = e.dataTransfer.getData(PROJECT_DRAG_TYPE);
		if (!projectId) return;
		const day = Math.min(totalDays - 1, Math.max(0, Math.floor(trackX(e.clientX) / dayWidth)));
		onDropProject?.(projectId, addDays(gridStart, day));
	};

	// ── Rendu ──────────────────────────────────────────────────────────────

	const trackStyle = { width: totalWidth } as React.CSSProperties;

	return (
		<div className="cal-tl-viewport" ref={viewportRef}>
			<div className="cal-tl" style={{ width: `calc(var(--cal-label-w) + ${totalWidth}px)` }}>

				<div className="cal-tl-row cal-tl-row--months">
					<div className="cal-tl-label" ref={labelRef} />
					<div className="cal-tl-track" style={trackStyle}>
						{months.map(m => {
							const width = m.days * dayWidth;
							return (
								<div key={m.startDay} className="cal-tl-month" style={{ left: m.startDay * dayWidth, width }} title={m.label}>
									{width >= 72 ? m.label : ''}
								</div>
							);
						})}
					</div>
				</div>

				<div className="cal-tl-row cal-tl-row--weeks">
					<div className="cal-tl-label cal-tl-label--weeks"><span>Semaine</span></div>
					<div className="cal-tl-track" style={trackStyle}>
						{months.filter(m => m.startDay > 0).map(m => (
							<div key={`mlx-${m.startDay}`} className="cal-tl-monthline cal-tl-monthline--row" style={{ left: m.startDay * dayWidth }} aria-hidden="true" />
						))}
						{Array.from({ length: weekCount }, (_, w) => (
							<div key={`wwe-${w}`} className="cal-tl-week-weekend" style={{ left: w * weekWidth + 5 * dayWidth, width: 2 * dayWidth }} aria-hidden="true" />
						))}
						{Array.from({ length: weekCount }, (_, w) => {
							const mon = addDays(gridStart, w * 7);
							const current = todayDay >= w * 7 && todayDay < (w + 1) * 7;
							return (
								<div key={w} className={`cal-tl-week${current ? ' is-current' : ''}`} style={{ left: w * weekWidth, width: weekWidth }}>
									<span>{weekWidth >= 100 ? `${mon.getDate()} – ${addDays(mon, 6).getDate()}` : mon.getDate()}</span>
								</div>
							);
						})}
					</div>
				</div>

				{runs.length > 0 && (
					<div className="cal-tl-row cal-tl-row--rhythm">
						<div className="cal-tl-label"><span>Rythme</span></div>
						<div className="cal-tl-track" style={trackStyle}>
							{months.filter(m => m.startDay > 0).map(m => (
								<div key={`mlx-${m.startDay}`} className="cal-tl-monthline cal-tl-monthline--row" style={{ left: m.startDay * dayWidth }} aria-hidden="true" />
							))}
							{runs.map(r => {
								const width = r.days * dayWidth;
								const label = r.kind ? ALTERNANCE_LABELS[r.kind] : '';
								return (
									<div
										key={r.startDay}
										className="cal-tl-run"
										style={{ left: r.startDay * dayWidth, width, background: r.color, color: readableTextColor(r.color) }}
										title={label ? `${label} · ${plural(r.days, 'jour')}` : plural(r.days, 'jour')}
									>
										{width >= 56 ? label : ''}
									</div>
								);
							})}
							{holidays.map(h => (
								<div key={h.day} className="cal-tl-holiday-mark" style={{ left: h.day * dayWidth, width: dayWidth }} title={`Férié · ${h.name}`} />
							))}
						</div>
					</div>
				)}

				<div className="cal-tl-row cal-tl-row--projects">
					<div className="cal-tl-label cal-tl-label--projects"><span>Projets</span></div>
					<div
						ref={trackRef}
						className={`cal-tl-track cal-tl-projects${dropActive ? ' is-drop-target' : ''}`}
						style={{ ...trackStyle, '--lanes': laneCount } as React.CSSProperties}
						onDragOver={handleDragOver}
						onDragLeave={() => setDropActive(false)}
						onDrop={handleDrop}
					>
						<GridBackground
							weekCount={weekCount}
							weekWidth={weekWidth}
							totalDays={totalDays}
							months={months}
							holidays={holidays}
							runs={runs}
							showDayLines={weekWidth >= 200}
						/>

						{todayVisible && (
							<>
								<div className="cal-tl-today" style={{ left: (todayDay + 0.5) * dayWidth }} aria-hidden="true" />
								<div className="cal-tl-today-pill" style={{ left: (todayDay + 0.5) * dayWidth }}>
									Auj. {formatShort(today)}
								</div>
							</>
						)}

						{displayed.map(p => {
							const left = diffDays(gridStart, p.startDate) * dayWidth;
							const width = Math.max(MIN_BAR_PX, diffDays(p.startDate, p.endDate) * dayWidth);
							const selected = p.id === selectedId;
							const dragging = draft?.id === p.id;
							const done = diffDays(today, p.endDate) <= 0;
							const dur = diffDays(p.startDate, p.endDate);
							const dates = `${formatShort(p.startDate)} → ${formatShort(p.endDate)}`;
							return (
								<button
									key={p.id}
									type="button"
									className={[
										'cal-bar', `cal-tone-${toneOf(p.projectId)}`,
										selected ? 'is-selected' : '', dragging ? 'is-dragging' : '',
										done ? 'is-done' : '', readOnly ? 'is-readonly' : '',
									].filter(Boolean).join(' ')}
									style={{ left, width, '--lane': lanes.get(p.id) ?? 0 } as React.CSSProperties}
									aria-current={selected ? 'true' : undefined}
									aria-label={`${p.name}, du ${formatShort(p.startDate)} au ${formatShort(p.endDate)}, ${plural(dur, 'jour')}${done ? ', terminé' : ''}`}
									title={`${p.name}\n${dates} · ${plural(dur, 'jour')}`}
									onPointerDown={handlePointerDown(p)}
									onContextMenu={readOnly ? undefined : e => e.preventDefault()}
									onPointerMove={handlePointerMove}
									onPointerUp={handlePointerUp}
									onPointerCancel={handlePointerCancel}
									onLostPointerCapture={handlePointerCancel}
									onClick={handleClick(p.id)}
									onKeyDown={handleKeyDown(p)}
								>
									<span className="cal-bar-name">{p.name}</span>
									{width >= 120 && (
										<span className="cal-bar-meta">{done ? 'Terminé' : `${dates} · ${dur} j`}</span>
									)}
									{dragging && <span className="cal-bar-drag-dates" aria-hidden="true">{dates}</span>}
									{!readOnly && (
										<>
											<span className="cal-bar-handle cal-bar-handle--start" data-edge="start" aria-hidden="true" />
											<span className="cal-bar-handle cal-bar-handle--end" data-edge="end" aria-hidden="true" />
										</>
									)}
								</button>
							);
						})}
					</div>
				</div>

			</div>
		</div>
	);
};

export default Timeline;
