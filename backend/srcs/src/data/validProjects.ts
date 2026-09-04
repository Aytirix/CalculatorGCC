import { RNCP_REFERENTIAL } from './rncpReferential.js';

/**
 * Identifiants de projets acceptés dans une simulation.
 *
 * Ils sont DÉRIVÉS du référentiel RNCP plutôt que recopiés : la liste écrite à
 * la main avait déjà divergé (« ft-ssl-md5 » y manquait, ce qui faisait rejeter
 * toute la sauvegarde de quiconque simulait ce projet). Ajouter un projet au
 * référentiel suffit désormais à le rendre valide.
 */

function collectIds(): { projects: Set<string>; subProjects: Set<string> } {
	const projects = new Set<string>();
	const subProjects = new Set<string>();
	for (const rncp of RNCP_REFERENTIAL) {
		for (const category of rncp.categories) {
			for (const project of category.projects) {
				projects.add(project.id);
				for (const sub of project.subProjects ?? []) subProjects.add(sub.id);
			}
		}
	}
	return { projects, subProjects };
}

const { projects, subProjects } = collectIds();

export const VALID_PROJECT_IDS = projects;
export const VALID_SUB_PROJECT_IDS = subProjects;

/**
 * Projet simulé depuis le Holy Graph qui n'existe pas dans le référentiel RNCP
 * (tronc commun, examens, projets de cursus secondaires) : `42-<id du projet 42>`.
 * Son XP est celui remonté par l'API 42, stocké à côté dans `customProjects`.
 */
const GRAPH_PROJECT_ID_RE = /^42-\d+$/;

/**
 * Vérifie si un project ID est valide (projet du référentiel, custom, ou projet
 * 42 simulé depuis le Holy Graph)
 */
export const isValidProjectId = (id: string): boolean => {
	return VALID_PROJECT_IDS.has(id) || id.startsWith('custom-') || GRAPH_PROJECT_ID_RE.test(id);
};

/**
 * Vérifie si un sub-project ID est valide
 */
export const isValidSubProjectId = (id: string): boolean => {
	return VALID_SUB_PROJECT_IDS.has(id);
};
