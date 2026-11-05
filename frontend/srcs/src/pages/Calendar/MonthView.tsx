import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AlternanceLegend } from './alternanceParser';
import { PROJECT_DRAG_TYPE } from './Timeline';
import {
	ALTERNANCE_LABELS, addDays, classifyAlternanceColor, formatDateKey, formatLong, formatMonthYear, formatShort,
	getHolidayName, getProjectStatus, isSameDay, plural, projectOverlapsDay, startOfWeek,
	type PlacedProject,
} from './calendarModel';

/**
 * Vue Mois : sur grand écran les jours portent des pastilles nommées ; au
 * téléphone, des points (une pastille de 40 px n'a pas la place d'un nom).
 * Toucher un jour liste ses projets sous la grille.
 */

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MAX_CHIPS = 3;

interface MonthViewProps {
	/** Choix de la vue (Frise / Mois / Liste), affiché à droite du nom de la vue. */
	switcher: React.ReactNode;
	month: Date;
	onPrev: () => void;
	onNext: () => void;
	onToday: () => void;
	projects: PlacedProject[];
	toneOf: (projectId: string) => number;
	selectedDay: Date;
	onSelectDay: (day: Date) => void;
	onSelectProject: (id: string) => void;
	onDropProject?: (projectId: string, date: Date) => void;
	readOnly: boolean;
	alternanceDays: Record<string, string>;
	alternanceLegend: AlternanceLegend | null;
	today: Date;
}

const MonthView: React.FC<MonthViewProps> = ({
	switcher, month, onPrev, onNext, onToday, projects, toneOf, selectedDay, onSelectDay, onSelectProject, onDropProject,
	readOnly, alternanceDays, alternanceLegend, today,
}) => {
	const days = useMemo(() => {
		const first = startOfWeek(new Date(month.getFullYear(), month.getMonth(), 1));
		return Array.from({ length: 42 }, (_, i) => addDays(first, i));
	}, [month]);

	const dayProjects = useMemo(
		() => projects.filter(p => projectOverlapsDay(p, selectedDay))
			.sort((a, b) => a.endDate.getTime() - b.endDate.getTime()),
		[projects, selectedDay],
	);
	const selectedKind = classifyAlternanceColor(alternanceDays[formatDateKey(selectedDay)], alternanceLegend);
	const selectedHoliday = getHolidayName(selectedDay);

	const acceptsDrop = (e: React.DragEvent) => !readOnly && !!onDropProject && e.dataTransfer.types.includes(PROJECT_DRAG_TYPE);

	return (
		<div className="cal-month">
			<div className="cal-card cal-month-card">
				{/* Navigation collée à la grille qu'elle fait défiler. */}
				<div className="cal-month-head">
					<div className="cal-view-title">
						<h2>Mois</h2>
						{switcher}
					</div>
					<div className="cal-month-nav">
						<span className="cal-month-label" aria-live="polite">{formatMonthYear(month)}</span>
						<div className="cal-group" role="group" aria-label="Changer de mois">
							<button type="button" className="cal-group-btn" onClick={onPrev} aria-label="Mois précédent" title="Mois précédent">
								<ChevronLeft size={18} aria-hidden="true" />
							</button>
							<button type="button" className="cal-group-text" onClick={onToday}>Aujourd'hui</button>
							<button type="button" className="cal-group-btn" onClick={onNext} aria-label="Mois suivant" title="Mois suivant">
								<ChevronRight size={18} aria-hidden="true" />
							</button>
						</div>
					</div>
				</div>
				<div className="cal-month-names" aria-hidden="true">
					{DAY_NAMES.map(n => <span key={n}>{n}</span>)}
				</div>
				<div className="cal-month-grid">
					{days.map(day => {
						const key = formatDateKey(day);
						const inMonth = day.getMonth() === month.getMonth();
						const holiday = getHolidayName(day);
						const list = projects.filter(p => projectOverlapsDay(p, day));
						const altColor = alternanceDays[key];
						const isSel = isSameDay(day, selectedDay);
						const isToday = isSameDay(day, today);
						return (
							<div
								key={key}
								className={[
									'cal-month-day',
									inMonth ? '' : 'is-outside',
									holiday ? 'is-holiday' : '',
									isSel ? 'is-selected' : '',
									isToday ? 'is-today' : '',
								].filter(Boolean).join(' ')}
								onDragOver={e => { if (acceptsDrop(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
								onDrop={e => {
									if (!acceptsDrop(e)) return;
									e.preventDefault();
									const id = e.dataTransfer.getData(PROJECT_DRAG_TYPE);
									if (id) onDropProject?.(id, day);
								}}
							>
								<button
									type="button"
									className="cal-month-day-btn"
									onClick={() => onSelectDay(day)}
									aria-pressed={isSel}
									aria-label={`${formatLong(day)}${holiday ? `, férié (${holiday})` : ''}, ${plural(list.length, 'projet')}`}
								>
									<span className="cal-month-num">{day.getDate()}</span>
									<span className="cal-month-dots" aria-hidden="true">
										{list.slice(0, MAX_CHIPS).map(p => <span key={p.id} className={`cal-dot cal-tone-${toneOf(p.projectId)}`} />)}
									</span>
								</button>
								{altColor && <span className="cal-month-alt" style={{ background: altColor }} aria-hidden="true" />}
								<div className="cal-month-chips">
									{list.slice(0, MAX_CHIPS).map(p => (
										<button
											key={p.id}
											type="button"
											className={`cal-chip cal-tone-${toneOf(p.projectId)}`}
											onClick={() => onSelectProject(p.id)}
											title={`${p.name} · ${formatShort(p.startDate)} → ${formatShort(p.endDate)}`}
										>
											{p.name}
										</button>
									))}
									{list.length > MAX_CHIPS && (
										<button type="button" className="cal-chip-more" onClick={() => onSelectDay(day)}>
											+{list.length - MAX_CHIPS}
										</button>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			<section className="cal-card cal-day-panel" aria-live="polite" aria-label="Projets du jour sélectionné">
				<div className="cal-day-panel-head">
					<h2>{formatLong(selectedDay)}</h2>
					{selectedHoliday && <span className="cal-badge cal-badge--holiday">Férié · {selectedHoliday}</span>}
					{!selectedHoliday && selectedKind && <span className="cal-badge">{ALTERNANCE_LABELS[selectedKind]}</span>}
				</div>
				{dayProjects.length === 0 ? (
					<p className="cal-muted">Aucun projet ce jour-là.</p>
				) : (
					<ul className="cal-day-list">
						{dayProjects.map(p => {
							const s = getProjectStatus(p, today);
							return (
								<li key={p.id}>
									<button type="button" className="cal-row-btn" onClick={() => onSelectProject(p.id)}>
										<span className={`cal-dot cal-dot--lg cal-tone-${toneOf(p.projectId)}`} aria-hidden="true" />
										<span className="cal-row-main">
											<span className="cal-row-title">{p.name}</span>
											<span className="cal-row-sub">
												jusqu'au {formatShort(p.endDate)}
												{s.status === 'active' && ` · J-${s.daysLeft}`}
												{s.status === 'done' && ' · terminé'}
											</span>
										</span>
									</button>
								</li>
							);
						})}
					</ul>
				)}
			</section>
		</div>
	);
};

export default MonthView;
