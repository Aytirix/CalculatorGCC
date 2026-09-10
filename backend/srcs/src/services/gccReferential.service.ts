import { API42Service } from './api42.service.js';
import { simulationRepository } from '../db/simulationRepository.js';
import { type RncpReferentialEntry } from '../data/rncpReferential.js';
import { getReferential, getReferentialVersion } from './referentialStore.js';

/**
 * Compare notre référentiel RNCP à celui de GCC, la source de vérité de l'école.
 *
 * GCC (https://gcc.42.fr) publie les règles réelles des quatre RNCP. Notre
 * `rncpReferential.ts` en est une transcription faite à la main : elle dérive dès
 * que l'école ajoute, retire ou déplace un projet, et rien ne nous le signale.
 *
 * Ce service ne MODIFIE rien, et c'est délibéré. Ajouter une ligne au référentiel
 * est sans danger ; en RETIRER une ne l'est pas : `validProjects.ts` en dérive
 * les identifiants acceptés, et `simulationRepository` rejette la sauvegarde
 * ENTIÈRE dès qu'un identifiant inconnu s'y trouve. Un utilisateur ayant simulé
 * un projet supprimé du référentiel garde cet identifiant en base, le renvoie à
 * chaque enregistrement, et se retrouve bloqué. D'où `simulatedBy` sur chaque
 * projet en trop : le rapport dit combien de personnes seraient touchées, pour
 * qu'un humain décide en connaissance de cause.
 *
 * ─── LE JETON ─────────────────────────────────────────────────────────────────
 *
 * GCC s'authentifie via l'OIDC de l'école (auth.42.fr, royaume « students-42 »),
 * sans rapport avec l'OAuth de l'intra utilisé par l'application : nos
 * identifiants applicatifs ne permettent PAS d'appeler cette API. Il faut un
 * jeton de session pris dans le navigateur, valable 5 minutes. Il n'est ni
 * stocké ni journalisé : il traverse ce service et disparaît.
 */

const GCC = 'https://gcc.42.fr/api/v1/student';

/** Cursus « 42cursus », celui dont les règles RNCP dépendent. */
const RNCP_CURSUS_ID = 21;

/** Plafond de racines analysées, pour borner le temps total de la comparaison. */
const MAX_ROOTS = 6;

// ─── Ce que GCC renvoie ───────────────────────────────────────────────────────

interface GccProject {
	id: number;
	name: string;
	tags?: { name: string }[];
	children?: GccProject[];
}

interface GccRule {
	id: number;
	name: string;
	type:
		| 'composite_validate'
		| 'projects_validate'
		| 'xp_validate'
		| 'level_validate'
		| 'events_validate';
	condition: {
		rules?: GccRule[];
		/** projects_validate : nombre de projets exigés dans le tag. */
		projects?: number;
		/** xp_validate : le seuil d'XP s'appelle « experiences » chez GCC. */
		experiences?: number;
		level?: number;
		events?: number;
		target_project_tags?: { name: string }[];
		target_project?: GccProject[];
	};
}

// ─── Ce que ce service rend ───────────────────────────────────────────────────

/**
 * Un seuil sur lequel GCC et nous ne sommes pas d'accord.
 *
 * `gcc: null` veut dire que GCC n'a PLUS de règle pour ce seuil alors que nous
 * l'exigeons encore. C'est un écart à part entière, pas une absence d'écart :
 * le confondre avec « d'accord » rendait invisibles tous les retraits de
 * l'école — précisément la dérive que ce service existe pour détecter.
 */
export interface ThresholdDiff {
	label: string;
	gcc: number | null;
	ours: number;
}

/** Un projet à ajouter, avec la ligne prête à coller dans le référentiel. */
export interface MissingProject {
	/** Le nom tel que GCC l'écrit. */
	name: string;
	/** L'identifiant qu'aurait ce projet chez nous — la cible de l'ajout. */
	projectId: string;
	/** Le slug 42 retenu, ou `null` s'il n'a pas pu être établi. */
	slug42: string | null;
	/** `{ id: '…', slug42: '…' },` — indentation du fichier comprise. */
	line: string;
	/** Le slug 42 n'a pas pu être établi : la ligne porte `slug42: null`. */
	slugUnknown: boolean;
}

/** Un projet de chez nous que GCC ne compte pas dans cette catégorie. */
export interface ExtraProject {
	id: string;
	/**
	 * Le nom lisible, quand on peut le retrouver. Depuis que nos identifiants sont
	 * ceux de 42 (`42-2522`), l'identifiant seul ne dit plus de QUEL projet on
	 * parle : l'écran demanderait de supprimer une ligne que personne ne peut
	 * reconnaître. `null` si aucune source ne le donne.
	 */
	name: string | null;
	/** GCC le connaît mais l'a retiré du cursus : c'est une suppression à faire. */
	retired: boolean;
	/**
	 * Combien d'utilisateurs ont ce projet dans leur simulation. Retirer sa ligne
	 * du référentiel les empêcherait de sauvegarder : au-dessus de zéro, la
	 * suppression n'est pas une opération anodine.
	 */
	simulatedBy: number;
}

export interface CategoryDiff {
	/** Notre nom de catégorie, tel qu'affiché dans l'application. */
	name: string;
	/** Notre identifiant de catégorie, celui où coller les lignes. */
	categoryId: string;
	/**
	 * L'entrée de notre référentiel qui PORTE cette catégorie — pas forcément
	 * celle de la section : une catégorie commune devenue divergente s'affiche
	 * sous chaque RNCP alors qu'elle appartient à « rncp-global ». C'est cet
	 * identifiant que le panneau vise pour appliquer une modification.
	 */
	ownerId: string;
	/** Le tag GCC d'où viennent ces projets. */
	tag: string;
	thresholds: ThresholdDiff[];
	missing: MissingProject[];
	extra: ExtraProject[];
}

export interface SectionDiff {
	title: string;
	/**
	 * L'entrée de NOTRE référentiel visée par cette section. C'est elle que le
	 * panneau vise pour appliquer une modification : sans elle, l'interface
	 * devrait la deviner à partir du titre affiché, et se tromperait au premier
	 * renommage côté GCC.
	 */
	entryId: string | null;
	/** « règle 14 ↔ rncp6-web-mobile », ou rien pour la section commune. */
	subtitle: string | null;
	thresholds: ThresholdDiff[];
	categories: CategoryDiff[];
	/** Anomalies de structure : catégorie absente, tag inconnu, RNCP non reconnu. */
	warnings: string[];
}

export interface GccComparison {
	/** Nombre de RNCP effectivement analysés (4 attendus). */
	rncpCount: number;
	/** Section « Commun aux 4 RNCP », absente si le commun a divergé. */
	common: SectionDiff | null;
	rncps: SectionDiff[];
	/** Avertissements globaux : catalogue indisponible, commun divergent… */
	warnings: string[];
	/** Faux quand le référentiel est aligné sur GCC de bout en bout. */
	anyDiff: boolean;
}

// ─── Reconnaissance ───────────────────────────────────────────────────────────

/**
 * Correspondance entre les tags GCC et nos catégories. C'est la clé de jointure
 * du rapport : sans elle, on ne peut comparer ni les seuils ni les listes de
 * projets. Un tag GCC inconnu est signalé plutôt qu'ignoré — c'est exactement le
 * signal qu'on cherche quand l'école remanie son référentiel.
 *
 * Les tags « … XP » désignent le même domaine avec une liste plus large (les
 * modules de piscine y comptent pour l'XP mais pas comme projets validés) : ils
 * pointent donc vers la même catégorie.
 */
const TAG_TO_CATEGORY: Record<string, string> = {
	Suite: 'suite-global',
	Group: 'group-projects',
	Web: 'web',
	'Web XP': 'web',
	Mobile: 'mobile',
	'Mobile XP': 'mobile',
	'Object Oriented Programming': 'oop',
	'Object Oriented Programming XP': 'oop',
	'Functional Programming': 'functional',
	'Functional Programming XP': 'functional',
	'Imperative Programming': 'imperative',
	'Imperative Programming XP': 'imperative',
	'Unix & Kernel': 'unix-kernel',
	'Unix & Kernel XP': 'unix-kernel',
	'System Administration': 'system-admin',
	'System Administration XP': 'system-admin',
	Security: 'security',
	'Security XP': 'security',
	'Web - Database': 'web-database',
	'Web - Database XP': 'web-database',
	'Artificial Intelligence': 'artificial-intelligence',
	'Artificial Intelligence XP': 'artificial-intelligence',
	// Les projets « Work » sont les expériences professionnelles : chez nous ce
	// n'est pas une catégorie de projets mais `requiredProfessionalExperience`.
	Work: 'professional-experience',
};

/** Nom de la règle racine GCC → identifiant de notre entrée de référentiel. */
const RNCP_TO_ENTRY: Record<string, string> = {
	'RNCP 6 - Option 1': 'rncp6-web-mobile',
	'RNCP 6 - Option 2': 'rncp6-applicatif',
	'RNCP 7 - Option 1': 'rncp7-system-network',
	'RNCP 7 - Option 2': 'rncp7-database-data',
};

/** Les racines RNCP : les composites dont le nom s'arrête à l'option. */
const RNCP_ROOT_NAME = /^RNCP \d+ - Option \d+$/;

/**
 * Marqueur `[deprecated]` de GCC, avec une casse qui varie selon les projets
 * (`[deprecated]`, `[Deprecated]`, `[DEPRECATED]`).
 */
const DEPRECATED = /\[\s*deprecated\s*\]/i;

/**
 * Anciennes versions d'un projet, que GCC signale par un « Old » collé au nom :
 * `Old-IRC`, `Old-LibftASM`, `Electronics-Old`. On exige que « old » soit un mot
 * entier — sinon un futur « Goldberg » ou « Threshold » serait écarté à tort.
 */
const OLD = /(^|[\s_-])old([\s_-]|$)/i;

/** Un projet que l'école ne fait plus passer : hors du référentiel. */
function isRetired(name: string): boolean {
	return DEPRECATED.test(name) || OLD.test(name);
}

/**
 * Même projet, plusieurs écritures : GCC renvoie « RT » et « rt », « HumanGL » et
 * « humangl », « Doom Nukem » et « doom_nukem ». On rapproche sur une forme
 * réduite pour ne pas signaler ces variantes comme des écarts.
 */
function normalize(name: string): string {
	return (
		name
			.replace(DEPRECATED, '')
			.toLowerCase()
			// Nos slugs 42 portent le préfixe du cursus (`42cursus-bomberman`) que GCC
			// n'utilise pas : sans ce retrait, presque tous nos projets ressortiraient
			// comme absents de GCC.
			.replace(/^42cursus-/, '')
			.replace(/[\s_'’-]+/g, '')
			.trim()
	);
}

// ─── Lecture de GCC ───────────────────────────────────────────────────────────

/** Erreur portant un statut HTTP, pour que la route admin réponde en conséquence. */
export class GccError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
		this.name = 'GccError';
	}
}

async function get<T>(path: string, token: string): Promise<T> {
	let res: Response;
	try {
		res = await fetch(`${GCC}${path}`, {
			headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
			// Cinq appels s'enchaînent (les règles + les quatre RNCP) : à 30 s chacun,
			// le pire cas dépassait le timeout du client, qui abandonnait avant que
			// le serveur ait répondu quoi que ce soit.
			signal: AbortSignal.timeout(20_000),
		});
	} catch {
		// Le message d'une erreur réseau ne dit rien d'utile ici et pourrait porter
		// l'URL complète : on reste sur une formulation stable.
		throw new GccError('GCC est injoignable (réseau ou délai dépassé).', 502);
	}
	if (res.status === 401 || res.status === 403) {
		throw new GccError(
			'GCC a refusé le jeton : il est expiré ou invalide. Les jetons ne durent que 5 minutes, reprends-en un.',
			401
		);
	}
	if (!res.ok) throw new GccError(`GCC a répondu ${res.status} sur ${path}.`, 502);
	try {
		// La lecture du corps était HORS du try : une page d'erreur HTML servie avec
		// un content-type JSON, ou un corps qui cale, remontait en 500 générique au
		// lieu du 502 prévu — et le message d'exception embarquait un extrait de la
		// réponse de GCC, qui finissait dans nos journaux.
		return (await res.json()) as T;
	} catch {
		throw new GccError(`GCC a renvoyé une réponse illisible sur ${path}.`, 502);
	}
}

function walkRules(rule: GccRule, visit: (r: GccRule) => void): void {
	visit(rule);
	for (const sub of rule.condition.rules ?? []) walkRules(sub, visit);
}

/**
 * Aplatit un arbre de projets. Aujourd'hui GCC ne renvoie que des projets racines
 * dans `target_project`, mais le champ `children` existe : si une piscine y était
 * un jour imbriquée, ses modules seraient pris en compte.
 */
function flatten(projects: GccProject[] = []): GccProject[] {
	return projects.flatMap((p) => [p, ...flatten(p.children)]);
}

/** Ce que GCC exige pour une catégorie donnée. */
interface GccCategory {
	tag: string;
	category: string;
	/** Projets exigés (règle `projects_validate`), null si la règle est absente. */
	requiredCount: number | null;
	/** XP exigé (règle `xp_validate`), null si la règle est absente. */
	requiredXP: number | null;
	/** Projets éligibles au comptage, hors projets retirés du cursus. */
	projects: Map<string, string>;
	/**
	 * Projets que GCC ne fait plus passer : on les ignore, mais on garde leur nom
	 * pour expliquer pourquoi un projet de chez nous n'a plus d'équivalent.
	 */
	retired: Set<string>;
}

interface GccRncp {
	ruleId: number;
	name: string;
	level: number | null;
	events: number | null;
	categories: Map<string, GccCategory>;
	/** Tags rencontrés qui ne correspondent à aucune de nos catégories. */
	unknownTags: Set<string>;
}

function collect(root: GccRule): GccRncp {
	const rncp: GccRncp = {
		ruleId: root.id,
		name: root.name.trim(),
		level: null,
		events: null,
		categories: new Map(),
		unknownTags: new Set(),
	};

	walkRules(root, (rule) => {
		if (rule.type === 'level_validate') rncp.level = rule.condition.level ?? null;
		if (rule.type === 'events_validate') rncp.events = rule.condition.events ?? null;

		const tag = rule.condition.target_project_tags?.[0]?.name;
		if (!tag) return;

		const category = TAG_TO_CATEGORY[tag];
		if (!category) {
			rncp.unknownTags.add(tag);
			return;
		}

		let entry = rncp.categories.get(category);
		if (!entry) {
			entry = {
				tag,
				category,
				requiredCount: null,
				requiredXP: null,
				projects: new Map(),
				retired: new Set(),
			};
			rncp.categories.set(category, entry);
		}

		if (rule.type === 'projects_validate') {
			entry.requiredCount = rule.condition.projects ?? null;
			// Seule la règle `projects_validate` définit les projets qui COMPTENT : la
			// liste de la règle XP est plus large (modules de piscine inclus) et la
			// comparer à nos catégories produirait de faux écarts.
			for (const p of flatten(rule.condition.target_project)) {
				const key = normalize(p.name);
				if (!key) continue;
				if (isRetired(p.name)) entry.retired.add(key);
				else entry.projects.set(key, p.name.trim());
			}
		}
		if (rule.type === 'xp_validate') entry.requiredXP = rule.condition.experiences ?? null;
	});

	return rncp;
}

// ─── Notre référentiel ────────────────────────────────────────────────────────

/**
 * Tous les projets que notre référentiel connaît DÉJÀ, où qu'ils soient : un même
 * projet apparaît dans plusieurs catégories (`zappy` est à la fois projet de
 * groupe et projet impératif) et doit y porter le même `id` et le même `slug42`.
 * Quand GCC signale un manque, on recycle donc la ligne existante au lieu d'en
 * inventer une : c'est la seule façon d'être sûr du slug 42.
 */
let knownCache: { version: number; map: Map<string, { id: string; slug42: string | null }> } | null = null;

function knownProjects(): Map<string, { id: string; slug42: string | null }> {
	// Mémorisé PAR VERSION : construit une fois pour toutes à l'import, l'index
	// aurait ignoré tout projet ajouté depuis le panneau, et la comparaison
	// suivante l'aurait reproposé à l'ajout alors qu'il venait d'être ajouté.
	const version = getReferentialVersion();
	if (knownCache?.version === version) return knownCache.map;

	const map = new Map<string, { id: string; slug42: string | null }>();
	for (const entry of getReferential()) {
		for (const category of entry.categories) {
			const all = [...category.projects, ...category.projects.flatMap((p) => p.subProjects ?? [])];
			for (const project of all) {
				for (const key of [project.id, project.slug42, project.fallback?.name]) {
					if (key) map.set(normalize(key), { id: project.id, slug42: project.slug42 });
				}
			}
		}
	}
	knownCache = { version, map };
	return map;
}

/** Un de nos projets, avec toutes les écritures sous lesquelles GCC peut le nommer. */
interface OurProject {
	/** L'identifiant interne : c'est lui qu'on éditerait dans le référentiel. */
	label: string;
	keys: Set<string>;
	/** De quoi retrouver un nom lisible quand l'identifiant n'en dit rien. */
	slug42: string | null;
	fallbackName: string | null;
}

/**
 * Le nom à afficher à côté d'un identifiant, par ordre de fiabilité : ce que 42
 * publie aujourd'hui, puis notre `fallback` (seule source restante pour un projet
 * que 42 a retiré de son catalogue), puis le slug, faute de mieux.
 */
function nomLisible(p: OurProject, noms: Map<string, string>): string | null {
	return (
		noms.get(p.label) ??
		(p.slug42 ? noms.get(normalize(p.slug42)) : undefined) ??
		p.fallbackName ??
		p.slug42 ??
		null
	);
}

function ourProjects(entry: RncpReferentialEntry, categoryId: string): OurProject[] {
	const category = entry.categories.find((c) => c.id === categoryId);
	return (category?.projects ?? []).map((p) => {
		// Un projet est reconnaissable par son identifiant interne, son slug 42 ou
		// son nom lisible : on indexe les trois, sinon une simple différence
		// d'écriture le ferait passer pour absent.
		const keys = new Set<string>();
		for (const key of [p.id, p.slug42, p.fallback?.name]) {
			if (key) keys.add(normalize(key));
		}
		// GCC ne connaît pas nos piscines, seulement leurs modules : une piscine est
		// donc « présente » dès qu'un de ses modules figure chez GCC.
		for (const sub of p.subProjects ?? []) {
			for (const key of [sub.id, sub.slug42, sub.fallback?.name]) {
				if (key) keys.add(normalize(key));
			}
		}
		return { label: p.id, keys, slug42: p.slug42, fallbackName: p.fallback?.name ?? null };
	});
}

// ─── Catalogue 42, pour retrouver les slugs ───────────────────────────────────

/**
 * Catalogue du cursus 42 : nom normalisé → slug de l'API.
 *
 * On LIT le cache partagé de `API42Service` au lieu d'interroger l'API nous-mêmes.
 * `/cursus/:id/projects` est mesuré à ~10 s PAR PAGE côté 42 (5 pages pour le
 * tronc commun) : le récupérer dans le fil d'une requête HTTP la fait tourner une
 * minute ou plus, et court-circuite au passage la file d'attente qui protège des
 * quotas 42. Ce cache est justement là pour ça, alimenté en tâche de fond.
 *
 * Ne lève jamais : un catalogue absent dégrade le rapport (les slugs inconnus
 * sortent en `null`) mais ne doit pas empêcher de voir les écarts, qui sont
 * l'essentiel.
 */
interface Catalog42Entry {
	slug: string;
	id42: number;
}

function loadCatalog42(): {
	catalog: Map<string, Catalog42Entry>;
	noms: Map<string, string>;
	error: string | null;
} {
	const projects = API42Service.getCursusProjectsCached(RNCP_CURSUS_ID);
	if (!projects) {
		// Comme `rncp.service`, on relance le remplissage en tâche de fond : la
		// comparaison suivante aura le catalogue.
		API42Service.ensureCursusProjectsFetching(RNCP_CURSUS_ID);
		return {
			catalog: new Map(),
			noms: new Map(),
			error:
				'catalogue du cursus 42 pas encore en cache ; son remplissage vient d\'être lancé, relance la comparaison dans une minute',
		};
	}

	// Plusieurs projets 42 portent le même nom une fois normalisé — `minishell` et
	// `minishell-d972f7c4…`, `42cursus-push_swap` et `42next-push_swap`, 37 cas
	// mesurés sur le catalogue réel. Retenir « le dernier gagne » ferait proposer
	// un identifiant tiré au sort par l'ordre de pagination de l'API 42, opaque
	// (`42-2687` contre `42-1471`) et persisté dans les simulations de tout le
	// monde. On écarte donc les noms ambigus : mieux vaut ne rien proposer.
	const parNom = new Map<string, Catalog42Entry[]>();
	for (const project of projects) {
		const key = normalize(project.name);
		if (!parNom.has(key)) parNom.set(key, []);
		parNom.get(key)!.push({ slug: project.slug, id42: project.id });
	}

	// Le chemin INVERSE : d'un identifiant vers le nom. Aucune ambiguïté à écarter
	// ici, contrairement au sens nom -> slug ci-dessus : l'identifiant 42 et le
	// slug sont uniques, ce sont les noms qui ne le sont pas.
	const noms = new Map<string, string>();
	for (const project of projects) {
		noms.set(`42-${project.id}`, project.name);
		noms.set(normalize(project.slug), project.name);
	}

	const catalog = new Map<string, Catalog42Entry>();
	let ambigus = 0;
	for (const [key, entrees] of parNom) {
		if (entrees.length > 1) {
			ambigus++;
			continue;
		}
		catalog.set(key, entrees[0]!);
	}
	if (ambigus > 0) {
		console.warn(
			`[GCC] ${ambigus} nom(s) du catalogue 42 désignent plusieurs projets : ils ne seront pas ` +
				'proposés à l\'ajout, faute de pouvoir choisir un identifiant sans se tromper.'
		);
	}
	if (catalog.size === 0) return { catalog, noms, error: 'catalogue du cursus vide' };
	return { catalog, noms, error: null };
}

/**
 * Identifiant à donner à un projet que nous ne connaissons pas encore, dans le
 * style du référentiel : minuscules, séparateurs réduits à des tirets.
 */
/**
 * Le nom, rendu sûr dans un commentaire de la ligne générée : un nom GCC
 * contenant un saut de ligne couperait la ligne en deux et produirait du
 * TypeScript invalide à coller.
 */
function forComment(name: string): string {
	return name.replace(/[\r\n]+/g, ' ').slice(0, 120);
}

/** Indentation des lignes de projet dans `rncpReferential.ts`. */
const INDENT = '\t'.repeat(4);

/**
 * La ligne à coller dans le référentiel pour ajouter un projet.
 *
 * Le `slug42` vient soit d'une ligne existante, soit du catalogue 42 — jamais
 * d'une déduction : le référentiel mélange les conventions (`42cursus-zappy` mais
 * `libasm`, `ft_kalman`, `leaffliction`…), et un slug inventé ne casserait rien
 * visiblement, il ferait juste silencieusement échouer la correspondance avec
 * l'API 42. Faute de mieux on écrit `null`, qui est explicite.
 */
function referentialLine(gccName: string, catalog42: Map<string, Catalog42Entry>): MissingProject {
	const key = normalize(gccName);

	// Déjà connu de notre référentiel : on reprend sa ligne telle quelle, sans
	// rien réinventer.
	const known = knownProjects().get(key);
	if (known) {
		const slug = known.slug42 === null ? 'null' : `'${known.slug42}'`;
		return {
			name: gccName,
			projectId: known.id,
			slug42: known.slug42,
			line: `${INDENT}{ id: '${known.id}', slug42: ${slug} },`,
			slugUnknown: known.slug42 === null,
		};
	}

	// Sinon l'identifiant vient du catalogue 42, jamais du nom : c'est 42 qui
	// fait autorité, et un projet qu'elle ne connaît pas n'a rien à faire dans le
	// référentiel — l'application ne saurait ni l'afficher ni le rapprocher.
	const entry = catalog42.get(key);
	if (!entry) {
		return {
			name: gccName,
			projectId: '',
			slug42: null,
			line: `${INDENT}// « ${forComment(gccName)} » : absent du catalogue 42, aucun identifiant possible`,
			slugUnknown: true,
		};
	}

	const id = `42-${entry.id42}`;
	return {
		name: gccName,
		projectId: id,
		slug42: entry.slug,
		line: `${INDENT}{ id: '${id}', slug42: '${entry.slug}' },`,
		slugUnknown: false,
	};
}

// ─── Comparaison ──────────────────────────────────────────────────────────────

function thresholdDiff(label: string, gcc: number | null, ours: number): ThresholdDiff | null {
	// GCC n'exige plus rien et nous non plus : rien à signaler.
	if (gcc === null && ours === 0) return null;
	if (gcc === ours) return null;
	return { label, gcc, ours };
}

/** Signature d'une catégorie, pour vérifier que le commun l'est vraiment. */
function signature(cat: GccCategory): string {
	return JSON.stringify([
		cat.tag,
		cat.requiredCount,
		cat.requiredXP,
		[...cat.projects.keys()].sort(),
	]);
}

/** Vrai si la catégorie ne présente aucun écart : elle sera omise du rapport. */
function isClean(diff: CategoryDiff): boolean {
	return diff.thresholds.length === 0 && diff.missing.length === 0 && diff.extra.length === 0;
}

/**
 * Compare notre référentiel à celui de GCC.
 *
 * @param token jeton de session GCC (5 minutes de validité)
 * @param forcedRuleIds règles racines imposées, quand la détection par nom échoue
 */
export async function compareWithGcc(
	token: string,
	forcedRuleIds?: number[]
): Promise<GccComparison> {
	const rules = await get<GccRule[]>('/rules', token);
	if (!Array.isArray(rules)) {
		throw new GccError("GCC n'a pas renvoyé une liste de règles sur /rules.", 502);
	}

	const roots = forcedRuleIds?.length
		? rules.filter((r) => forcedRuleIds.includes(r.id))
		: rules.filter((r) => r.type === 'composite_validate' && RNCP_ROOT_NAME.test(r.name.trim()));

	if (roots.length === 0) {
		const composites = rules
			.filter((r) => r.type === 'composite_validate')
			.map((r) => `${r.id} — ${r.name}`)
			.join(', ');
		throw new GccError(
			(forcedRuleIds?.length
				? `Aucune règle GCC ne porte les identifiants ${forcedRuleIds.join(', ')}.`
				: 'Aucun RNCP reconnu : GCC a probablement renommé ses règles.') +
				` Règles composites disponibles : ${composites}`,
			422
		);
	}

	const warnings: string[] = [];
	// Un RNCP disparu du filtre passerait inaperçu : le rapport serait vert sur
	// trois cursus au lieu de quatre.
	if (roots.length !== 4) {
		warnings.push(`${roots.length} RNCP trouvés au lieu des 4 attendus.`);
	}
	// Chaque racine coûte un appel à 20 s : au-delà, le budget serveur dépasse le
	// délai d'attente du client, qui abandonne pendant que le serveur continue.
	if (roots.length > MAX_ROOTS) {
		warnings.push(
			`${roots.length} racines à analyser : seules les ${MAX_ROOTS} premières le sont, ` +
				`au-delà la comparaison dépasse le temps que le navigateur accepte d'attendre.`
		);
		roots.length = MAX_ROOTS;
	}

	const collected: GccRncp[] = [];
	for (const root of roots) {
		// C'est le « Compile » de l'interface : il renvoie l'arbre de règles avec les
		// tags déjà résolus en listes de projets.
		const compiled = await get<{ result: { rule: GccRule } }[]>(`/me/${root.id}`, token);
		const tree = compiled[0]?.result?.rule;
		if (!tree) {
			warnings.push(`${root.name} : GCC n'a rien renvoyé, RNCP ignoré.`);
			continue;
		}
		collected.push(collect(tree));
	}

	const { catalog: catalog42, noms: noms42, error: catalogError } = loadCatalog42();
	if (catalogError) {
		warnings.push(
			`Catalogue 42 indisponible (${catalogError}) : les projets inconnus sortiront avec « slug42: null ».`
		);
	}

	// Les catégories communes (Suite, Projets de groupe) sont répétées à l'identique
	// dans les quatre RNCP ; chez nous elles vivent une seule fois dans
	// « rncp-global », et on les rapporte une seule fois.
	const global = getReferential().find((e) => e.id === 'rncp-global');
	const isCommon = (categoryId: string): boolean =>
		global?.categories.some((c) => c.id === categoryId) ?? false;

	function categoryDiff(
		cat: GccCategory,
		owner: RncpReferentialEntry | undefined
	): CategoryDiff | string {
		const ours = owner?.categories.find((c) => c.id === cat.category);
		if (!ours || !owner) {
			return `Catégorie « ${cat.category} » (tag GCC « ${cat.tag} ») absente de notre référentiel.`;
		}

		const mine = ourProjects(owner, cat.category);
		const mineKeys = new Set(mine.flatMap((p) => [...p.keys]));

		return {
			name: ours.name,
			categoryId: ours.id,
			ownerId: owner.id,
			tag: cat.tag,
			thresholds: [
				thresholdDiff('projets requis', cat.requiredCount, ours.requiredCount),
				thresholdDiff('XP requis', cat.requiredXP, ours.requiredXP),
			].filter((t): t is ThresholdDiff => t !== null),
			missing: [...cat.projects]
				.filter(([key]) => !mineKeys.has(key))
				.map(([, name]) => name)
				.sort()
				.map((name) => referentialLine(name, catalog42)),
			extra: mine
				.filter((p) => ![...p.keys].some((key) => cat.projects.has(key)))
				// Un projet retiré du cursus par GCC n'est pas un simple écart : c'est
				// une suppression à faire chez nous, autant le distinguer.
				.map((p) => ({
					id: p.label,
					name: nomLisible(p, noms42),
					retired: [...p.keys].some((key) => cat.retired.has(key)),
					// Rempli en une seule requête après coup, pour ne pas interroger la
					// base une fois par projet.
					simulatedBy: 0,
				}))
				.sort((a, b) => a.id.localeCompare(b.id)),
		};
	}

	/** Range un résultat de `categoryDiff` du bon côté : écart ou avertissement. */
	function push(section: SectionDiff, result: CategoryDiff | string): void {
		if (typeof result === 'string') section.warnings.push(result);
		else if (!isClean(result)) section.categories.push(result);
	}

	/**
	 * Signale NOS catégories qu'aucune règle GCC ne couvre plus.
	 *
	 * La comparaison parcourt les catégories que GCC connaît : tout ce que
	 * l'école SUPPRIME sortait donc du rapport sans un mot, et une catégorie
	 * disparue s'affichait comme conforme. C'est le pire des résultats — un vert
	 * qui inspire confiance là où l'on continue d'exiger des projets et de l'XP
	 * que plus personne ne demande.
	 */
	function reportUncoveredCategories(
		section: SectionDiff,
		entry: RncpReferentialEntry | undefined,
		covered: Set<string>,
		onlyCommon: boolean
	): void {
		for (const ours of entry?.categories ?? []) {
			if (covered.has(ours.id)) continue;
			// La section commune ne porte que les catégories de « rncp-global », et
			// les sections RNCP que les autres : sans ce tri, chacune réclamerait
			// les catégories de l'autre.
			if (isCommon(ours.id) !== onlyCommon) continue;
			section.warnings.push(
				`Aucune règle GCC ne couvre plus « ${ours.name} » (${ours.id}), ` +
					`alors que nous exigeons encore ${ours.requiredCount} projet(s)` +
					(ours.requiredXP > 0 ? ` et ${ours.requiredXP} XP` : '') +
					`. À confirmer auprès de l'école avant de retirer l'exigence.`
			);
		}
	}

	// Le commun n'est commun que si GCC le répète à l'identique. Si l'école le fait
	// diverger un jour, le rapporter une fois masquerait la différence : on le
	// signale et on rebascule sur un affichage par RNCP.
	const commonIds = [
		...new Set(collected.flatMap((r) => [...r.categories.keys()].filter(isCommon))),
	];
	const divergent = commonIds.filter((id) => {
		const signatures = new Set(
			collected.map((r) => {
				const cat = r.categories.get(id);
				return cat ? signature(cat) : 'absente';
			})
		);
		return signatures.size > 1;
	});
	for (const id of divergent) {
		warnings.push(
			`La catégorie commune « ${id} » n'est plus identique d'un RNCP à l'autre chez GCC ; elle est détaillée RNCP par RNCP.`
		);
	}

	const sharedIds = commonIds.filter((id) => !divergent.includes(id));
	let common: SectionDiff | null = null;
	if (sharedIds.length > 0 && collected.length > 0) {
		common = {
			title: `Commun aux ${collected.length} RNCP`,
			entryId: global?.id ?? null,
			subtitle: null,
			thresholds: [],
			categories: [],
			warnings: [],
		};
		const coveredCommon = new Set<string>();
		for (const id of sharedIds) {
			const cat = collected[0]!.categories.get(id);
			if (cat) {
				coveredCommon.add(id);
				push(common, categoryDiff(cat, global));
			}
		}
		// Une catégorie commune DIVERGENTE est bel et bien couverte par GCC : elle
		// est simplement détaillée RNCP par RNCP plus bas. L'omettre d'ici la
		// faisait signaler « aucune règle GCC ne la couvre plus », un conseil
		// exactement inverse de la réalité, dans la même page que son détail.
		reportUncoveredCategories(common, global, new Set([...coveredCommon, ...divergent]), true);
	}

	const rncps: SectionDiff[] = collected.map((rncp) => {
		const entryId = RNCP_TO_ENTRY[rncp.name];
		const entry = getReferential().find((e) => e.id === entryId);
		const section: SectionDiff = {
			title: rncp.name,
			entryId: entryId ?? null,
			subtitle: `règle ${rncp.ruleId}${entryId ? ` ↔ ${entryId}` : ''}`,
			thresholds: [],
			categories: [],
			warnings: [],
		};

		if (!entry) {
			section.warnings.push(`Aucune entrée de notre référentiel ne correspond à « ${rncp.name} ».`);
		} else {
			section.thresholds = [
				thresholdDiff('niveau requis', rncp.level, entry.level),
				thresholdDiff('événements requis', rncp.events, entry.requiredEvents),
			].filter((t): t is ThresholdDiff => t !== null);
		}

		for (const cat of rncp.categories.values()) {
			// Les expériences professionnelles ne sont pas une catégorie de projets
			// chez nous mais un compteur porté par le RNCP.
			if (cat.category === 'professional-experience') {
				const diff = thresholdDiff(
					'expériences pro',
					cat.requiredCount,
					entry?.requiredProfessionalExperience ?? 0
				);
				if (diff) section.thresholds.push(diff);
				continue;
			}
			if (isCommon(cat.category) && !divergent.includes(cat.category)) continue;
			push(section, categoryDiff(cat, isCommon(cat.category) ? global : entry));
		}

		reportUncoveredCategories(section, entry, new Set(rncp.categories.keys()), false);

		for (const tag of rncp.unknownTags) {
			section.warnings.push(`Tag GCC inconnu « ${tag} » — à rattacher à une catégorie.`);
		}

		return section;
	});

	// Combien d'utilisateurs seraient touchés par chaque suppression. Une seule
	// requête pour tous les projets en trop : `simulated_project` est indexée sur
	// `projectId`, mais une requête par projet resterait une dizaine d'allers-retours.
	const sections = [...(common ? [common] : []), ...rncps];
	const extras = sections.flatMap((s) => s.categories.flatMap((c) => c.extra));
	if (extras.length > 0) {
		const counts = await simulationRepository.countByProjectIds([
			...new Set(extras.map((e) => e.id)),
		]);
		for (const extra of extras) extra.simulatedBy = counts.get(extra.id) ?? 0;
	}

	const hasContent = (s: SectionDiff): boolean =>
		s.thresholds.length > 0 || s.categories.length > 0 || s.warnings.length > 0;

	return {
		rncpCount: collected.length,
		common,
		rncps,
		warnings,
		anyDiff:
			warnings.length > 0 || (common ? hasContent(common) : false) || rncps.some(hasContent),
	};
}
