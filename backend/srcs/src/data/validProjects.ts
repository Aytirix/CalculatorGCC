import { getReferential, getReferentialVersion } from '../services/referentialStore.js';

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
	for (const rncp of getReferential()) {
		for (const category of rncp.categories) {
			for (const project of category.projects) {
				projects.add(project.id);
				for (const sub of project.subProjects ?? []) subProjects.add(sub.id);
			}
		}
	}
	return { projects, subProjects };
}

/**
 * Un même projet est déclaré dans PLUSIEURS catégories — `darkly` apparaît six
 * fois — et chaque déclaration porte son propre `retired` et son propre
 * `slug42`. Rien n'oblige ces copies à s'accorder : marquer une seule ligne
 * afficherait le badge « hors référentiel » sur une carte et pas sur les cinq
 * autres, pour le même projet, dans la même session. Pire, les vues qui
 * dédoublonnent par identifiant (« Mes projets », le Holy Graph) retiendraient
 * arbitrairement l'une ou l'autre version selon l'ordre de déclaration.
 *
 * Retirer un projet d'UNE catégorie sans le retirer des autres reste un cas
 * légitime : on ne peut donc pas l'interdire. On le signale, pour qu'un oubli
 * ne passe pas inaperçu — c'est exactement le mode de défaillance silencieux
 * qu'on veut éviter.
 */
function reportIncoherentDeclarations(): void {
	const seen = new Map<string, { retired: boolean; slug42: string | null; where: string }[]>();
	for (const rncp of getReferential()) {
		for (const category of rncp.categories) {
			const all = [
				...category.projects,
				...category.projects.flatMap((p) => p.subProjects ?? []),
			];
			for (const project of all) {
				const list = seen.get(project.id) ?? [];
				list.push({
					retired: project.retired === true,
					slug42: project.slug42,
					where: `${rncp.id}/${category.id}`,
				});
				seen.set(project.id, list);
			}
		}
	}

	for (const [id, declarations] of seen) {
		if (declarations.length < 2) continue;

		const retiredIn = declarations.filter((d) => d.retired).map((d) => d.where);
		if (retiredIn.length > 0 && retiredIn.length < declarations.length) {
			console.warn(
				`[Référentiel] « ${id} » est marqué retired dans ${retiredIn.join(', ')} ` +
					`mais pas dans ses ${declarations.length - retiredIn.length} autre(s) déclaration(s). ` +
					`Volontaire ? Sinon le badge « hors référentiel » n'apparaîtra que par endroits.`
			);
		}

		const slugs = new Set(declarations.map((d) => d.slug42));
		if (slugs.size > 1) {
			console.warn(
				`[Référentiel] « ${id} » porte des slug42 différents selon la catégorie : ` +
					`${[...slugs].map((v) => String(v)).join(', ')}. La correspondance avec l'API 42 ` +
					`sera incohérente d'un RNCP à l'autre.`
			);
		}
	}
}

/**
 * Les identifiants sont recalculés quand le référentiel change de version.
 *
 * Ils étaient figés à l'import : un projet ajouté depuis le panneau admin
 * n'aurait été accepté qu'après un redémarrage, et l'utilisateur qui le simulait
 * aurait vu son entrée écartée sans comprendre. On mémorise donc le résultat
 * PAR VERSION — reconstruire deux `Set` à chaque projet de chaque sauvegarde
 * serait du gaspillage, ne jamais les reconstruire serait un bug.
 */
let cache: { version: number; projects: Set<string>; subProjects: Set<string> } | null = null;

function ids(): { projects: Set<string>; subProjects: Set<string> } {
	const version = getReferentialVersion();
	if (!cache || cache.version !== version) {
		cache = { version, ...collectIds() };
		reportIncoherentDeclarations();
	}
	return cache;
}

/** Les identifiants du référentiel courant. Recalculés à chaque nouvelle version. */
export const VALID_PROJECT_IDS = {
	has: (id: string) => ids().projects.has(id),
	get size() {
		return ids().projects.size;
	},
};
export const VALID_SUB_PROJECT_IDS = {
	has: (id: string) => ids().subProjects.has(id),
	get size() {
		return ids().subProjects.size;
	},
};

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
