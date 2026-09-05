import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { simulationService, type UserSearchResult } from '@/services/simulation.service';
import { useRncpData } from '@/contexts/useRncpData';
import { useProjectTeams } from '@/contexts/useProjectTeams';
import { normalizeProjectSlug } from '@/utils/projectMatcher';
import { useViewingUser } from '@/contexts/useViewingUser';
import './CommandPalette.scss';

/**
 * Recherche universelle, ouverte au clic sur la loupe ou par Ctrl/⌘ + K.
 *
 * Elle remplace le champ de recherche qui occupait le milieu de la barre : on y
 * cherche indifféremment une page, un projet ou un utilisateur, au lieu d'avoir
 * un champ dédié aux seuls comptes.
 */

interface PaletteItem {
	id: string;
	kind: 'page' | 'project' | 'user';
	label: string;
	hint?: string;
	imageUrl?: string | null;
	disabled?: boolean;
	run: () => void;
}

interface CommandPaletteProps {
	isOpen: boolean;
	onClose: () => void;
}

const PAGES: { label: string; path: string; hint: string }[] = [
	{ label: 'Projets', path: '/dashboard', hint: 'Simulateur RNCP' },
	{ label: 'Mes projets', path: '/my-projects', hint: 'Tout mon parcours' },
	{ label: 'Holy Graph', path: '/holy-graph', hint: 'Carte des projets' },
	{ label: 'Calendrier', path: '/calendar', hint: 'Planification' },
	{ label: 'Conso API', path: '/api-usage', hint: 'Usage de l’API 42' },
	{ label: 'Paramètres', path: '/settings', hint: 'Mon compte' },
];

const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
	const navigate = useNavigate();
	const { rncpData } = useRncpData();
	const { allProjects: catalog42 } = useProjectTeams();
	const { setViewingUser } = useViewingUser();

	const [query, setQuery] = useState('');
	const [users, setUsers] = useState<UserSearchResult[]>([]);
	const [highlight, setHighlight] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!isOpen) return;
		setQuery('');
		setUsers([]);
		setHighlight(0);
		// Le focus doit attendre que la boîte soit montée.
		const id = setTimeout(() => inputRef.current?.focus(), 30);
		return () => clearTimeout(id);
	}, [isOpen]);

	// Recherche d'utilisateurs : elle passe par le serveur, donc différée.
	useEffect(() => {
		if (!isOpen) return;
		if (searchTimer.current) clearTimeout(searchTimer.current);
		const needle = query.trim();
		if (needle.length === 0) {
			setUsers([]);
			return;
		}
		searchTimer.current = setTimeout(() => {
			simulationService
				.searchUsers(needle)
				.then(setUsers)
				.catch(() => setUsers([]));
		}, 250);
		return () => {
			if (searchTimer.current) clearTimeout(searchTimer.current);
		};
	}, [query, isOpen]);

	/**
	 * TOUS les projets cherchables : ceux du référentiel RNCP d'abord (on connaît
	 * leur XP exact), puis le reste du catalogue du campus — tronc commun,
	 * examens, projets d'autres cursus. Chercher « libft » doit fonctionner même
	 * si ce projet ne compte dans aucun RNCP.
	 */
	const projects = useMemo(() => {
		const seen = new Map<string, { id: string; name: string; xp: number }>();
		const byName = new Set<string>();

		for (const rncp of rncpData) {
			for (const category of rncp.categories) {
				for (const project of category.projects) {
					if (seen.has(project.id)) continue;
					seen.set(project.id, { id: project.id, name: project.name, xp: project.xp });
					byName.add(normalizeProjectSlug(project.name));
				}
			}
		}

		for (const project of catalog42) {
			const key = normalizeProjectSlug(project.name);
			if (!key || byName.has(key)) continue;
			byName.add(key);
			seen.set(`42:${project.id}`, { id: `42:${project.id}`, name: project.name, xp: project.xp });
		}

		return [...seen.values()];
	}, [rncpData, catalog42]);

	const items = useMemo((): PaletteItem[] => {
		const needle = query.trim().toLowerCase();
		const out: PaletteItem[] = [];

		for (const page of PAGES) {
			if (needle && !page.label.toLowerCase().includes(needle)) continue;
			out.push({
				id: `page:${page.path}`,
				kind: 'page',
				label: page.label,
				hint: page.hint,
				run: () => navigate(page.path),
			});
		}

		if (needle) {
			for (const project of projects.filter((p) => p.name.toLowerCase().includes(needle)).slice(0, 8)) {
				out.push({
					id: `project:${project.id}`,
					kind: 'project',
					label: project.name,
					hint: project.xp > 0 ? `${project.xp.toLocaleString('fr-FR')} XP` : undefined,
					// La liste « Mes projets » sait tout dire d'un projet : statut,
					// note, XP, RNCP concernés. C'est la bonne destination.
					run: () => navigate(`/my-projects?q=${encodeURIComponent(project.name)}`),
				});
			}

			for (const user of users.slice(0, 8)) {
				out.push({
					id: `user:${user.userId42}`,
					kind: 'user',
					label: user.login,
					hint: user.isPublic
						? [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined
						: 'Profil privé',
					imageUrl: user.imageUrl,
					disabled: !user.isPublic,
					run: () =>
						setViewingUser({
							userId42: user.userId42,
							login: user.login,
							firstName: user.firstName,
							lastName: user.lastName,
							imageUrl: user.imageUrl,
						}),
				});
			}
		}

		return out;
	}, [query, projects, users, navigate, setViewingUser]);

	useEffect(() => {
		setHighlight((h) => Math.min(h, Math.max(0, items.length - 1)));
	}, [items.length]);

	const runItem = useCallback(
		(item: PaletteItem) => {
			if (item.disabled) return;
			onClose();
			item.run();
		},
		[onClose]
	);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setHighlight((h) => (items.length === 0 ? 0 : (h + 1) % items.length));
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setHighlight((h) => (items.length === 0 ? 0 : (h - 1 + items.length) % items.length));
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const item = items[highlight];
			if (item) runItem(item);
		} else if (e.key === 'Escape') {
			onClose();
		}
	};

	if (!isOpen) return null;

	const KIND_LABELS: Record<PaletteItem['kind'], string> = {
		page: 'Page',
		project: 'Projet',
		user: 'Utilisateur',
	};

	return (
		<div className="command-palette-overlay" onMouseDown={onClose}>
			<div
				className="command-palette"
				onMouseDown={(e) => e.stopPropagation()}
				role="dialog"
				aria-label="Recherche"
			>
				<div className="command-palette__field">
					<span className="command-palette__icon" aria-hidden="true">⌕</span>
					<input
						ref={inputRef}
						type="text"
						placeholder="Rechercher une page, un projet, un utilisateur…"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={handleKeyDown}
						aria-label="Rechercher"
					/>
					<kbd>Esc</kbd>
				</div>

				{items.length === 0 ? (
					<p className="command-palette__empty">
						{query.trim() ? 'Aucun résultat' : 'Tape pour chercher…'}
					</p>
				) : (
					<ul className="command-palette__list">
						{items.map((item, index) => (
							<li key={item.id}>
								<button
									type="button"
									className={`command-palette__item${index === highlight ? ' active' : ''}${item.disabled ? ' disabled' : ''}`}
									onMouseEnter={() => setHighlight(index)}
									onClick={() => runItem(item)}
								>
									{item.kind === 'user' && item.imageUrl ? (
										<img className="command-palette__avatar" src={item.imageUrl} alt="" />
									) : (
										<span className={`command-palette__kind kind-${item.kind}`}>
											{KIND_LABELS[item.kind]}
										</span>
									)}
									<span className="command-palette__label">{item.label}</span>
									{item.hint && <span className="command-palette__hint">{item.hint}</span>}
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
};

export default CommandPalette;
