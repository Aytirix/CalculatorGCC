import React from 'react';
import { Briefcase, GraduationCap } from 'lucide-react';
import type { Project42 } from '@/services/backend-api42.service';
import type { ProfessionalExperience } from '@/types/professionalExperience.types';
import { STAGE_MODELS } from '@/utils/stageModel';
import './ProfExpList.scss';

interface ProfExpListProps {
	entries: Project42[];
	evalsByParent: Record<string, Project42[]>;
	manualExperiences: ProfessionalExperience[];
	getParentKey: (p: Project42) => string;
	onDeleteManual: (id: string) => void;
	onEditManual: (exp: ProfessionalExperience) => void;
	apiExpPercentages: Record<number, number>;
	onApiExpPercentageChange: (id: number, percentage: number) => void;
	/** Expériences détectées que l'utilisateur a désactivées : elles ne comptent plus. */
	disabledIds?: number[];
	onToggleDisabled?: (id: number) => void;
	/** Profil d'un autre utilisateur : lecture seule, aucune action d'édition. */
	readOnly?: boolean;
}

function getApiEntryXP(p: Project42, percentage: number): number {
	const lower = p.project.name.toLowerCase();
	const slug = p.project.slug?.toLowerCase() || '';
	if (lower.includes('alternance') || slug.startsWith('fr-alternance')) {
		const match = lower.match(/(\d+)\s*an/);
		const years = match ? parseInt(match[1]) : 1;
		return Math.round(90000 * years * (percentage / 100));
	}
	// Stage / Work Experience (6 mois par défaut)
	if (slug.startsWith('work-experience') || lower.includes('stage')) {
		return Math.round(10500 * 6 * (percentage / 100));
	}
	return 0;
}

function isAlternanceEntry(p: Project42): boolean {
	const lower = p.project.name.toLowerCase();
	const slug = p.project.slug?.toLowerCase() || '';
	return lower.includes('alternance') || slug.startsWith('fr-alternance');
}

function getDefaultPercentage(entry: Project42, evals: Project42[]): number {
	const marks = evals.map(ev => ev.final_mark).filter((m): m is number => m != null);
	if (marks.length === 0) return 100;
	const averageOutOf100 = Math.round(marks.reduce((a, b) => a + b, 0) / marks.length);

	if (isAlternanceEntry(entry)) {
		return Math.min(125, Math.round((averageOutOf100 * 125) / 100));
	}

	return Math.min(100, averageOutOf100);
}

const fr = (n: number) => n.toLocaleString('fr-FR');

/**
 * Expériences professionnelles : celles détectées sur l'intra (désactivables,
 * pourcentage visé réglable tant qu'elles sont en cours) et celles saisies à
 * la main (simulées ou acquises, modifiables).
 */
const ProfExpList: React.FC<ProfExpListProps> = ({
	entries,
	evalsByParent,
	manualExperiences,
	getParentKey,
	onDeleteManual,
	onEditManual,
	apiExpPercentages,
	onApiExpPercentageChange,
	disabledIds = [],
	onToggleDisabled,
	readOnly = false,
}) => (
	<ul className="prof-exp-list">
		{entries.length === 0 && manualExperiences.length === 0 && (
			<li className="prof-exp-empty">Aucune expérience professionnelle détectée.</li>
		)}
		{entries.map((p) => {
			const evals = evalsByParent[getParentKey(p)] || [];
			const isAlt = isAlternanceEntry(p);
			const disabled = disabledIds.includes(p.id);
			const defaultPct = getDefaultPercentage(p, evals);
			const pct = apiExpPercentages[p.id] ?? (p.validated ? p.final_mark || 100 : defaultPct);
			const xp = getApiEntryXP(p, pct);
			const marks = evals.filter(ev => ev.final_mark != null).map(ev => `${ev.final_mark} %`);
			const editablePct = !p.validated && !disabled && !readOnly;
			return (
				<li key={p.id} className={`prof-exp-item${disabled ? ' is-disabled' : ''}`}>
					<span className="prof-exp-item__icon" aria-hidden="true">
						{isAlt ? <Briefcase size={18} /> : <GraduationCap size={18} />}
					</span>
					<span className="prof-exp-item__main">
						<span className="prof-exp-item__name">{p.project.name}</span>
						<span className="prof-exp-item__sub">
							Détectée sur l'intra
							{marks.length > 0 && ` · notes ${marks.join(', ')}`}
							{!p.validated && !disabled && ` · ${fr(xp)} XP prévus`}
						</span>
						{disabled && (
							<span className="prof-exp-item__hint">
								Ne compte plus. Ajoute la tienne avec « + Alternance » ou « + Stage ».
							</span>
						)}
					</span>
					{editablePct && (
						<label className="prof-exp-item__pct">
							<span className="prof-exp-sr">Pourcentage visé pour {p.project.name}</span>
							<input
								type="text"
								inputMode="numeric"
								value={pct}
								onChange={(e) => {
									const v = parseInt(e.target.value.replace(/\D/g, '')) || 0;
									onApiExpPercentageChange(p.id, Math.min(125, v));
								}}
							/>
							<span aria-hidden="true">%</span>
						</label>
					)}
					<span className={`prof-exp-pill ${disabled ? 'prof-exp-pill--off' : p.validated ? 'prof-exp-pill--validated' : 'prof-exp-pill--progress'}`}>
						{disabled ? 'Désactivée' : p.validated ? `Validée ${p.final_mark ?? 100} %` : readOnly ? `En cours · ${pct} %` : 'En cours'}
					</span>
					{!readOnly && onToggleDisabled && (
						<span className="prof-exp-item__actions">
							<button
								type="button"
								className="prof-exp-btn"
								onClick={() => onToggleDisabled(p.id)}
								aria-label={`${disabled ? 'Réactiver' : 'Désactiver'} ${p.project.name}`}
							>
								{disabled ? 'Réactiver' : 'Désactiver'}
							</button>
						</span>
					)}
				</li>
			);
		})}
		{manualExperiences.map((exp) => {
			const name = exp.type === 'alternance'
				? `Alternance ${exp.duration} an${exp.duration > 1 ? 's' : ''}`
				/* Un stage simulé porte son niveau : sans lui, impossible de
				   distinguer un Work Experience I d'un II dans la liste. */
				: STAGE_MODELS[exp.stageLevel ?? 1].label;
			return (
				<li key={exp.id} className="prof-exp-item prof-exp-item--manual">
					<span className="prof-exp-item__icon" aria-hidden="true">
						{exp.type === 'alternance' ? <Briefcase size={18} /> : <GraduationCap size={18} />}
					</span>
					<span className="prof-exp-item__main">
						<span className="prof-exp-item__name">{name}</span>
						<span className="prof-exp-item__sub">
							Ajoutée par toi · {fr(exp.xpEarned)} XP{exp.coalitionBoost > 0 ? ' · bonus coalition' : ''}
						</span>
					</span>
					{/* Simulée ou acquise : deux expériences identiques à l'œil sont
					    comptées différemment, le badge est ce qui les distingue. Le vert
					    est réservé à une expérience ACQUISE. */}
					<span className={`prof-exp-pill ${exp.isSimulation ? 'prof-exp-pill--simulated' : 'prof-exp-pill--validated'}`}>
						{exp.isSimulation ? 'Simulée' : 'Acquise'} {exp.validationPercentage} %
					</span>
					{!readOnly && (
						<span className="prof-exp-item__actions">
							<button type="button" className="prof-exp-btn" onClick={() => onEditManual(exp)} aria-label={`Modifier ${name}`}>
								Modifier
							</button>
							<button type="button" className="prof-exp-btn prof-exp-btn--danger" onClick={() => onDeleteManual(exp.id)} aria-label={`Supprimer ${name}`}>
								Supprimer
							</button>
						</span>
					)}
				</li>
			);
		})}
	</ul>
);

export default ProfExpList;
