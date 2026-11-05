import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Check, ChevronRight, Search } from 'lucide-react';
import Header from '@/components/Header/Header';
import { BackendAPI42Service, type Project42 } from '@/services/backend-api42.service';
import { simulationService, type SimulationData } from '@/services/simulation.service';
import { calendarService } from '@/services/calendar.service';
import { createSimulationSaver } from '@/services/simulationStore';
import { useRncpData } from '@/contexts/useRncpData';
import { useProjectTeams } from '@/contexts/useProjectTeams';
import { useViewingUser } from '@/contexts/useViewingUser';
import TeammateModal from '@/components/TeammateModal/TeammateModal';
import { normalizeProjectSlug } from '@/utils/projectMatcher';
import { setSimulated, simulatedGain, updateSimulated } from '@/utils/simulationEdit';
import { deserializeProjects } from '@/pages/Calendar/calendarModel';
import { DEFAULT_PROJECT_MAX_PERCENTAGE } from '@/utils/projectPercentage';
import type { SimulatorProject } from '@/types/rncp.types';
import {
	buildMyProjects,
	simulationBlocker,
	STATUS_LABELS,
	type MyProjectRow,
	type ProjectSource,
	type ProjectStatus,
} from './myProjects.types';
import { ProjectPanel, ProjectSheet, type CalendarSlot } from './ProjectPanel';
import './MyProjects.scss';

/**
 * Mes projets : tout le parcours (validé, raté, en cours, simulé, jamais
 * touché) ET la simulation, gérée d'ici comme depuis le Dashboard — y compris
 * pour les projets hors référentiel RNCP, qui partent alors dans « À placer »
 * du Calendrier.
 *
 * Grand écran : liste + fiche à droite. Tablette et téléphone : la fiche monte
 * du bas. Les filtres sont mémorisés (préférence d'affichage de l'appareil).
 */

// v2 : nouveau défaut (« En cours » seul). L'ancienne clé gardait d'anciens
// réglages qui auraient masqué ce défaut pour tous les utilisateurs existants.
const FILTERS_KEY = 'my_projects_filters_v2';
const WIDE_QUERY = '(min-width: 1100px)';
/** Marge entre le haut de l'écran et la fiche quand elle suit le défilement. */
const SIDE_STICKY_TOP = 16;

type SortKey = 'name' | 'xp' | 'date' | 'mark' | 'status';

interface Filters {
	search: string;
	statuses: ProjectStatus[];
	sources: ProjectSource[];
	rncp: string;
	sort: SortKey;
	direction: 'asc' | 'desc';
}

const ALL_SOURCES: ProjectSource[] = ['rncp', 'extra42', 'custom'];

const DEFAULT_FILTERS: Filters = {
	search: '',
	// Ce sur quoi on travaille en ce moment ; les autres statuts sont à une
	// puce de distance (leur nombre reste affiché).
	statuses: ['in_progress'],
	sources: ALL_SOURCES,
	rncp: '',
	sort: 'status',
	direction: 'asc',
};

// Ordre des puces : ce qui demande une action d'abord.
const ALL_STATUSES: ProjectStatus[] = ['in_progress', 'simulated', 'validated', 'failed', 'not_started'];

const SORT_LABELS: Record<SortKey, string> = {
	status: 'statut',
	date: 'date',
	name: 'nom',
	xp: 'XP',
	mark: 'note',
};

const SOURCE_OPTIONS: { value: 'all' | ProjectSource; label: string }[] = [
	{ value: 'all', label: 'Tous les projets' },
	{ value: 'rncp', label: 'Référentiel RNCP' },
	{ value: 'extra42', label: 'Hors référentiel' },
	{ value: 'custom', label: 'Projets perso' },
];

function loadFilters(): Filters {
	try {
		const raw = localStorage.getItem(FILTERS_KEY);
		if (!raw) return DEFAULT_FILTERS;
		const parsed = JSON.parse(raw) as Partial<Filters>;
		return {
			...DEFAULT_FILTERS,
			...parsed,
			search: '',
			// Un tableau vide masquerait tout : on repart du défaut dans ce cas.
			statuses: parsed.statuses?.length ? parsed.statuses : DEFAULT_FILTERS.statuses,
			sources: parsed.sources?.length ? parsed.sources : DEFAULT_FILTERS.sources,
			sort: parsed.sort && parsed.sort in SORT_LABELS ? parsed.sort : DEFAULT_FILTERS.sort,
		};
	} catch {
		return DEFAULT_FILTERS;
	}
}

function useMediaQuery(query: string): boolean {
	const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
	useEffect(() => {
		const mql = window.matchMedia(query);
		const onChange = () => setMatches(mql.matches);
		onChange();
		mql.addEventListener('change', onChange);
		return () => mql.removeEventListener('change', onChange);
	}, [query]);
	return matches;
}

/** Projets placés au calendrier : copie locale (la plus fraîche) sinon la base. */
function readLocalCalendar(): unknown | null {
	try {
		const raw = localStorage.getItem('calendar_projects');
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

const statusOrder = (row: MyProjectRow) => ALL_STATUSES.indexOf(row.status === 'not_started' && row.isSimulated ? 'simulated' : row.status);

const MyProjects: React.FC = () => {
	const { rncpData, loading: rncpLoading } = useRncpData();
	const { allProjects: catalog42, getTeamInfo } = useProjectTeams();
	const { isViewingOther } = useViewingUser();
	const readOnly = isViewingOther;
	const navigate = useNavigate();
	const isWide = useMediaQuery(WIDE_QUERY);
	const [searchParams, setSearchParams] = useSearchParams();

	const [apiProjects, setApiProjects] = useState<Project42[]>([]);
	const [simulation, setSimulation] = useState<SimulationData | null>(null);
	const [calendarRaw, setCalendarRaw] = useState<unknown>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [filters, setFilters] = useState<Filters>(loadFilters);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);
	const [teammateRow, setTeammateRow] = useState<MyProjectRow | null>(null);
	const saverRef = useRef<ReturnType<typeof createSimulationSaver> | null>(null);
	if (!saverRef.current) saverRef.current = createSimulationSaver();

	// La recherche peut être pilotée depuis la palette de commandes (Ctrl+K),
	// y compris quand on est DÉJÀ sur la page : seule l'URL change alors.
	const searchFromUrl = searchParams.get('q');
	useEffect(() => {
		if (!searchFromUrl) return;
		setFilters(prev => ({ ...prev, search: searchFromUrl }));
		const next = new URLSearchParams(searchParams);
		next.delete('q');
		setSearchParams(next, { replace: true });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [searchFromUrl]);

	useEffect(() => {
		let cancelled = false;
		const calendar = readOnly
			? Promise.resolve(null)
			: (() => {
				const local = readLocalCalendar();
				return local ? Promise.resolve(local) : calendarService.load().then(d => d?.placedProjects ?? null).catch(() => null);
			})();
		Promise.all([BackendAPI42Service.getUserData(), simulationService.load(), calendar])
			.then(([data, sim, cal]) => {
				if (cancelled) return;
				setApiProjects(data.allProjects ?? []);
				setSimulation(sim);
				setCalendarRaw(cal);
			})
			.catch(() => !cancelled && setError('Impossible de charger tes projets.'))
			.finally(() => !cancelled && setLoading(false));
		return () => { cancelled = true; };
	}, [readOnly]);

	// Quitter la page envoie tout de suite la dernière modification.
	useEffect(() => () => saverRef.current?.flush(), []);

	// Grand écran : la fiche suit le défilement de la page, sans sortir de la
	// zone de la liste. Une fiche restée en haut était hors de l'écran dès
	// qu'on choisissait un projet plus bas.
	const bodyRef = useRef<HTMLDivElement>(null);
	const sideRef = useRef<HTMLElement>(null);
	useEffect(() => {
		if (!isWide) return;
		const update = () => {
			const body = bodyRef.current;
			const side = sideRef.current;
			if (!body || !side) return;
			const room = Math.max(0, body.offsetHeight - side.offsetHeight);
			const offset = Math.max(0, Math.min(SIDE_STICKY_TOP - body.getBoundingClientRect().top, room));
			side.style.transform = offset > 0 ? `translateY(${Math.round(offset)}px)` : '';
		};
		update();
		window.addEventListener('scroll', update, { passive: true });
		window.addEventListener('resize', update);
		const observer = new ResizeObserver(update);
		if (bodyRef.current) observer.observe(bodyRef.current);
		if (sideRef.current) observer.observe(sideRef.current);
		return () => {
			window.removeEventListener('scroll', update);
			window.removeEventListener('resize', update);
			observer.disconnect();
		};
	}, [isWide]);

	// Passé en grand écran, la fiche est à droite : le panneau du bas ne doit
	// pas se rouvrir tout seul en revenant à une fenêtre étroite.
	useEffect(() => { if (isWide) setSheetOpen(false); }, [isWide]);

	useEffect(() => {
		try {
			// La recherche n'est pas mémorisée : retrouver une liste vide à cause
			// d'un mot tapé la veille faisait croire à une page cassée.
			localStorage.setItem(FILTERS_KEY, JSON.stringify({ ...filters, search: '' }));
		} catch { /* préférence perdue, sans gravité */ }
	}, [filters]);

	// Dernière simulation connue, à jour même entre deux rendus (deux clics
	// rapides) ; l'enregistrement reste HORS de la fonction de mise à jour de
	// l'état (que React peut appeler deux fois).
	const simRef = useRef<SimulationData | null>(null);
	simRef.current = simulation;
	const applySimulation = useCallback((fn: (d: SimulationData) => SimulationData) => {
		const prev = simRef.current;
		if (readOnly || !prev) return;
		const next = fn(prev);
		if (next === prev) return;
		simRef.current = next;
		setSimulation(next);
		saverRef.current?.schedule(next);
	}, [readOnly]);

	const rows = useMemo(() => {
		if (rncpLoading || !simulation) return [];
		const percentages: Record<string, number> = {};
		const boosts: Record<string, boolean> = {};
		const notes: Record<string, string> = {};
		for (const p of simulation.simulatedProjects) {
			percentages[p.projectId] = p.percentage;
			if (p.coalitionBoost) boosts[p.projectId] = true;
			if (p.note) notes[p.projectId] = p.note;
		}
		const xpBySlug = new Map<string, number>();
		for (const project of catalog42) {
			if (project.xp <= 0) continue;
			for (const key of [project.slug.replace(/^42cursus-/, ''), project.name]) {
				const normalized = normalizeProjectSlug(key);
				if (normalized && !xpBySlug.has(normalized)) xpBySlug.set(normalized, project.xp);
			}
		}
		return buildMyProjects({
			rncpData,
			apiProjects,
			simulatedIds: simulation.simulatedProjects.map(p => p.projectId),
			percentages,
			boosts,
			notes,
			simulatedSubProjects: simulation.simulatedSubProjects ?? {},
			customProjects: (simulation.customProjects as SimulatorProject[]) ?? [],
			xpBySlug,
			catalog: catalog42,
		});
	}, [rncpData, rncpLoading, apiProjects, simulation, catalog42]);

	const slots = useMemo(() => {
		const map = new Map<string, CalendarSlot>();
		for (const p of deserializeProjects(calendarRaw)) map.set(p.projectId, { start: p.startDate, end: p.endDate });
		return map;
	}, [calendarRaw]);

	const rncpNames = useMemo(() => rncpData.map(r => r.name), [rncpData]);
	const searching = filters.search.trim().length > 0;

	/**
	 * Lignes retenues par TOUT sauf le filtre de statut : c'est sur elles que
	 * les puces comptent (choisir un RNCP fait bouger leurs nombres, et une puce
	 * éteinte garde son nombre pour qu'on sache ce qu'on rallume).
	 */
	const inScope = useMemo(() => {
		const needle = filters.search.trim().toLowerCase();
		return rows.filter(row => {
			// Chercher un projet par son nom prime sur les filtres : sinon taper
			// « bomberman » ne donnait rien tant que « Non commencé » était masqué.
			if (needle) return row.name.toLowerCase().includes(needle);
			if (!filters.sources.includes(row.source)) return false;
			if (filters.rncp && !row.rncpNames.includes(filters.rncp)) return false;
			return true;
		});
	}, [rows, filters.search, filters.sources, filters.rncp]);

	const visible = useMemo(() => {
		const filtered = searching
			? [...inScope]
			: inScope.filter(row =>
				filters.statuses.includes(row.status)
				// Un projet peut être en cours (ou validé, ou raté) ET simulé.
				|| (filters.statuses.includes('simulated') && row.isSimulated));
		const sign = filters.direction === 'asc' ? 1 : -1;
		return filtered.sort((a, b) => {
			switch (filters.sort) {
				case 'name': return sign * a.name.localeCompare(b.name, 'fr');
				case 'xp': return sign * (a.xp - b.xp);
				case 'mark': return sign * ((a.finalMark ?? -1) - (b.finalMark ?? -1));
				case 'date': return sign * (new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime());
				default: return sign * (statusOrder(a) - statusOrder(b)) || a.name.localeCompare(b.name, 'fr');
			}
		});
	}, [inScope, searching, filters]);

	const groups = useMemo(() => {
		const todo = visible.filter(r => r.status !== 'validated' && r.status !== 'failed');
		const done = visible.filter(r => r.status === 'validated' || r.status === 'failed');
		return [
			{ key: 'todo', title: 'À faire', sub: readOnly ? '' : 'coche pour simuler', rows: todo },
			{ key: 'done', title: 'Faits', sub: '', rows: done },
		].filter(g => g.rows.length > 0);
	}, [visible, readOnly]);

	const counts = useMemo(() => {
		const out: Record<ProjectStatus, number> = { validated: 0, failed: 0, in_progress: 0, simulated: 0, not_started: 0 };
		for (const row of inScope) {
			// Statut « simulé » (jamais commencé) : une seule fois.
			if (row.status === 'simulated' || (row.status === 'not_started' && row.isSimulated)) out.simulated++;
			else {
				out[row.status]++;
				// Simulé ET commencé : compté dans les deux puces, comme le filtre.
				if (row.isSimulated) out.simulated++;
			}
		}
		return out;
	}, [inScope]);

	const hiddenNeverStarted = !searching && !filters.statuses.includes('not_started')
		? inScope.filter(r => r.status === 'not_started' && !r.isSimulated).length
		: 0;

	const kpis = useMemo(() => {
		// Comme le Dashboard : un projet déjà validé (pas encore retiré par la
		// réconciliation) ne rapporte plus rien, et la note est bornée au maximum.
		const simulatedRows = rows.filter(r => r.isSimulated && !r.isPool && r.status !== 'validated');
		return {
			gain: simulatedRows.reduce((sum, r) => sum + simulatedGain(
				r.xp,
				Math.min(r.simulatedPercentage ?? 100, r.maxPercentage ?? DEFAULT_PROJECT_MAX_PERCENTAGE),
				r.coalitionBoost,
			), 0),
			simCount: rows.filter(r => r.isSimulated).length,
			validated: rows.filter(r => r.status === 'validated').length,
			validatedRncp: rows.filter(r => r.status === 'validated' && r.source === 'rncp').length,
			inProgress: rows.filter(r => r.status === 'in_progress'),
			toPlace: simulatedRows.filter(r => !slots.has(r.simId)).length,
		};
	}, [rows, slots]);

	const selected = rows.find(r => r.id === selectedId) ?? null;

	const toggle = <T,>(list: T[], value: T): T[] => (list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
	const filtersAreDefault = JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS);
	const sourceValue = filters.sources.length === 1 ? filters.sources[0] : 'all';

	const toggleSimulated = (row: MyProjectRow) => {
		if (simulationBlocker(row, readOnly)) return;
		applySimulation(d => setSimulated(d, {
			id: row.simId, name: row.name, slug: row.slug, xp: row.xp, inRncp: row.source === 'rncp',
		}, !row.isSimulated));
	};

	const selectRow = (row: MyProjectRow) => {
		setSelectedId(row.id);
		if (!isWide) setSheetOpen(true);
	};

	const openCalendar = () => {
		saverRef.current?.flush();
		navigate('/calendar');
	};

	const teamOf = (row: MyProjectRow) => {
		const info = getTeamInfo({ id: row.id, name: row.name, slug: row.slug });
		return info && !info.solo ? info : null;
	};

	const panelFor = (row: MyProjectRow) => {
		const team = teamOf(row);
		return (
			<ProjectPanel
				row={row}
				readOnly={readOnly}
				slot={slots.get(row.simId) ?? null}
				hasTeam={!!team}
				teamLabel={team?.groupMin != null && team.groupMax != null
					? `Trouver des teammates (${team.groupMin} à ${team.groupMax})`
					: 'Trouver des teammates'}
				onToggle={() => toggleSimulated(row)}
				onPercentage={v => applySimulation(d => updateSimulated(d, row.simId, { percentage: v }))}
				onBoost={v => applySimulation(d => updateSimulated(d, row.simId, { coalitionBoost: v }))}
				onNote={v => applySimulation(d => updateSimulated(d, row.simId, { note: v }))}
				onOpenCalendar={openCalendar}
				// Le panneau du bas se ferme d'abord : la fenêtre des teammates
				// s'ouvrait DESSOUS (inutilisable au doigt comme au clavier).
				onTeammates={() => { setSheetOpen(false); setTeammateRow(row); }}
			/>
		);
	};

	return (
		<div className="my-projects-page">
			<Header />

			<div className="mp-container">
				<header className="mp-head">
					<h1>Mes projets</h1>
					<p className="mp-muted">
						{readOnly
							? 'Son parcours et sa simulation.'
							: 'Ton parcours et ta simulation au même endroit : coche un projet pour le simuler, il part dans le calendrier.'}
					</p>
				</header>

				{!loading && !error && (
					<div className="mp-kpis">
						<div className="mp-kpi">
							<span>XP simulés</span>
							<strong>{kpis.gain.toLocaleString('fr-FR')}</strong>
							<span>{kpis.simCount} projet{kpis.simCount > 1 ? 's' : ''} simulé{kpis.simCount > 1 ? 's' : ''}</span>
						</div>
						<div className="mp-kpi">
							<span>Validés</span>
							<strong>{kpis.validated}</strong>
							<span>dont {kpis.validatedRncp} du référentiel RNCP</span>
						</div>
						<div className="mp-kpi">
							<span>En cours</span>
							<strong>{kpis.inProgress.length}</strong>
							<span className="mp-ellipsis">{kpis.inProgress.slice(0, 3).map(r => r.name).join(', ') || 'rien en ce moment'}</span>
						</div>
						{!readOnly && (
							<div className="mp-kpi">
								<span>À placer au calendrier</span>
								<strong>{kpis.toPlace}</strong>
								<span>projets simulés sans dates</span>
							</div>
						)}
					</div>
				)}

				<div className="mp-toolbar">
					<label className="mp-search">
						<Search size={18} aria-hidden="true" />
						<span className="mp-sr-only">Rechercher un projet</span>
						<input
							type="search"
							placeholder="Rechercher un projet…"
							value={filters.search}
							onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
						/>
					</label>

					<div className="mp-chips" role="group" aria-label="Filtrer par statut">
						{ALL_STATUSES.map(status => {
							const on = filters.statuses.includes(status);
							return (
								<button
									key={status}
									type="button"
									aria-pressed={on}
									className={`mp-chip mp-chip--${status}${on ? ' is-on' : ''}`}
									onClick={() => setFilters(f => ({ ...f, statuses: toggle(f.statuses, status) }))}
									title={status === 'simulated'
										? 'Afficher / masquer les projets de ta simulation, quel que soit leur avancement'
										: `Afficher / masquer les projets « ${STATUS_LABELS[status]} »`}
								>
									<span className="mp-chip-count">{counts[status]}</span>
									{STATUS_LABELS[status]}
								</button>
							);
						})}
					</div>

					<div className="mp-selects">
						<label>
							<span className="mp-sr-only">Origine des projets</span>
							<select
								value={sourceValue}
								onChange={e => setFilters(f => ({
									...f,
									sources: e.target.value === 'all' ? ALL_SOURCES : [e.target.value as ProjectSource],
								}))}
							>
								{SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
							</select>
						</label>
						<label>
							<span className="mp-sr-only">Filtrer par RNCP</span>
							<select value={filters.rncp} onChange={e => setFilters(f => ({ ...f, rncp: e.target.value }))}>
								<option value="">Tous les RNCP</option>
								{rncpNames.map(name => <option key={name} value={name}>{name}</option>)}
							</select>
						</label>
						<label>
							<span className="mp-sr-only">Trier par</span>
							<select value={filters.sort} onChange={e => setFilters(f => ({ ...f, sort: e.target.value as SortKey }))}>
								{(Object.keys(SORT_LABELS) as SortKey[]).map(key => (
									<option key={key} value={key}>Trier : {SORT_LABELS[key]}</option>
								))}
							</select>
						</label>
						<button
							type="button"
							className="mp-icon-btn"
							onClick={() => setFilters(f => ({ ...f, direction: f.direction === 'asc' ? 'desc' : 'asc' }))}
							aria-label={filters.direction === 'asc' ? 'Ordre croissant (inverser)' : 'Ordre décroissant (inverser)'}
							title={filters.direction === 'asc' ? 'Ordre croissant' : 'Ordre décroissant'}
						>
							{filters.direction === 'asc' ? <ArrowUp size={18} aria-hidden="true" /> : <ArrowDown size={18} aria-hidden="true" />}
						</button>
						{!filtersAreDefault && (
							<button type="button" className="mp-link-btn" onClick={() => setFilters(DEFAULT_FILTERS)}>Réinitialiser</button>
						)}
					</div>
				</div>

				{searching && (
					<p className="mp-note-line">Recherche « {filters.search.trim()} » dans tous les projets : les filtres sont ignorés.</p>
				)}

				<div className="mp-body" ref={bodyRef}>
					<div className="mp-list-card">
						{loading || rncpLoading ? (
							<p className="mp-empty">Chargement…</p>
						) : error ? (
							<p className="mp-empty" role="alert">{error}</p>
						) : visible.length === 0 ? (
							<p className="mp-empty">Aucun projet ne correspond à ces filtres.</p>
						) : (
							groups.map(g => (
								<section key={g.key} aria-label={g.title}>
									<div className="mp-group-head">
										<h2>{g.title} <span className="mp-muted">· {g.rows.length}</span></h2>
										{g.sub && <span className="mp-muted">{g.sub}</span>}
									</div>
									<ul className="mp-rows">
										{g.rows.map(row => (
											<ProjectRow
												key={row.id}
												row={row}
												readOnly={readOnly}
												selected={row.id === selectedId}
												placed={slots.has(row.simId)}
												onToggle={() => toggleSimulated(row)}
												onSelect={() => selectRow(row)}
											/>
										))}
									</ul>
								</section>
							))
						)}
						{!loading && hiddenNeverStarted > 0 && (
							<p className="mp-hidden-hint">
								{hiddenNeverStarted} projet{hiddenNeverStarted > 1 ? 's' : ''} jamais commencé{hiddenNeverStarted > 1 ? 's' : ''} masqué{hiddenNeverStarted > 1 ? 's' : ''}.{' '}
								<button
									type="button"
									className="mp-link-btn"
									onClick={() => setFilters(f => ({ ...f, statuses: [...f.statuses, 'not_started'] }))}
								>
									Les afficher
								</button>
							</p>
						)}
					</div>

					{isWide && (
						<aside className="mp-side" aria-label="Fiche du projet" ref={sideRef}>
							{selected ? panelFor(selected) : (
								<p className="mp-empty">Sélectionne un projet pour voir sa fiche et le simuler.</p>
							)}
						</aside>
					)}
				</div>
			</div>

			{!isWide && (
				<ProjectSheet open={sheetOpen && !!selected} label={selected?.name ?? 'Projet'} onClose={() => setSheetOpen(false)}>
					{selected && panelFor(selected)}
				</ProjectSheet>
			)}

			{teammateRow && (
				<TeammateModal
					isOpen
					onClose={() => setTeammateRow(null)}
					projectId={teammateRow.id}
					projectName={teammateRow.name}
					teamInfo={getTeamInfo({ id: teammateRow.id, name: teammateRow.name, slug: teammateRow.slug })}
					isSimulated={teammateRow.isSimulated}
				/>
			)}
		</div>
	);
};

const ProjectRow: React.FC<{
	row: MyProjectRow;
	readOnly: boolean;
	selected: boolean;
	placed: boolean;
	onToggle: () => void;
	onSelect: () => void;
}> = ({ row, readOnly, selected, placed, onToggle, onSelect }) => {
	const shown = row.status === 'not_started' && row.isSimulated ? 'simulated' : row.status;
	const blocker = simulationBlocker(row, readOnly);
	const reasonId = `mp-reason-${row.id}`;
	const pct = row.simulatedPercentage ?? 100;
	const sub = [
		row.rncpNames.length > 0 ? row.rncpNames.join(' · ') : row.source === 'extra42' ? 'Hors référentiel' : 'Projet perso',
		row.isSimulated && !row.isPool && row.status !== 'validated' && !readOnly ? (placed ? 'au calendrier' : 'à placer') : null,
	].filter(Boolean).join(' · ');
	const date = row.date && (row.status === 'validated' || row.status === 'failed')
		? new Date(row.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
		: null;

	return (
		<li className={`mp-row${selected ? ' is-selected' : ''}`}>
			{readOnly ? (
				<span className={`mp-check-static${row.isSimulated ? ' is-on' : ''}`} aria-hidden="true">
					{row.isSimulated && <Check size={14} strokeWidth={3.2} />}
				</span>
			) : (
				// aria-disabled plutôt que disabled : la case reste atteignable au
				// clavier, et sa raison (« Déjà validé »…) est lue par le lecteur d'écran.
				<button
					type="button"
					className={`mp-check${row.isSimulated ? ' is-on' : ''}`}
					aria-pressed={row.isSimulated}
					aria-label={`${row.isSimulated ? 'Retirer de la simulation' : 'Simuler'} ${row.name}`}
					aria-disabled={blocker ? true : undefined}
					aria-describedby={blocker ? reasonId : undefined}
					title={blocker ?? (row.isSimulated ? 'Retirer de la simulation' : 'Simuler ce projet')}
					onClick={() => { if (!blocker) onToggle(); }}
				>
					<span aria-hidden="true">{row.isSimulated && <Check size={14} strokeWidth={3.2} />}</span>
					{blocker && <span id={reasonId} className="mp-sr-only">{blocker}</span>}
				</button>
			)}
			<button type="button" className="mp-row-main" aria-current={selected ? 'true' : undefined} onClick={onSelect}>
				<span className="mp-row-text">
					<span className="mp-row-name">{row.name}</span>
					<span className="mp-row-sub">{sub}</span>
				</span>
				<span className="mp-row-pills">
					<span className={`mp-pill mp-pill--${shown}`}>{STATUS_LABELS[shown]}</span>
					{row.isSimulated && !row.isPool && (
						<span className="mp-pill mp-pill--simulated">{shown === 'simulated' ? `${pct} %` : `Simulé ${pct} %`}</span>
					)}
				</span>
				<span className="mp-row-xp">{row.xp > 0 ? `${row.xp.toLocaleString('fr-FR')} XP` : '—'}</span>
				<span className="mp-row-meta">
					{row.finalMark != null ? `${row.finalMark} %` : ''}
					{date && <span>{date}</span>}
				</span>
				<ChevronRight className="mp-row-chevron" size={16} aria-hidden="true" />
			</button>
		</li>
	);
};

export default MyProjects;
