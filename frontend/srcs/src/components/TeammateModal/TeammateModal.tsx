import React, { useEffect, useMemo, useState } from 'react';
import {
	isReadOnlyMode,
	simulationService,
	type SimulatedProjectUser,
} from '@/services/simulation.service';
import {
	BackendAPI42Service,
	type ProjectRegistration,
	type ProjectTeamInfo,
} from '@/services/backend-api42.service';
import { useAuth } from '@/contexts/useAuth';
import './TeammateModal.scss';

interface TeammateModalProps {
	isOpen: boolean;
	onClose: () => void;
	projectId: string;
	projectName: string;
	/** Taille d'équipe du projet côté 42, pour l'afficher en sous-titre. */
	teamInfo: ProjectTeamInfo | null;
	/** true si l'utilisateur a ce projet dans SA simulation. */
	isSimulated: boolean;
}

type SortOrder = 'recent' | 'oldest';

/** Statuts d'inscription 42, en français. */
const STATUS_LABELS: Record<string, string> = {
	searching_a_group: 'Cherche un groupe',
	creating_group: 'Constitue son groupe',
	in_progress: 'En cours',
};

function formatDate(iso: string | null): string {
	if (!iso) return '—';
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '—';
	return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** « il y a 3 mois » : ce qui permet de repérer les inscriptions fantômes. */
function formatAge(iso: string | null): string {
	if (!iso) return '';
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return '';
	const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
	if (days < 1) return "aujourd'hui";
	if (days < 30) return `il y a ${days} j`;
	const months = Math.floor(days / 30);
	if (months < 12) return `il y a ${months} mois`;
	const years = Math.floor(months / 12);
	return `il y a ${years} an${years > 1 ? 's' : ''}`;
}

const Avatar: React.FC<{ login: string; imageUrl: string | null }> = ({ login, imageUrl }) =>
	imageUrl ? (
		<img className="teammate-modal__avatar" src={imageUrl} alt={login} />
	) : (
		<div className="teammate-modal__avatar teammate-modal__avatar--placeholder">
			{login[0]?.toUpperCase() ?? '?'}
		</div>
	);

const TeammateModal: React.FC<TeammateModalProps> = ({
	isOpen,
	onClose,
	projectId,
	projectName,
	teamInfo,
	isSimulated,
}) => {
	const { user } = useAuth();
	const myLogin = user?.login ?? null;
	const readOnly = isReadOnlyMode();

	const [simUsers, setSimUsers] = useState<SimulatedProjectUser[]>([]);
	const [registrations, setRegistrations] = useState<ProjectRegistration[]>([]);
	const [registrationsAt, setRegistrationsAt] = useState<string | null>(null);
	const [registrationsUnavailable, setRegistrationsUnavailable] = useState(false);
	const [loadingSim, setLoadingSim] = useState(false);
	const [loadingReg, setLoadingReg] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [search, setSearch] = useState('');
	const [sort, setSort] = useState<SortOrder>('recent');
	const [hideTaken, setHideTaken] = useState(false);
	const [hasTeam, setHasTeam] = useState(false);
	const [teamError, setTeamError] = useState<string | null>(null);

	useEffect(() => {
		const val = isOpen ? 'hidden' : '';
		document.body.style.overflow = val;
		document.documentElement.style.overflow = val;
		return () => {
			document.body.style.overflow = '';
			document.documentElement.style.overflow = '';
		};
	}, [isOpen]);

	// Colonne « CalculatorGCC » : les personnes qui ont simulé le projet chez nous.
	useEffect(() => {
		if (!isOpen) return;
		let cancelled = false;

		setSimUsers([]);
		setError(null);
		setLoadingSim(true);
		simulationService
			.getProjectUsers(projectId)
			.then((users) => {
				if (cancelled) return;
				setSimUsers(users);
				// Mon propre état « j'ai ma team » vient de la même liste.
				setHasTeam(users.find((u) => u.login === myLogin)?.hasTeam ?? false);
			})
			.catch(() => !cancelled && setError('Impossible de charger les utilisateurs'))
			.finally(() => !cancelled && setLoadingSim(false));

		return () => {
			cancelled = true;
		};
	}, [isOpen, projectId, myLogin]);

	// Colonne « Intra 42 » : les personnes réellement inscrites sur le projet.
	// `teamInfo.id` est l'identifiant 42 du projet ; sans lui, pas d'appel.
	useEffect(() => {
		if (!isOpen || !teamInfo) {
			setRegistrations([]);
			return;
		}
		let cancelled = false;

		setRegistrations([]);
		setRegistrationsUnavailable(false);
		setLoadingReg(true);
		BackendAPI42Service.getProjectRegistrations(teamInfo.id)
			.then((res) => {
				if (cancelled) return;
				setRegistrations(res.users);
				setRegistrationsAt(res.fetchedAt);
				setRegistrationsUnavailable(!res.available);
			})
			.catch(() => !cancelled && setRegistrationsUnavailable(true))
			.finally(() => !cancelled && setLoadingReg(false));

		return () => {
			cancelled = true;
		};
	}, [isOpen, teamInfo]);

	const toggleHasTeam = async () => {
		const next = !hasTeam;
		setHasTeam(next);
		setTeamError(null);
		const ok = await simulationService.setProjectTeam(projectId, next);
		if (!ok) {
			setHasTeam(!next);
			setTeamError("Ajoute d'abord ce projet à ta simulation pour signaler ton équipe.");
			return;
		}
		// Se refléter tout de suite dans la liste, sans recharger.
		setSimUsers((prev) => prev.map((u) => (u.login === myLogin ? { ...u, hasTeam: next } : u)));
	};

	const needle = search.trim().toLowerCase();
	const byDate = <T,>(list: T[], date: (item: T) => string | null) =>
		[...list].sort((a, b) => {
			const da = new Date(date(a) ?? 0).getTime();
			const db = new Date(date(b) ?? 0).getTime();
			return sort === 'recent' ? db - da : da - db;
		});

	const visibleSimUsers = useMemo(
		() =>
			byDate(
				simUsers.filter(
					(u) => u.login.toLowerCase().includes(needle) && (!hideTaken || !u.hasTeam)
				),
				(u) => u.simulatedAt
			),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[simUsers, needle, hideTaken, sort]
	);

	const visibleRegistrations = useMemo(
		() => byDate(registrations.filter((u) => u.login.toLowerCase().includes(needle)), (u) => u.registeredAt),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[registrations, needle, sort]
	);

	if (!isOpen) return null;

	const teamLabel = teamInfo
		? teamInfo.solo
			? 'Projet solo'
			: teamInfo.groupMin != null && teamInfo.groupMax != null
				? `Groupe de ${teamInfo.groupMin} à ${teamInfo.groupMax}`
				: 'Projet de groupe'
		: null;

	return (
		<div className="teammate-modal-overlay" onClick={onClose}>
			<div className="teammate-modal teammate-modal--wide" onClick={(e) => e.stopPropagation()}>
				<div className="teammate-modal__header">
					<h3 className="teammate-modal__title">Trouver des teammates</h3>
					<p className="teammate-modal__project">
						{projectName}
						{teamLabel && <span className="teammate-modal__team-size"> · {teamLabel}</span>}
					</p>
					<button className="teammate-modal__close" onClick={onClose}>×</button>
				</div>

				<div className="teammate-modal__toolbar">
					{!readOnly && (
						<label
							className={`teammate-modal__toggle${isSimulated ? '' : ' teammate-modal__toggle--disabled'}`}
							title={isSimulated ? undefined : 'Simule ce projet pour apparaître dans la liste'}
						>
							<input
								type="checkbox"
								checked={hasTeam}
								disabled={!isSimulated}
								onChange={toggleHasTeam}
							/>
							J'ai déjà ma team
						</label>
					)}
					<label className="teammate-modal__toggle">
						<input
							type="checkbox"
							checked={hideTaken}
							onChange={() => setHideTaken((v) => !v)}
						/>
						Masquer ceux qui ont une team
					</label>
					<select
						className="teammate-modal__sort"
						value={sort}
						onChange={(e) => setSort(e.target.value as SortOrder)}
						aria-label="Trier"
					>
						<option value="recent">Plus récents d'abord</option>
						<option value="oldest">Plus anciens d'abord</option>
					</select>
				</div>
				{teamError && <p className="teammate-modal__error">{teamError}</p>}

				<div className="teammate-modal__body">
					<div className="teammate-modal__search-bar">
						<input
							className="teammate-modal__search-input"
							type="text"
							placeholder="Rechercher un login..."
							value={search}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
							autoFocus
							autoComplete="off"
							name="teammate-search"
							id="teammate-search"
							inputMode="search"
							aria-label="Rechercher un login"
						/>
					</div>

					<div className="teammate-modal__columns">
						<section className="teammate-modal__section">
							<h4 className="teammate-modal__section-title">
								Via CalculatorGCC
								{!loadingSim && <span className="teammate-modal__count">{visibleSimUsers.length}</span>}
							</h4>
							<p className="teammate-modal__hint">Ont ajouté ce projet à leur simulation.</p>
							{loadingSim ? (
								<p className="teammate-modal__loading">Chargement...</p>
							) : error ? (
								<p className="teammate-modal__error">{error}</p>
							) : visibleSimUsers.length === 0 ? (
								<p className="teammate-modal__empty">Personne n'a simulé ce projet</p>
							) : (
								<ul className="teammate-modal__list">
									{visibleSimUsers.map((u) => (
										<li key={u.userId42} className="teammate-modal__item">
											<Avatar login={u.login} imageUrl={u.imageUrl} />
											<div className="teammate-modal__item-main">
												<a
													className="teammate-modal__login"
													href={`https://profile.intra.42.fr/users/${u.login}`}
													target="_blank"
													rel="noopener noreferrer"
												>
													{u.login}
												</a>
												<span className="teammate-modal__meta">
													{formatDate(u.simulatedAt)} · {formatAge(u.simulatedAt)}
												</span>
											</div>
											{u.hasTeam && <span className="teammate-modal__badge">A sa team</span>}
										</li>
									))}
								</ul>
							)}
						</section>

						<section className="teammate-modal__section">
							<h4 className="teammate-modal__section-title">
								Inscrits sur l'intra
								{!loadingReg && <span className="teammate-modal__count">{visibleRegistrations.length}</span>}
							</h4>
							<p className="teammate-modal__hint">
								Inscription en cours sur ton campus
								{registrationsAt && ` · données du ${formatDate(registrationsAt)}`}
							</p>
							{loadingReg ? (
								<p className="teammate-modal__loading">Chargement...</p>
							) : registrationsUnavailable ? (
								<p className="teammate-modal__empty">
									Campus inconnu : reconnecte-toi pour voir les inscrits.
								</p>
							) : !teamInfo ? (
								<p className="teammate-modal__empty">Projet introuvable côté intra 42</p>
							) : visibleRegistrations.length === 0 ? (
								<p className="teammate-modal__empty">Personne n'est inscrit sur ce projet</p>
							) : (
								<ul className="teammate-modal__list">
									{visibleRegistrations.map((u) => (
										<li key={u.userId42} className="teammate-modal__item">
											<Avatar login={u.login} imageUrl={u.imageUrl} />
											<div className="teammate-modal__item-main">
												<a
													className="teammate-modal__login"
													href={`https://profile.intra.42.fr/users/${u.login}`}
													target="_blank"
													rel="noopener noreferrer"
												>
													{u.login}
												</a>
												<span className="teammate-modal__meta">
													{formatDate(u.registeredAt)} · {formatAge(u.registeredAt)}
												</span>
											</div>
											<span className="teammate-modal__badge teammate-modal__badge--status">
												{STATUS_LABELS[u.status] ?? u.status}
											</span>
										</li>
									))}
								</ul>
							)}
						</section>
					</div>
				</div>
			</div>
		</div>
	);
};

export default TeammateModal;
