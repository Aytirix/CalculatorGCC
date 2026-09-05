import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '@/components/Header/Header';
import { BackendAPI42Service, type Project42 } from '@/services/backend-api42.service';
import { simulationService, type SimulationData } from '@/services/simulation.service';
import { useRncpData } from '@/contexts/useRncpData';
import { useProjectTeams } from '@/contexts/useProjectTeams';
import { normalizeProjectSlug } from '@/utils/projectMatcher';
import type { SimulatorProject } from '@/types/rncp.types';
import {
	buildMyProjects,
	SOURCE_LABELS,
	STATUS_LABELS,
	type MyProjectRow,
	type ProjectSource,
	type ProjectStatus,
} from './myProjects.types';
import './MyProjects.scss';

/**
 * Vue d'ensemble du parcours : tout ce que l'utilisateur a validé, raté,
 * commencé, simulé ou pas encore touché, dans une seule liste filtrable.
 *
 * Les filtres sont mémorisés d'une visite à l'autre : c'est une préférence
 * d'affichage propre à l'appareil, personne n'a envie de les reposer à chaque
 * passage.
 */

const FILTERS_KEY = 'my_projects_filters';

type SortKey = 'name' | 'xp' | 'date' | 'mark' | 'status';

interface Filters {
	search: string;
	statuses: ProjectStatus[];
	sources: ProjectSource[];
	rncp: string;
	sort: SortKey;
	direction: 'asc' | 'desc';
}

const DEFAULT_FILTERS: Filters = {
	search: '',
	// Par défaut on montre le parcours réel et les projets prévus ; les projets
	// jamais touchés sont là mais masqués, ils noieraient le reste.
	statuses: ['validated', 'failed', 'in_progress', 'simulated'],
	sources: ['rncp', 'extra42', 'custom'],
	rncp: '',
	sort: 'date',
	direction: 'desc',
};

const ALL_STATUSES: ProjectStatus[] = [
	'validated',
	'in_progress',
	'simulated',
	'failed',
	'not_started',
];

const SORT_LABELS: Record<SortKey, string> = {
	date: 'Date',
	name: 'Nom',
	xp: 'XP',
	mark: 'Note',
	status: 'Statut',
};

function loadFilters(): Filters {
	try {
		const raw = localStorage.getItem(FILTERS_KEY);
		if (!raw) return DEFAULT_FILTERS;
		const parsed = JSON.parse(raw) as Partial<Filters>;
		return {
			...DEFAULT_FILTERS,
			...parsed,
			// Un tableau vide masquerait tout : on repart du défaut dans ce cas.
			statuses: parsed.statuses?.length ? parsed.statuses : DEFAULT_FILTERS.statuses,
			sources: parsed.sources?.length ? parsed.sources : DEFAULT_FILTERS.sources,
		};
	} catch {
		return DEFAULT_FILTERS;
	}
}

function formatDate(iso: string | null): string {
	if (!iso) return '—';
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '—';
	return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const MyProjects: React.FC = () => {
	const { rncpData, loading: rncpLoading } = useRncpData();
	const { allProjects: catalog42 } = useProjectTeams();
	const [searchParams, setSearchParams] = useSearchParams();

	const [apiProjects, setApiProjects] = useState<Project42[]>([]);
	const [simulation, setSimulation] = useState<SimulationData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [filters, setFilters] = useState<Filters>(loadFilters);

	// La recherche peut être pilotée depuis la palette de commandes. L'effet suit
	// les paramètres d'URL, et pas seulement le montage : sélectionner un projet
	// depuis la palette alors qu'on est DÉJÀ sur cette page ne remonte pas le
	// composant, seule l'URL change.
	const searchFromUrl = searchParams.get('q');
	useEffect(() => {
		if (!searchFromUrl) return;
		setFilters((prev) => ({ ...prev, search: searchFromUrl }));
		const next = new URLSearchParams(searchParams);
		next.delete('q');
		setSearchParams(next, { replace: true });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [searchFromUrl]);

	useEffect(() => {
		let cancelled = false;
		Promise.all([BackendAPI42Service.getUserData(), simulationService.load()])
			.then(([data, sim]) => {
				if (cancelled) return;
				setApiProjects(data.allProjects ?? []);
				setSimulation(sim);
			})
			.catch(() => !cancelled && setError('Impossible de charger tes projets.'))
			.finally(() => !cancelled && setLoading(false));
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		try {
			localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
		} catch {
			/* stockage indisponible : on se passe de la mémorisation */
		}
	}, [filters]);

	const rows = useMemo(() => {
		if (rncpLoading || !simulation) return [];
		const percentages: Record<string, number> = {};
		for (const p of simulation.simulatedProjects) percentages[p.projectId] = p.percentage;
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
			simulatedIds: simulation.simulatedProjects.map((p) => p.projectId),
			percentages,
			customProjects: (simulation.customProjects as SimulatorProject[]) ?? [],
			xpBySlug,
			catalog: catalog42,
		});
	}, [rncpData, rncpLoading, apiProjects, simulation, catalog42]);

	const rncpNames = useMemo(() => rncpData.map((r) => r.name), [rncpData]);

	const visible = useMemo(() => {
		const needle = filters.search.trim().toLowerCase();
		const filtered = rows.filter((row) => {
			if (needle && !row.name.toLowerCase().includes(needle)) return false;
			if (!filters.statuses.includes(row.status)) return false;
			if (!filters.sources.includes(row.source)) return false;
			if (filters.rncp && !row.rncpNames.includes(filters.rncp)) return false;
			return true;
		});

		const sign = filters.direction === 'asc' ? 1 : -1;
		const statusOrder = ALL_STATUSES;
		return filtered.sort((a, b) => {
			switch (filters.sort) {
				case 'name':
					return sign * a.name.localeCompare(b.name, 'fr');
				case 'xp':
					return sign * (a.xp - b.xp);
				case 'mark':
					return sign * ((a.finalMark ?? -1) - (b.finalMark ?? -1));
				case 'status':
					return sign * (statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
				default:
					return sign * (new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime());
			}
		});
	}, [rows, filters]);

	const counts = useMemo(() => {
		const out: Record<ProjectStatus, number> = {
			validated: 0,
			failed: 0,
			in_progress: 0,
			simulated: 0,
			not_started: 0,
		};
		for (const row of rows) out[row.status]++;
		return out;
	}, [rows]);

	const toggle = <T,>(list: T[], value: T): T[] =>
		list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

	const filtersAreDefault =
		JSON.stringify({ ...filters, search: '' }) === JSON.stringify({ ...DEFAULT_FILTERS, search: '' }) &&
		filters.search === '';

	return (
		<div className="my-projects-page">
			<Header />

			<div className="my-projects-container">
				<header className="my-projects-header">
					<h1>Mes projets</h1>
					<p className="my-projects-subtitle">
						Tout ton parcours au même endroit : ce que tu as validé, raté, commencé, prévu — et
						ce qu'il te reste.
					</p>
				</header>

				<div className="my-projects-stats">
					{ALL_STATUSES.map((status) => (
						<button
							key={status}
							className={`stat-chip stat-chip--${status}${filters.statuses.includes(status) ? ' active' : ''}`}
							onClick={() => setFilters((f) => ({ ...f, statuses: toggle(f.statuses, status) }))}
							title={`Afficher / masquer les projets « ${STATUS_LABELS[status]} »`}
						>
							<span className="stat-chip__count">{counts[status]}</span>
							{STATUS_LABELS[status]}
						</button>
					))}
				</div>

				<div className="my-projects-filters">
					<input
						type="search"
						className="filter-search"
						placeholder="Rechercher un projet…"
						value={filters.search}
						onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
					/>

					<select
						value={filters.rncp}
						onChange={(e) => setFilters((f) => ({ ...f, rncp: e.target.value }))}
						aria-label="Filtrer par RNCP"
					>
						<option value="">Tous les RNCP</option>
						{rncpNames.map((name) => (
							<option key={name} value={name}>{name}</option>
						))}
					</select>

					<div className="filter-sources">
						{(Object.keys(SOURCE_LABELS) as ProjectSource[]).map((source) => (
							<label key={source} className="filter-checkbox">
								<input
									type="checkbox"
									checked={filters.sources.includes(source)}
									onChange={() => setFilters((f) => ({ ...f, sources: toggle(f.sources, source) }))}
								/>
								{SOURCE_LABELS[source]}
							</label>
						))}
					</div>

					<select
						value={filters.sort}
						onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as SortKey }))}
						aria-label="Trier par"
					>
						{(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
							<option key={key} value={key}>Trier par {SORT_LABELS[key].toLowerCase()}</option>
						))}
					</select>

					<button
						className="filter-direction"
						onClick={() =>
							setFilters((f) => ({ ...f, direction: f.direction === 'asc' ? 'desc' : 'asc' }))
						}
						title={filters.direction === 'asc' ? 'Ordre croissant' : 'Ordre décroissant'}
					>
						{filters.direction === 'asc' ? '↑' : '↓'}
					</button>

					{!filtersAreDefault && (
						<button className="filter-reset" onClick={() => setFilters(DEFAULT_FILTERS)}>
							Réinitialiser
						</button>
					)}
				</div>

				{loading || rncpLoading ? (
					<p className="my-projects-empty">Chargement…</p>
				) : error ? (
					<p className="my-projects-empty">{error}</p>
				) : visible.length === 0 ? (
					<p className="my-projects-empty">Aucun projet ne correspond à ces filtres.</p>
				) : (
					<>
						<p className="my-projects-count">
							{visible.length} projet{visible.length > 1 ? 's' : ''}
						</p>
						<ul className="my-projects-list">
							{visible.map((row) => (
								<ProjectRow key={row.id} row={row} />
							))}
						</ul>
					</>
				)}
			</div>
		</div>
	);
};

const ProjectRow: React.FC<{ row: MyProjectRow }> = ({ row }) => (
	<li className={`project-row project-row--${row.status}`}>
		<span className={`project-row__status status-${row.status}`}>{STATUS_LABELS[row.status]}</span>
		<div className="project-row__main">
			<span className="project-row__name">{row.name}</span>
			{row.rncpNames.length > 0 && (
				<span className="project-row__rncp">{row.rncpNames.join(' · ')}</span>
			)}
			{row.source !== 'rncp' && (
				<span className="project-row__rncp">{SOURCE_LABELS[row.source]}</span>
			)}
		</div>
		<span className="project-row__meta">
			{row.finalMark != null && <span className="project-row__mark">{row.finalMark}%</span>}
			{row.simulatedPercentage != null && (
				<span className="project-row__simulated">simulé à {row.simulatedPercentage}%</span>
			)}
		</span>
		<span className="project-row__xp">{row.xp > 0 ? `${row.xp.toLocaleString('fr-FR')} XP` : '—'}</span>
		<span className="project-row__date">{formatDate(row.date)}</span>
	</li>
);

export default MyProjects;
