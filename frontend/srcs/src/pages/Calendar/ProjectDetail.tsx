import React, { useEffect, useId, useRef, useState } from 'react';
import { Minus, Plus, Trash2, X, MousePointerClick } from 'lucide-react';
import type { AlternanceLegend } from './alternanceParser';
import {
	addDays, countSchoolDays, diffDays, formatDateKey, formatShort, formatXp,
	getProjectStatus, isValidDate, MAX_YEAR, MIN_YEAR, parseDateKey, plural, resizeProject, setProjectDuration,
	type PlacedProject,
} from './calendarModel';

/**
 * Fiche d'un projet : remplace l'ancienne infobulle (inaccessible au doigt) et
 * le petit « × » posé sur la barre (qui supprimait par accident).
 * - `panel` : colonne de droite sur grand écran ;
 * - `sheet` : panneau qui monte du bas (tablette, téléphone).
 */

const DURATION_PRESETS = [7, 14, 21, 28];

/**
 * Champ date qui n'enregistre qu'une date COMPLÈTE et plausible. Avant, chaque
 * frappe était enregistrée : taper l'année « 2027 » passait par « 0002 », ce
 * qui ramenait la fin au lendemain du début (ou datait le projet de l'an 2).
 * La saisie en cours reste locale ; on n'enregistre que si l'année est entre
 * MIN_YEAR et MAX_YEAR, et la saisie est abandonnée en quittant le champ.
 */
const DateField: React.FC<{
	id: string;
	value: Date;
	min?: string;
	max?: string;
	onCommit: (date: Date) => void;
}> = ({ id, value, min, max, onCommit }) => {
	const [draft, setDraft] = useState<string | null>(null);
	const current = formatDateKey(value);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const next = e.target.value;
		setDraft(next);
		const d = parseDateKey(next);
		if (isValidDate(d) && d.getFullYear() >= MIN_YEAR && d.getFullYear() <= MAX_YEAR && next !== current) {
			onCommit(d);
		}
	};

	return (
		<input
			id={id}
			type="date"
			className="cal-date-input"
			value={draft ?? current}
			onChange={handleChange}
			onBlur={() => setDraft(null)}
			min={min}
			max={max}
		/>
	);
};

interface ProjectDetailProps {
	project: PlacedProject | null;
	tone: number;
	today: Date;
	alternanceDays: Record<string, string>;
	alternanceLegend: AlternanceLegend | null;
	readOnly: boolean;
	mode: 'panel' | 'sheet';
	onChange: (next: PlacedProject) => void;
	onRemove: () => void;
	onClose: () => void;
}

const ProjectDetail: React.FC<ProjectDetailProps> = ({
	project, tone, today, alternanceDays, alternanceLegend, readOnly, mode,
	onChange, onRemove, onClose,
}) => {
	const titleId = useId();
	const titleRef = useRef<HTMLHeadingElement>(null);

	// Panneau du bas : à la fermeture, le focus revient à ce qui l'a ouvert (la
	// barre, la ligne de liste) au lieu de tomber sur <body> ; et la page derrière
	// ne défile plus pendant qu'il est ouvert. Déclaré AVANT l'effet qui pose le
	// focus sur le titre, pour mémoriser l'élément d'origine.
	useEffect(() => {
		if (mode !== 'sheet') return;
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const html = document.documentElement;
		const prevOverflow = html.style.overflow;
		const prevGutter = html.style.scrollbarGutter;
		html.style.scrollbarGutter = 'stable'; // sinon la barre de défilement disparaît et la page se décale
		html.style.overflow = 'hidden';
		return () => {
			html.style.overflow = prevOverflow;
			html.style.scrollbarGutter = prevGutter;
			// L'ouvreur a pu disparaître (« + » d'un projet placé, barre retirée) :
			// on se rabat sur le titre de la page plutôt que de perdre le focus.
			const target = opener?.isConnected ? opener : document.querySelector<HTMLElement>('.cal-head h1');
			target?.focus({ preventScroll: true });
		};
	}, [mode]);

	// En panneau du bas, le focus va au titre : le lecteur d'écran annonce la fiche.
	useEffect(() => {
		if (mode === 'sheet' && project) titleRef.current?.focus();
	}, [mode, project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

	if (!project) {
		if (mode === 'sheet') return null;
		return (
			<aside className="cal-card cal-detail cal-detail--empty" aria-label="Fiche du projet">
				<MousePointerClick aria-hidden="true" size={28} />
				<p>Sélectionne un projet pour voir ses infos{readOnly ? '' : ' et ajuster ses dates'}.</p>
			</aside>
		);
	}

	const s = getProjectStatus(project, today);
	const duration = diffDays(project.startDate, project.endDate);
	const schoolDays = countSchoolDays(
		alternanceDays, alternanceLegend,
		project.startDate > today ? project.startDate : today, project.endDate,
	);

	const statusLabel = s.status === 'done'
		? 'Terminé'
		: s.status === 'active' ? `En cours · J-${s.daysLeft}` : `Dans ${plural(s.daysUntilStart, 'jour')}`;

	const shiftStart = (days: number) => onChange(resizeProject(project, 'start', days));
	const shiftEnd = (days: number) => onChange(resizeProject(project, 'end', days));

	const commitDate = (edge: 'start' | 'end') => (d: Date) => {
		const current = edge === 'start' ? project.startDate : project.endDate;
		const delta = diffDays(current, d);
		if (delta !== 0) onChange(resizeProject(project, edge, delta));
	};

	const content = (
		<>
			<div className="cal-detail-head">
				<span className={`cal-dot cal-dot--lg cal-tone-${tone}`} aria-hidden="true" />
				<div className="cal-detail-title">
					<h2 id={titleId} ref={titleRef} tabIndex={-1}>{project.name}</h2>
					<span className={`cal-badge cal-badge--${s.status}`}>{statusLabel}</span>
				</div>
				<button type="button" className="cal-icon-btn cal-icon-btn--ghost" onClick={onClose} aria-label="Fermer la fiche">
					<X size={18} aria-hidden="true" />
				</button>
			</div>

			{readOnly ? (
				<dl className="cal-detail-facts">
					<dt>Début</dt><dd>{formatShort(project.startDate)} {project.startDate.getFullYear()}</dd>
					<dt>Fin</dt><dd>{formatShort(project.endDate)} {project.endDate.getFullYear()}</dd>
					<dt>Durée</dt><dd>{plural(duration, 'jour')}</dd>
				</dl>
			) : (
				<>
					<fieldset className="cal-detail-dates">
						<legend className="cal-overline">Dates</legend>
						{(['start', 'end'] as const).map(edge => {
							const date = edge === 'start' ? project.startDate : project.endDate;
							const label = edge === 'start' ? 'Début' : 'Fin';
							const shift = edge === 'start' ? shiftStart : shiftEnd;
							return (
								<div key={edge} className="cal-stepper">
									<label className="cal-stepper-label" htmlFor={`${titleId}-${edge}`}>{label}</label>
									<button type="button" className="cal-icon-btn" onClick={() => shift(-1)} aria-label={`${label} : un jour plus tôt`}>
										<Minus size={16} aria-hidden="true" />
									</button>
									<DateField
										id={`${titleId}-${edge}`}
										value={date}
										onCommit={commitDate(edge)}
										min={edge === 'end' ? formatDateKey(addDays(project.startDate, 1)) : undefined}
										max={edge === 'start' ? formatDateKey(addDays(project.endDate, -1)) : undefined}
									/>
									<button type="button" className="cal-icon-btn" onClick={() => shift(1)} aria-label={`${label} : un jour plus tard`}>
										<Plus size={16} aria-hidden="true" />
									</button>
								</div>
							);
						})}
					</fieldset>

					<div className="cal-detail-duration">
						<div className="cal-detail-duration-head">
							<span className="cal-overline" id={`${titleId}-dur`}>Durée</span>
							<span className="cal-strong">{plural(duration, 'jour')}</span>
						</div>
						<div className="cal-presets" role="group" aria-labelledby={`${titleId}-dur`}>
							{DURATION_PRESETS.map(n => (
								<button
									key={n}
									type="button"
									className={`cal-preset${duration === n ? ' is-active' : ''}`}
									aria-pressed={duration === n}
									onClick={() => onChange(setProjectDuration(project, n))}
								>
									{n / 7} sem.
								</button>
							))}
						</div>
					</div>
				</>
			)}

			<dl className="cal-detail-facts">
				<dt>Reste</dt>
				<dd>{s.status === 'done' ? 'Terminé' : plural(s.daysLeft, 'jour')}</dd>
				{schoolDays !== null && (
					<>
						<dt>Jours d'école d'ici la fin</dt>
						<dd>{s.status === 'done' ? '—' : schoolDays}</dd>
					</>
				)}
				<dt>XP</dt>
				<dd>{formatXp(project.xp)}</dd>
			</dl>

			{!readOnly && (
				<button type="button" className="cal-btn cal-btn--danger" onClick={onRemove}>
					<Trash2 size={16} aria-hidden="true" />
					Retirer du calendrier
				</button>
			)}
		</>
	);

	if (mode === 'panel') {
		return (
			<aside className="cal-card cal-detail" aria-labelledby={titleId}>
				{content}
			</aside>
		);
	}

	return (
		<>
			<button type="button" className="cal-sheet-backdrop" aria-label="Fermer la fiche" onClick={onClose} tabIndex={-1} />
			<div className="cal-sheet cal-detail" role="dialog" aria-modal="true" aria-labelledby={titleId}>
				<span className="cal-sheet-grabber" aria-hidden="true" />
				{content}
			</div>
		</>
	);
};

export default ProjectDetail;
