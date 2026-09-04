import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { BackendAPI42Service, type ProjectTeamInfo } from '@/services/backend-api42.service';
import { normalizeProjectSlug } from '@/utils/projectMatcher';
import { useAuth } from '@/contexts/useAuth';

/**
 * Taille d'équipe des projets, telle que 42 la définit pour le campus de
 * l'utilisateur.
 *
 * Sert à ne proposer la recherche de teammates que sur les projets réellement
 * faisables en groupe : nos données RNCP, elles, ne portent pas cette
 * information. Une seule requête par session, le backend servant ensuite son
 * cache mensuel des sessions du campus.
 */

export interface ProjectTeamsContextValue {
	/** Info d'équipe d'un projet de nos données RNCP, ou `null` si inconnue. */
	getTeamInfo: (project: { id: string; name: string; slug?: string }) => ProjectTeamInfo | null;
	/** true tant que la donnée n'est pas arrivée : on n'affiche rien plutôt que faux. */
	loading: boolean;
}

export const ProjectTeamsContext = createContext<ProjectTeamsContextValue>({
	getTeamInfo: () => null,
	loading: true,
});

export const ProjectTeamsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [projects, setProjects] = useState<ProjectTeamInfo[] | null>(null);
	const { isAuthenticated } = useAuth();

	useEffect(() => {
		// Avant la connexion, l'appel partirait sans jeton et déclencherait une
		// déconnexion (401) : on attend d'être authentifié.
		if (!isAuthenticated) return;
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;

		const poll = async () => {
			try {
				const res = await BackendAPI42Service.getProjectTeams();
				if (cancelled) return;
				if (res.loading) {
					// Le détail des sessions du campus se récupère en tâche de fond
					// côté serveur : on repasse dans un instant.
					timer = setTimeout(poll, 5000);
					return;
				}
				setProjects(res.projects);
			} catch {
				if (!cancelled) setProjects([]);
			}
		};

		poll();
		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [isAuthenticated]);

	/**
	 * Index nom/slug normalisé → projet 42.
	 *
	 * Les slugs de l'API portent souvent un préfixe de cursus (`42cursus-kfs-1`)
	 * absent de nos données. On indexe donc les deux formes, en donnant la
	 * priorité aux projets du tronc commun : deux projets peuvent partager un nom
	 * (`42cursus-push_swap` en solo et `42next-push_swap` en duo) et c'est celui
	 * du cursus principal qu'on veut.
	 */
	const index = useMemo(() => {
		const map = new Map<string, ProjectTeamInfo>();
		if (!projects) return map;

		const rank = (slug: string) => {
			if (slug.startsWith('42cursus-')) return 0;
			return slug.includes('-') ? 2 : 1;
		};
		const ordered = [...projects].sort((a, b) => rank(a.slug) - rank(b.slug));

		for (const project of ordered) {
			for (const key of [project.slug.replace(/^42cursus-/, ''), project.slug, project.name]) {
				const normalized = normalizeProjectSlug(key);
				if (normalized && !map.has(normalized)) map.set(normalized, project);
			}
		}
		return map;
	}, [projects]);

	const getTeamInfo = useCallback(
		(project: { id: string; name: string; slug?: string }) => {
			for (const key of [project.slug, project.id, project.name]) {
				if (!key) continue;
				const found = index.get(normalizeProjectSlug(key));
				if (found) return found;
			}
			return null;
		},
		[index]
	);

	return (
		<ProjectTeamsContext.Provider value={{ getTeamInfo, loading: projects === null }}>
			{children}
		</ProjectTeamsContext.Provider>
	);
};
