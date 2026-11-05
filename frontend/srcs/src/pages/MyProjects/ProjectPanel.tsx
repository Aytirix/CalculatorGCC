import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, Info, Minus, Plus, Users, X } from 'lucide-react';
import { DEFAULT_PROJECT_MAX_PERCENTAGE } from '@/utils/projectPercentage';
import { simulatedGain } from '@/utils/simulationEdit';
import { formatShort } from '@/pages/Calendar/calendarModel';
import { simulationBlocker, SOURCE_LABELS, STATUS_LABELS, type MyProjectRow } from './myProjects.types';

/**
 * Fiche d'un projet : ce qu'en dit 42, et sa simulation (note visée, bonus,
 * note perso, place au calendrier). Sur grand écran à droite de la liste ; sur
 * tablette et téléphone dans un panneau qui monte du bas (`ProjectSheet`).
 */

const MIN_PERCENTAGE = 50;
const PRESETS = [100, 110, 125];

export interface CalendarSlot { start: Date; end: Date }

export interface ProjectPanelProps {
	row: MyProjectRow;
	readOnly: boolean;
	/** Dates au calendrier, si le projet y est placé. */
	slot: CalendarSlot | null;
	hasTeam: boolean;
	teamLabel: string;
	onToggle: () => void;
	onPercentage: (value: number) => void;
	onBoost: (value: boolean) => void;
	onNote: (value: string) => void;
	onOpenCalendar: () => void;
	onTeammates: () => void;
	/** Taille d'équipe (« Solo », « Groupe de 2 à 4 »), en pastille. */
	teamText?: string;
	/** Remplace la raison de blocage par défaut (page qui sait faire autrement : piscine cochée ici). */
	blockerOverride?: string | null;
	/** Ouvre le détail complet du projet (durée, prérequis, description). */
	onDetails?: () => void;
	/** Contenu propre à la page, sous la simulation (effet sur une catégorie, modules d'une piscine). */
	children?: React.ReactNode;
}

function formatDate(iso: string | null): string | null {
	if (!iso) return null;
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const Switch: React.FC<{ checked: boolean; label: string; disabled?: boolean; onChange: (v: boolean) => void }> = ({ checked, label, disabled, onChange }) => (
	<button
		type="button"
		role="switch"
		aria-checked={checked}
		aria-label={label}
		disabled={disabled}
		className={`mp-switch${checked ? ' is-on' : ''}`}
		onClick={() => onChange(!checked)}
	>
		<span aria-hidden="true" />
	</button>
);

export const ProjectPanel: React.FC<ProjectPanelProps> = ({
	row, readOnly, slot, hasTeam, teamLabel, onToggle, onPercentage, onBoost, onNote, onOpenCalendar, onTeammates,
	teamText, blockerOverride, onDetails, children,
}) => {
	const titleId = useId();
	const max = row.maxPercentage ?? DEFAULT_PROJECT_MAX_PERCENTAGE;
	const pct = row.simulatedPercentage ?? 100;
	const blocker = !readOnly && blockerOverride !== undefined ? blockerOverride : simulationBlocker(row, readOnly);
	// Saisies locales, validées en quittant le champ : borner pendant la frappe
	// transformait « 1 » (début de « 110 ») en 50.
	const [pctDraft, setPctDraft] = useState(String(pct));
	const [noteDraft, setNoteDraft] = useState(row.note);
	useEffect(() => setPctDraft(String(pct)), [pct, row.simId]);
	useEffect(() => setNoteDraft(row.note), [row.note, row.simId]);

	const commitPct = () => {
		const n = Math.round(Number(pctDraft));
		if (!Number.isFinite(n) || pctDraft.trim() === '') { setPctDraft(String(pct)); return; }
		const clamped = Math.max(MIN_PERCENTAGE, Math.min(max, n));
		setPctDraft(String(clamped));
		if (clamped !== pct) onPercentage(clamped);
	};
	const step = (delta: number) => onPercentage(Math.max(MIN_PERCENTAGE, Math.min(max, pct + delta)));
	const commitNote = () => { if (noteDraft !== row.note) onNote(noteDraft); };

	const shownStatus = row.status === 'not_started' && row.isSimulated ? 'simulated' : row.status;
	const doneDate = formatDate(row.date);
	const canEdit = !readOnly && row.isSimulated && !row.isPool;

	return (
		<div className="mp-panel" aria-labelledby={titleId}>
			<div className="mp-panel-head">
				<div className="mp-pills">
					<span className={`mp-pill mp-pill--${shownStatus}`}>{STATUS_LABELS[shownStatus]}</span>
					<span className="mp-pill mp-pill--source">{SOURCE_LABELS[row.source]}</span>
					{teamText && <span className="mp-pill mp-pill--source">{teamText}</span>}
				</div>
				<h2 id={titleId}>{row.name}</h2>
				<p className="mp-muted">
					{row.rncpNames.length > 0 ? row.rncpNames.join(' · ') : row.source === 'extra42' ? 'Hors référentiel RNCP · cursus 42' : 'Projet personnalisé'}
				</p>
			</div>

			<div className="mp-facts">
				<div><span>XP du projet</span><strong>{row.xp > 0 ? `${row.xp.toLocaleString('fr-FR')} XP` : '—'}</strong></div>
				<div>
					<span>{row.finalMark != null ? (doneDate ? `Note 42 · ${doneDate}` : 'Note 42') : row.status === 'in_progress' ? 'Inscrit le' : 'Note 42'}</span>
					<strong>{row.finalMark != null ? `${row.finalMark} %` : row.status === 'in_progress' ? (doneDate ?? '—') : '—'}</strong>
				</div>
			</div>

			<section className="mp-sim" aria-label="Simulation">
				<div className="mp-sim-row">
					<span>
						<strong>Simuler ce projet</strong>
						<span className="mp-muted">
							{blocker ?? (row.status === 'in_progress' ? 'Prévois la note que tu vises.' : 'Compte dans ton XP prévisionnelle.')}
						</span>
					</span>
					<Switch checked={row.isSimulated} label="Simuler ce projet" disabled={!!blocker} onChange={onToggle} />
				</div>

				{row.isSimulated && !row.isPool && (
					<>
						<div className="mp-sim-block">
							<label className="mp-label" htmlFor={`${titleId}-pct`}>Note visée</label>
							<div className="mp-stepper">
								<button type="button" className="mp-icon-btn" onClick={() => step(-5)} disabled={!canEdit || pct <= MIN_PERCENTAGE} aria-label="Baisser la note visée">
									<Minus size={18} aria-hidden="true" />
								</button>
								<span className="mp-pct-field">
									<input
										id={`${titleId}-pct`}
										type="number"
										inputMode="numeric"
										min={MIN_PERCENTAGE}
										max={max}
										value={pctDraft}
										disabled={!canEdit}
										onChange={e => setPctDraft(e.target.value)}
										onBlur={commitPct}
										onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
									/>
									<span aria-hidden="true">%</span>
								</span>
								<button type="button" className="mp-icon-btn" onClick={() => step(5)} disabled={!canEdit || pct >= max} aria-label="Monter la note visée">
									<Plus size={18} aria-hidden="true" />
								</button>
							</div>
							<div className="mp-presets" role="group" aria-label="Notes courantes">
								{PRESETS.filter(v => v <= max).map(v => (
									<button key={v} type="button" aria-pressed={pct === v} disabled={!canEdit} onClick={() => onPercentage(v)}>
										{v} %
									</button>
								))}
							</div>
						</div>

						<div className="mp-sim-row">
							<span><strong>Bonus coalition</strong><span className="mp-muted">+4,2 % d'XP</span></span>
							<Switch checked={row.coalitionBoost} label="Bonus coalition" disabled={!canEdit} onChange={onBoost} />
						</div>

						<div className="mp-gain">
							<span className="mp-muted">XP obtenus</span>
							<strong>{simulatedGain(row.xp, pct, row.coalitionBoost).toLocaleString('fr-FR')} XP</strong>
						</div>

						<label className="mp-label mp-note">
							Note perso
							<textarea
								rows={2}
								value={noteDraft}
								disabled={!canEdit}
								maxLength={500}
								placeholder="Ex. : groupe avec un ami, viser les bonus"
								onChange={e => setNoteDraft(e.target.value)}
								onBlur={commitNote}
							/>
						</label>
					</>
				)}
			</section>

			{children}

			{row.isSimulated && !readOnly && (
				<div className="mp-cal">
					<CalendarDays size={20} aria-hidden="true" />
					<span>
						<strong>{slot ? 'Au calendrier' : 'À placer dans le calendrier'}</strong>
						<span className="mp-muted">
							{slot ? `${formatShort(slot.start)} → ${formatShort(slot.end)}` : 'Il t’attend dans « À placer », même hors référentiel.'}
						</span>
					</span>
					<button type="button" className="mp-link-btn" onClick={onOpenCalendar}>{slot ? 'Voir' : 'Placer'}</button>
				</div>
			)}

			{hasTeam && (
				<button type="button" className="mp-btn" onClick={onTeammates}>
					<Users size={18} aria-hidden="true" />
					{teamLabel}
				</button>
			)}

			{onDetails && (
				<button type="button" className="mp-btn" onClick={onDetails}>
					<Info size={18} aria-hidden="true" />
					Détails du projet
				</button>
			)}
		</div>
	);
};

/** Panneau qui monte du bas (tablette, téléphone), même comportement que les fenêtres de l'app. */
export const ProjectSheet: React.FC<{ open: boolean; label: string; onClose: () => void; children: React.ReactNode }> = ({
	open, label, onClose, children,
}) => {
	const panelRef = useRef<HTMLDivElement>(null);
	const onCloseRef = useRef(onClose);
	onCloseRef.current = onClose;
	const pressedOnOverlayRef = useRef(false);

	// Échap ferme ; Tab reste dans le panneau ; le focus revient à la ligne
	// touchée à la fermeture.
	useEffect(() => {
		if (!open) return;
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		panelRef.current?.focus({ preventScroll: true });
		const onKey = (e: KeyboardEvent) => {
			const panel = panelRef.current;
			// Une autre fenêtre ouverte par-dessus (palette Ctrl+K…) garde ses
			// touches : Échap la ferme ELLE, et Tab reste chez elle.
			const target = e.target instanceof Element ? e.target : null;
			const otherDialog = target?.closest('[role="dialog"]');
			if (otherDialog && otherDialog !== panel) return;
			if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); return; }
			if (e.key !== 'Tab' || !panel) return;
			const focusables = [...panel.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
			)];
			if (focusables.length === 0) return;
			const first = focusables[0];
			const last = focusables[focusables.length - 1];
			const active = document.activeElement;
			if (!panel.contains(active) || active === panel) {
				e.preventDefault();
				(e.shiftKey ? last : first).focus();
			} else if (e.shiftKey && active === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && active === last) {
				e.preventDefault();
				first.focus();
			}
		};
		window.addEventListener('keydown', onKey, true);
		const panel = panelRef.current;
		return () => {
			window.removeEventListener('keydown', onKey, true);
			// Rendre le focus seulement s'il est encore chez nous : une fenêtre
			// ouverte à la place (teammates) l'a déjà pris, le lui voler le
			// renvoyait derrière elle.
			const active = document.activeElement;
			const stillOurs = !active || active === document.body || !!panel?.contains(active);
			if (stillOurs && opener?.isConnected) opener.focus({ preventScroll: true });
		};
	}, [open]);

	if (typeof document === 'undefined') return null;
	return createPortal(
		<AnimatePresence>
			{open && (
				<div
					className="mp-sheet-overlay"
					onPointerDown={e => { pressedOnOverlayRef.current = e.target === e.currentTarget; }}
					onClick={e => { if (e.target === e.currentTarget && pressedOnOverlayRef.current) onClose(); }}
				>
					<motion.div
						ref={panelRef}
						className="mp-sheet"
						role="dialog"
						aria-modal="true"
						aria-label={label}
						tabIndex={-1}
						initial={{ y: '100%' }}
						animate={{ y: 0 }}
						exit={{ y: '100%' }}
						transition={{ type: 'tween', duration: 0.22 }}
					>
						<div className="mp-sheet-bar">
							<span className="mp-sheet-grip" aria-hidden="true" />
							<button type="button" className="mp-icon-btn" onClick={onClose} aria-label="Fermer la fiche">
								<X size={18} aria-hidden="true" />
							</button>
						</div>
						{children}
					</motion.div>
				</div>
			)}
		</AnimatePresence>,
		document.body,
	);
};
