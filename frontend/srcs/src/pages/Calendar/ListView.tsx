import React, { useMemo } from 'react';
import type { AlternanceLegend } from './alternanceParser';
import {
	ALTERNANCE_COLORS, ALTERNANCE_LABELS, addDays, classifyAlternanceColor, diffDays, formatDateKey, formatShort,
	formatXp, getHolidayName, getProjectStatus, isSameDay, plural, startOfWeek,
	type PlacedProject, type ProjectStatus,
} from './calendarModel';

/**
 * Vue Liste (par défaut au téléphone) : « où j'en suis » avant « quand ».
 * La semaine en cours sert de repère, puis les projets en cours (avec J-x et
 * avancement), à venir, puis terminés — repliés, ils comptent moins.
 */

const WEEKDAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

interface ListViewProps {
	projects: PlacedProject[];
	toneOf: (projectId: string) => number;
	selectedId: string | null;
	onSelect: (id: string) => void;
	alternanceDays: Record<string, string>;
	alternanceLegend: AlternanceLegend | null;
	today: Date;
	emptyMessage: React.ReactNode;
}

const SECTIONS: { status: ProjectStatus; title: string }[] = [
	{ status: 'active', title: 'En cours' },
	{ status: 'upcoming', title: 'À venir' },
	{ status: 'done', title: 'Terminés' },
];

const ListView: React.FC<ListViewProps> = ({
	projects, toneOf, selectedId, onSelect, alternanceDays, alternanceLegend, today, emptyMessage,
}) => {
	const week = useMemo(() => {
		const mon = startOfWeek(today);
		return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
	}, [today]);

	const groups = useMemo(() => {
		const withStatus = projects.map(p => ({ p, s: getProjectStatus(p, today) }));
		return SECTIONS.map(sec => ({
			...sec,
			items: withStatus
				.filter(x => x.s.status === sec.status)
				.sort((a, b) => sec.status === 'done'
					? b.p.endDate.getTime() - a.p.endDate.getTime()
					: sec.status === 'active'
						? a.p.endDate.getTime() - b.p.endDate.getTime()
						: a.p.startDate.getTime() - b.p.startDate.getTime()),
		}));
	}, [projects, today]);

	const legendKinds = useMemo(() => {
		const kinds = new Set(week.map(d => classifyAlternanceColor(alternanceDays[formatDateKey(d)], alternanceLegend)).filter(Boolean));
		return [...kinds] as (keyof typeof ALTERNANCE_LABELS)[];
	}, [week, alternanceDays, alternanceLegend]);

	return (
		<div className="cal-list">
			<section className="cal-card cal-week-strip" aria-label="Cette semaine">
				<div className="cal-week-strip-head">
					<h2>Cette semaine</h2>
					<span className="cal-muted">{formatShort(week[0])} – {formatShort(week[6])}</span>
				</div>
				<ol className="cal-week-days">
					{week.map((d, i) => {
						const color = alternanceDays[formatDateKey(d)];
						const kind = classifyAlternanceColor(color, alternanceLegend);
						const holiday = getHolidayName(d);
						return (
							<li key={i} className={[isSameDay(d, today) ? 'is-today' : '', i > 4 ? 'is-weekend' : '', holiday ? 'is-holiday' : ''].filter(Boolean).join(' ')}>
								<span className="cal-week-letter" aria-hidden="true">{WEEKDAY_LETTERS[i]}</span>
								<span className="cal-week-num" aria-label={`${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })}${kind ? `, ${ALTERNANCE_LABELS[kind]}` : ''}${holiday ? `, férié` : ''}`}>{d.getDate()}</span>
								<span className="cal-week-alt" style={{ background: color ?? 'transparent' }} aria-hidden="true" />
							</li>
						);
					})}
				</ol>
				{legendKinds.length > 0 && (
					<div className="cal-legend cal-legend--compact">
						{legendKinds.map(k => (
							<span key={k} className="cal-legend-item">
								<span className="cal-legend-line" style={{ background: ALTERNANCE_COLORS[k] }} />
								{ALTERNANCE_LABELS[k]}
							</span>
						))}
					</div>
				)}
			</section>

			{projects.length === 0 ? (
				<div className="cal-card cal-empty">{emptyMessage}</div>
			) : groups.map(g => g.items.length > 0 && (
				<section key={g.status} className="cal-list-section" aria-label={g.title}>
					{g.status === 'done' ? (
						<details>
							<summary className="cal-section-title">{g.title} ({g.items.length})</summary>
							<ul className="cal-list-items">
								{g.items.map(({ p }) => (
									<li key={p.id}>
										<button type="button" className={`cal-list-item is-done${p.id === selectedId ? ' is-selected' : ''}`} onClick={() => onSelect(p.id)}>
											<span className={`cal-dot cal-dot--lg cal-tone-${toneOf(p.projectId)}`} aria-hidden="true" />
											<span className="cal-row-main">
												<span className="cal-row-title">{p.name}</span>
												<span className="cal-row-sub">Terminé le {formatShort(p.endDate)} · {formatXp(p.xp)} XP</span>
											</span>
										</button>
									</li>
								))}
							</ul>
						</details>
					) : (
						<>
							<h2 className="cal-section-title">{g.title}</h2>
							<ul className="cal-list-items">
								{g.items.map(({ p, s }) => (
									<li key={p.id}>
										<button type="button" className={`cal-list-item${p.id === selectedId ? ' is-selected' : ''}`} onClick={() => onSelect(p.id)}>
											{g.status === 'upcoming' ? (
												<span className="cal-list-date" aria-hidden="true">
													<span>{p.startDate.getDate()}</span>
													<span>{p.startDate.toLocaleDateString('fr-FR', { month: 'short' })}</span>
												</span>
											) : (
												<span className={`cal-dot cal-dot--lg cal-tone-${toneOf(p.projectId)}`} aria-hidden="true" />
											)}
											<span className="cal-row-main">
												<span className="cal-row-title">
													{p.name}
													{g.status === 'active' && (
														<span className={`cal-badge${s.daysLeft <= 7 ? ' cal-badge--warn' : ''}`}>J-{s.daysLeft}</span>
													)}
												</span>
												<span className="cal-row-sub">
													{g.status === 'active'
														? `${formatShort(p.startDate)} → ${formatShort(p.endDate)} · ${formatXp(p.xp)} XP`
														: `dans ${plural(s.daysUntilStart, 'jour')} · ${plural(diffDays(p.startDate, p.endDate), 'jour')} · ${formatXp(p.xp)} XP`}
												</span>
												{g.status === 'active' && (
													<span className="cal-progress" role="progressbar" aria-valuenow={s.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Avancement de ${p.name}`}>
														<span className={`cal-progress-fill cal-tone-${toneOf(p.projectId)}`} style={{ width: `${s.progress}%` }} />
													</span>
												)}
											</span>
											{g.status === 'upcoming' && <span className={`cal-dot cal-dot--lg cal-tone-${toneOf(p.projectId)}`} aria-hidden="true" />}
										</button>
									</li>
								))}
							</ul>
						</>
					)}
				</section>
			))}
		</div>
	);
};

export default ListView;
