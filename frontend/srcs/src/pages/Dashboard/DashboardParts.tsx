import React, { useEffect, useId, useState } from 'react';
import { Check, ChevronRight, User, Users } from 'lucide-react';
import type { CategoryValidation, ProjectCategory } from '@/types/rncp.types';
import type { ProjectTeamInfo } from '@/services/backend-api42.service';
import { STATUS_LABELS } from '@/pages/MyProjects/myProjects.types';
import { formatLevel } from '@/services/xp.service';
import { categoryStatus, rowDomId, share, type Condition } from './dashboardModel';
import type { DashRow } from './dashboardRows';

/**
 * Morceaux d'affichage du Dashboard, dans la même famille visuelle que Mes
 * projets (classes `mp-*`, couleurs `--mp-*` portées par `.mp-scope`).
 */

const fr = (n: number) => Math.round(n).toLocaleString('fr-FR');

// ── Niveau ─────────────────────────────────────────────────────────────────

export interface LevelMark { level: number; label: string }

export const LevelCard: React.FC<{
	currentLevel: number;
	projectedLevel: number;
	marks: LevelMark[];
	scale: { at: (level: number) => number };
	simCount: number;
	expCount: number;
	expSimCount: number;
}> = ({ currentLevel, projectedLevel, marks, scale, simCount, expCount, expSimCount }) => {
	const projected = formatLevel(projectedLevel) !== formatLevel(currentLevel);
	return (
		<section className="db-level" aria-label="Niveau" data-tour="welcome-section">
			<div className="db-level-main">
				<div className="db-level-values">
					<span className="mp-muted">Niveau</span>
					<strong>{formatLevel(currentLevel)}</strong>
					{projected && (
						<>
							<span className="mp-muted" aria-hidden="true">→</span>
							<strong className="db-level-projected">{formatLevel(projectedLevel)}</strong>
							<span className="mp-muted">avec ta simulation</span>
						</>
					)}
				</div>
				<div
					className="db-level-bar"
					role="img"
					aria-label={`Niveau ${formatLevel(currentLevel)}${projected ? `, ${formatLevel(projectedLevel)} avec la simulation` : ''}. Seuils : ${marks.map(m => m.label).join(', ')}.`}
				>
					<span className="db-level-track" />
					{projected && <span className="db-level-fill db-level-fill--sim" style={{ width: `${scale.at(projectedLevel)}%` }} />}
					<span className="db-level-fill" style={{ width: `${scale.at(currentLevel)}%` }} />
					{marks.map(m => (
						<span key={m.label} className="db-level-mark" style={{ left: `${scale.at(m.level)}%` }}>
							<span className="db-level-mark-label">{m.label}</span>
						</span>
					))}
				</div>
			</div>
			<div className="db-level-kpis">
				<div><span className="mp-muted">Projets simulés</span><strong>{simCount}</strong></div>
				<div>
					<span className="mp-muted">Expériences pro</span>
					<strong>{expCount}</strong>
					{expSimCount > 0 && <span className="mp-muted">dont {expSimCount} simulée{expSimCount > 1 ? 's' : ''}</span>}
				</div>
			</div>
		</section>
	);
};

// ── Choix du titre ─────────────────────────────────────────────────────────

export interface RncpChoice {
	id: string;
	level: string;
	name: string;
	realPct: number;
	projectedPct: number;
	pill: string;
	pillState: 'ok' | 'sim' | 'missing';
}

export const RncpPicker: React.FC<{ items: RncpChoice[]; selected: number; onSelect: (index: number) => void }> = ({ items, selected, onSelect }) => (
	<nav className="db-rncps" aria-label="Titres RNCP" data-tour="rncp-tabs">
		{items.map((item, index) => (
			<button
				key={item.id}
				type="button"
				className={`db-rncp${index === selected ? ' is-current' : ''}`}
				aria-current={index === selected ? 'page' : undefined}
				onClick={() => onSelect(index)}
				{...(item.id === 'rncp-global' ? { 'data-tour': 'rncp-global-tab' } : {})}
			>
				<span className="db-rncp-top">
					<span className="db-rncp-level">{item.level}</span>
					<span className={`db-state db-state--${item.pillState}`}>{item.pill}</span>
				</span>
				<span className="db-rncp-name">{item.name}</span>
				<span className="db-rncp-progress">
					<span className="db-bar" aria-hidden="true">
						<span className="db-bar-fill db-bar-fill--sim" style={{ width: `${item.projectedPct}%` }} />
						<span className="db-bar-fill" style={{ width: `${item.realPct}%` }} />
					</span>
					<span className="db-rncp-pct">
						{item.realPct === item.projectedPct ? `${item.realPct} %` : `${item.realPct} → ${item.projectedPct} %`}
					</span>
				</span>
			</button>
		))}
	</nav>
);

// ── Conditions générales ───────────────────────────────────────────────────

const STATE_ICON: Record<Condition['state'], string> = { ok: '✓', sim: '◆', missing: '!' };

export const RncpConditions: React.FC<{
	title: string;
	conditions: Condition[];
	met: number;
	total: number;
	realMet: number;
}> = ({ title, conditions, met, total, realMet }) => {
	const titleId = useId();
	return (
		<section className="db-card db-needs" aria-labelledby={titleId}>
			<div className="db-needs-head">
				<h2 id={titleId}>Ce qu'il manque pour {title}</h2>
				<span className="mp-muted">
					<strong className="db-strong">{met}</strong> condition{met > 1 ? 's' : ''} sur {total} avec ta simulation · {realMet} acquise{realMet > 1 ? 's' : ''}
				</span>
			</div>
			<ul className="db-needs-list">
				{conditions.map(c => (
					<li key={c.key} className={`db-need db-need--${c.state}`}>
						<span className="db-need-label">
							<span className={`db-need-icon db-state--${c.state}`} aria-hidden="true">{STATE_ICON[c.state]}</span>
							<strong>{c.label}</strong>
						</span>
						<span className="db-need-value">{c.value}</span>
						<span className={`db-need-hint db-text--${c.state}`}>{c.hint}</span>
					</li>
				))}
			</ul>
		</section>
	);
};

// ── Taille d'équipe ────────────────────────────────────────────────────────

/** Solo ou groupe d'un coup d'œil : la forme et l'icône changent, pas seulement la couleur. */
export const TeamBadge: React.FC<{ team: ProjectTeamInfo | null }> = ({ team }) => {
	if (!team) return null;
	if (team.solo) {
		return (
			<span className="mp-team" title="Projet à faire seul">
				<User size={13} aria-hidden="true" />
				Solo
			</span>
		);
	}
	const size = team.groupMin == null || team.groupMax == null
		? ''
		: team.groupMin === team.groupMax ? ` ${team.groupMin}` : ` ${team.groupMin}–${team.groupMax}`;
	return (
		<span className="mp-team mp-team--group" title={`Projet de groupe${size ? ` :${size} personnes` : ''}`}>
			<Users size={13} aria-hidden="true" />
			Groupe{size}
		</span>
	);
};

// ── Catégorie et lignes ────────────────────────────────────────────────────

const ProjectLine: React.FC<{
	row: DashRow;
	categoryId: string;
	team: ProjectTeamInfo | null;
	selected: boolean;
	readOnly: boolean;
	tourCheck: boolean;
	tourLine: boolean;
	onToggle: () => void;
	onSelect: () => void;
}> = ({ row, categoryId, team, selected, readOnly, tourCheck, tourLine, onToggle, onSelect }) => {
	const shown = row.status === 'not_started' && row.isSimulated ? 'simulated' : row.status;
	const reasonId = `${rowDomId(categoryId, row.id)}-reason`;
	const sub = row.isPool
		? `Piscine · ${row.poolDone} / ${row.poolTotal} modules`
		: row.retired
			? 'Hors référentiel : ne compte plus'
			: row.isSimulated && row.coalitionBoost ? 'Bonus coalition' : '';
	const checkLabel = row.status === 'validated'
		? `${row.name} : déjà validé`
		: row.isPool
			? `${row.isSimulated ? 'Décocher' : 'Cocher'} tous les modules de ${row.name}`
			: `${row.isSimulated ? 'Retirer de la simulation' : 'Simuler'} ${row.name}`;
	return (
		<li className={`mp-row${selected ? ' is-selected' : ''}${row.retired ? ' is-retired' : ''}`}>
			{readOnly ? (
				<span className={`mp-check-static${row.isSimulated || row.status === 'validated' ? ' is-on' : ''}`} aria-hidden="true">
					{(row.isSimulated || row.status === 'validated') && <Check size={14} strokeWidth={3.2} />}
				</span>
			) : (
				<button
					type="button"
					className={`mp-check${row.isSimulated ? ' is-on' : ''}${row.status === 'validated' ? ' is-done' : ''}`}
					aria-pressed={row.isSimulated || row.status === 'validated'}
					aria-label={checkLabel}
					aria-disabled={row.blocker ? true : undefined}
					aria-describedby={row.blocker ? reasonId : undefined}
					title={row.blocker ?? checkLabel}
					onClick={() => { if (!row.blocker) onToggle(); }}
					data-tour={tourCheck ? 'calendar-test-project' : undefined}
				>
					<span aria-hidden="true">{(row.isSimulated || row.status === 'validated') && <Check size={14} strokeWidth={3.2} />}</span>
					{row.blocker && <span id={reasonId} className="mp-sr-only">{row.blocker}</span>}
				</button>
			)}
			<button
				type="button"
				id={rowDomId(categoryId, row.id)}
				className="mp-row-main"
				aria-current={selected ? 'true' : undefined}
				onClick={onSelect}
				data-tour={tourLine ? 'project-details' : undefined}
			>
				<span className="mp-row-text">
					<span className="mp-row-name">{row.name}</span>
					{sub && <span className="mp-row-sub">{sub}</span>}
				</span>
				<span className="mp-row-pills">
					<TeamBadge team={team} />
					<span className={`mp-pill mp-pill--${shown}`}>{STATUS_LABELS[shown]}</span>
					{row.isSimulated && !row.isPool && (
						<span className="mp-pill mp-pill--simulated">{shown === 'simulated' ? `${row.simulatedPercentage} %` : `Simulé ${row.simulatedPercentage} %`}</span>
					)}
				</span>
				<span className="mp-row-xp">{row.retired ? '—' : `${fr(row.shownXp)} XP`}</span>
				<ChevronRight className="mp-row-chevron" size={16} aria-hidden="true" />
			</button>
		</li>
	);
};

export const CategoryBlock: React.FC<{
	category: ProjectCategory;
	cv: CategoryValidation;
	rows: DashRow[];
	showDone: boolean;
	selectedKey: string | null;
	readOnly: boolean;
	teamOf: (row: DashRow) => ProjectTeamInfo | null;
	tourRowId: string | null;
	onToggle: (row: DashRow) => void;
	onSelect: (row: DashRow) => void;
	onShowDone: () => void;
	/** Le guide demande à voir une ligne de cette catégorie (horodatage de la demande). */
	forceOpenAt?: number;
}> = ({ category, cv, rows, showDone, selectedKey, readOnly, teamOf, tourRowId, onToggle, onSelect, onShowDone, forceOpenAt }) => {
	const [open, setOpen] = useState(!cv.isRealValid);
	useEffect(() => { if (forceOpenAt) setOpen(true); }, [forceOpenAt]);
	const bodyId = useId();
	const status = categoryStatus(category, cv);
	const visible = showDone ? rows : rows.filter(r => r.status !== 'validated');
	const hiddenDone = rows.length - visible.length;
	const countText = `${cv.realCount}${cv.currentCount !== cv.realCount ? ` → ${cv.currentCount}` : ''} / ${category.requiredCount}`;
	const xpText = `${fr(cv.realXP)}${cv.currentXP !== cv.realXP ? ` → ${fr(cv.currentXP)}` : ''} / ${fr(category.requiredXP)}`;

	return (
		<section className="db-card db-cat">
			<button type="button" className="db-cat-head" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(o => !o)}>
				<span className="db-cat-title">
					<ChevronRight size={16} aria-hidden="true" className={`db-cat-chevron${open ? ' is-open' : ''}`} />
					<strong>{category.name}</strong>
					<span className={`db-state db-state--${status.state}`}>{status.label}</span>
				</span>
				<span className="db-cat-stats">
					{category.requiredCount > 0 && (
						<span className="db-cat-stat">
							<span className="mp-muted">Projets <strong className="db-strong">{countText}</strong></span>
							<span className="db-bar" aria-hidden="true">
								<span className="db-bar-fill db-bar-fill--sim" style={{ width: `${share(cv.currentCount, category.requiredCount)}%` }} />
								<span className="db-bar-fill" style={{ width: `${share(cv.realCount, category.requiredCount)}%` }} />
							</span>
						</span>
					)}
					{category.requiredXP > 0 && (
						<span className="db-cat-stat">
							<span className="mp-muted">XP <strong className="db-strong">{xpText}</strong></span>
							<span className="db-bar" aria-hidden="true">
								<span className="db-bar-fill db-bar-fill--sim" style={{ width: `${share(cv.currentXP, category.requiredXP)}%` }} />
								<span className="db-bar-fill" style={{ width: `${share(cv.realXP, category.requiredXP)}%` }} />
							</span>
						</span>
					)}
				</span>
			</button>
			{open && (
				<div id={bodyId}>
					{visible.length > 0 ? (
						<ul className="mp-rows db-cat-rows">
							{visible.map(row => (
								<ProjectLine
									key={row.id}
									row={row}
									categoryId={category.id}
									team={teamOf(row)}
									selected={selectedKey === `${category.id}:${row.id}`}
									readOnly={readOnly}
									tourCheck={tourRowId === `${category.id}:${row.id}`}
									tourLine={tourRowId === `${category.id}:${row.id}`}
									onToggle={() => onToggle(row)}
									onSelect={() => onSelect(row)}
								/>
							))}
						</ul>
					) : (
						<p className="mp-empty">Tous les projets de cette catégorie sont validés.</p>
					)}
					{hiddenDone > 0 && (
						<p className="mp-hidden-hint">
							{hiddenDone} projet{hiddenDone > 1 ? 's' : ''} validé{hiddenDone > 1 ? 's' : ''} masqué{hiddenDone > 1 ? 's' : ''}.{' '}
							<button type="button" className="mp-link-btn" onClick={onShowDone}>Les afficher</button>
						</p>
					)}
				</div>
			)}
		</section>
	);
};

// ── Fiche : effet sur la catégorie, modules d'une piscine ─────────────────

export const CategoryEffect: React.FC<{
	categoryName: string;
	simulated: boolean;
	effect: { before: { count: number; xp: number }; after: { count: number; xp: number }; gain: number; partial: boolean };
	required: { count: number; xp: number };
}> = ({ categoryName, simulated, effect, required }) => (
	<div className="db-effect">
		<strong>{effect.partial ? 'Ce que t’apportent les modules cochés' : simulated ? 'Ce qu’il t’apporte' : 'S’il était simulé'}</strong>
		<span><span className="mp-muted">XP en plus</span><b>+{fr(effect.gain)} XP</b></span>
		{required.count > 0 && (
			<span><span className="mp-muted">{categoryName} · projets</span><b>{effect.before.count} → {effect.after.count} / {required.count}</b></span>
		)}
		{required.xp > 0 && (
			<span><span className="mp-muted">{categoryName} · XP</span><b>{fr(effect.before.xp)} → {fr(effect.after.xp)} / {fr(required.xp)}</b></span>
		)}
	</div>
);

export const PoolModules: React.FC<{
	row: DashRow;
	completedSubs: string[];
	simulatedSubs: string[];
	readOnly: boolean;
	onToggleModule: (subId: string) => void;
	onToggleAll: () => void;
}> = ({ row, completedSubs, simulatedSubs, readOnly, onToggleModule, onToggleAll }) => {
	const done = row.status === 'validated';
	// Piscine retirée du référentiel : on ne coche plus rien (on peut décocher).
	const editable = !readOnly && !done;
	const canCheckNew = editable && !row.retired;
	return (
		<section className="db-modules" aria-label="Modules de la piscine">
			<div className="db-modules-head">
				<strong>Modules · {row.poolDone} / {row.poolTotal}</strong>
				{editable && (canCheckNew || row.isSimulated) && (
					<button type="button" className="mp-link-btn" onClick={onToggleAll}>
						{row.isSimulated ? 'Tout décocher' : 'Tout cocher'}
					</button>
				)}
			</div>
			<ul className="db-modules-list">
				{(row.project.subProjects ?? []).map(sub => {
					const acquired = done || completedSubs.includes(sub.id);
					const on = acquired || simulatedSubs.includes(sub.id);
					// Un module retiré resté coché se décoche (il compte encore).
					const reason = readOnly
						? 'Consultation : la simulation n’est pas modifiable.'
						: acquired ? 'Déjà validé.' : (sub.retired || !canCheckNew) && !on ? 'Hors référentiel : ne compte plus.' : null;
					const locked = !editable || !!reason;
					const reasonId = `db-module-${sub.id}-reason`;
					return (
						<li key={sub.id} className={sub.retired ? 'is-retired' : undefined}>
							<button
								type="button"
								className={`mp-check${on ? ' is-on' : ''}`}
								aria-pressed={on}
								aria-label={`${on ? 'Décocher' : 'Cocher'} ${sub.name}`}
								aria-disabled={locked ? true : undefined}
								aria-describedby={reason ? reasonId : undefined}
								title={reason ?? undefined}
								onClick={() => { if (!locked) onToggleModule(sub.id); }}
							>
								<span aria-hidden="true">{on && <Check size={14} strokeWidth={3.2} />}</span>
								{reason && <span id={reasonId} className="mp-sr-only">{reason}</span>}
							</button>
							<span className="db-module-name">{sub.name}{acquired && <span className="mp-muted"> · validé</span>}</span>
							{sub.xp > 0 && <span className="mp-muted">{fr(sub.xp)} XP</span>}
						</li>
					);
				})}
			</ul>
		</section>
	);
};
