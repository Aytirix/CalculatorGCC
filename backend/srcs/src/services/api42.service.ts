import axios from 'axios';
import { config } from '../config/config.js';
import { prisma } from '../db/connection.js';
import { userData42Repository, UserData42Snapshot } from '../db/userData42Repository.js';
import {
	api42CacheRepository,
	CACHE_KEY_PROJECT_DATA,
	cacheKeyCursusProjects,
	cacheKeyProjectSessions,
	cacheKeyProjectSkills,
} from '../db/api42CacheRepository.js';
import { token42Service } from './token42.service.js';
import { appToken42Service } from './appToken42.service.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ============================================================================
// RATE LIMITER — file globale unique vers l'API 42
//
// Limites 42 mesurées : 2 req/s et 1200 req/h (par application / client_id).
//  - minDelay (config, 550 ms) entre 2 requêtes  => ~1.8 req/s
//  - lecture des headers `x-hourly-ratelimit-remaining` : pause si budget bas
//  - 429 : respect de `Retry-After`, la file se met en pause et retente
// ============================================================================
interface QueuedRequest {
	url: string;
	token: string;
	timeoutMs: number;
	resolve: (value: any) => void;
	reject: (error: any) => void;
	retries: number;
}

class API42RateLimiter {
	private queue: QueuedRequest[] = [];
	private processing = false;
	private lastRequestTime = 0;
	private pausedUntil = 0; // epoch ms ; la file attend jusque-là (429 / budget horaire)
	private hourlyRemaining: number | null = null;
	private secondlyRemaining: number | null = null;
	private hourlyLimit = 1200; // valeur par défaut, corrigée par les headers 42
	private secondlyLimit = 2;
	private requestTimestamps: number[] = []; // horodatage des requêtes réellement émises (fenêtre 1h)

	/**
	 * `timeoutMs` surcharge le timeout par défaut pour CETTE requête (ex. les
	 * pages de `/cursus/:id/projects`, mesurées à ~10s/page sur l'API 42 —
	 * bien au-dessus du timeout par défaut pensé pour des endpoints légers).
	 */
	enqueue<T>(url: string, token: string, timeoutMs = config.api42.requestTimeoutMs): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.queue.push({ url, token, timeoutMs, resolve, reject, retries: 0 });
			if (!this.processing) {
				void this.processQueue();
			}
		});
	}

	/** Compteur horaire live exposé pour l'ETA / le debug. */
	getHourlyRemaining(): number | null {
		return this.hourlyRemaining;
	}

	/** Évince les horodatages de plus d'1 h. Appelé au push ET à la lecture pour
	 *  que la fenêtre reste bornée même si personne n'ouvre la page Conso API. */
	private pruneTimestamps(now: number): void {
		const cutoff = now - 3600_000; // 1 h
		while (this.requestTimestamps.length > 0 && this.requestTimestamps[0] < cutoff) {
			this.requestTimestamps.shift();
		}
	}

	/** Instantané de l'usage vers l'API 42 (pour la page Conso API). */
	getStats() {
		const now = Date.now();
		this.pruneTimestamps(now);
		const pauseLeft = this.pausedUntil - now;
		return {
			hourlyLimit: this.hourlyLimit,
			hourlyRemaining: this.hourlyRemaining,
			secondlyLimit: this.secondlyLimit,
			secondlyRemaining: this.secondlyRemaining,
			requestsLastHour: this.requestTimestamps.length,
			queueDepth: this.queue.length,
			paused: pauseLeft > 0,
			pausedForSeconds: pauseLeft > 0 ? Math.ceil(pauseLeft / 1000) : 0,
			minDelayMs: config.api42.minDelayMs,
			lastRequestAt: this.lastRequestTime ? new Date(this.lastRequestTime).toISOString() : null,
		};
	}

	private observeHeaders(headers: Record<string, any>): void {
		if (!headers) return;

		const hLimit = parseInt(String(headers['x-hourly-ratelimit-limit'] ?? ''), 10);
		if (!Number.isNaN(hLimit)) this.hourlyLimit = hLimit;
		const sLimit = parseInt(String(headers['x-secondly-ratelimit-limit'] ?? ''), 10);
		if (!Number.isNaN(sLimit)) this.secondlyLimit = sLimit;
		const sRem = parseInt(String(headers['x-secondly-ratelimit-remaining'] ?? ''), 10);
		if (!Number.isNaN(sRem)) this.secondlyRemaining = sRem;

		const raw = headers['x-hourly-ratelimit-remaining'];
		if (raw == null) return;
		const remaining = parseInt(String(raw), 10);
		if (Number.isNaN(remaining)) return;
		this.hourlyRemaining = remaining;
		if (remaining <= config.api42.hourlyReserve) {
			this.pausedUntil = Math.max(this.pausedUntil, Date.now() + config.api42.hourlyPauseMs);
			console.warn(`[API42] Budget horaire bas (${remaining} restants) — pause de la file ${config.api42.hourlyPauseMs}ms`);
		}
	}

	private async processQueue(): Promise<void> {
		if (this.processing) return;
		this.processing = true;

		while (this.queue.length > 0) {
			// 1) Respecter une éventuelle pause globale (429 / budget horaire)
			const pauseLeft = this.pausedUntil - Date.now();
			if (pauseLeft > 0) await sleep(pauseLeft);

			// 2) Respecter le délai minimum entre 2 requêtes
			const since = Date.now() - this.lastRequestTime;
			if (since < config.api42.minDelayMs) {
				await sleep(config.api42.minDelayMs - since);
			}

			const req = this.queue.shift()!;
			this.lastRequestTime = Date.now();
			this.requestTimestamps.push(this.lastRequestTime); // compte chaque requête émise (429 inclus)
			this.pruneTimestamps(this.lastRequestTime); // fenêtre 1h bornée sans dépendre de la page Conso

			try {
				const response = await axios.get(req.url, {
					headers: { Authorization: `Bearer ${req.token}` },
					timeout: req.timeoutMs, // évite qu'une requête pendue gèle la file
				});
				this.observeHeaders(response.headers as Record<string, any>);
				req.resolve(response.data);
			} catch (error: any) {
				// Lire le budget horaire même en erreur (le 429 le vide) pour éviter un retry-storm.
				this.observeHeaders((error?.response?.headers ?? {}) as Record<string, any>);
				const status = error?.response?.status;
				if (status === 429 && req.retries < config.api42.maxRetriesOn429) {
					const retryAfter = parseInt(String(error.response?.headers?.['retry-after'] ?? '1'), 10) || 1;
					this.pausedUntil = Date.now() + retryAfter * 1000 + 150;
					req.retries += 1;
					this.queue.unshift(req); // retenter cette requête en tête, après la pause
					console.warn(`[API42] 429 reçu — pause ${retryAfter}s puis retry ${req.retries}/${config.api42.maxRetriesOn429}`);
					continue;
				}
				req.reject(error);
			}
		}

		this.processing = false;
	}
}

const rateLimiter = new API42RateLimiter();

// Cache du catalogue "cursus -> projets" (Holy Graph). Partagé entre tous les
// utilisateurs (le contenu d'un cursus ne dépend de personne) et persisté en
// base : un redémarrage du backend ne doit pas relancer des dizaines d'appels
// à l'API 42. La mémoire ne sert que de couche rapide devant la base.
const CURSUS_PROJECTS_PAGE_TIMEOUT_MS = 30_000; // mesuré ~10s/page côté API 42, large marge
const cursusProjectsCache = new Map<number, { data: SlimProject[]; at: number }>();
const cursusProjectsInFlight = new Map<number, Promise<void>>();

/**
 * Version allégée d'un projet du catalogue : le brut renvoyé par l'API 42 pèse
 * ~18 Mo pour un cursus (chaque projet embarque toutes ses sessions, barèmes
 * et campus). On ne conserve que ce dont le Holy Graph a besoin.
 */
export interface SlimProject {
	id: number;
	name: string;
	slug: string;
	difficulty: number;
	exam: boolean;
	sessions: { id: number; cursusId: number; campusId: number | null }[];
}

function slimCursusProjects(raw: any[]): SlimProject[] {
	return raw.map((p) => ({
		id: p.id,
		name: p.name,
		slug: p.slug,
		difficulty: p.difficulty ?? 0,
		exam: p.exam === true,
		sessions: (p.project_sessions ?? [])
			.filter((s: any) => s?.id != null)
			.map((s: any) => ({ id: s.id, cursusId: s.cursus_id, campusId: s.campus_id ?? null })),
	}));
}

/** Idem pour le layout : on ne garde que les champs réellement dessinés. */
interface SlimProjectData {
	sessionId: number;
	kind: string;
	x: number;
	y: number;
	by: number[][];
}

function slimProjectData(raw: any[]): SlimProjectData[] {
	const out: SlimProjectData[] = [];
	for (const e of raw) {
		const [x, y] = e?.coordinates ?? [];
		if (typeof x !== 'number' || typeof y !== 'number' || (x === 0 && y === 0)) continue;
		out.push({
			sessionId: e.project_session_id,
			kind: e.kind ?? 'project',
			x,
			y,
			by: (e.by ?? []).filter((l: any) => Array.isArray(l) && l.length >= 5),
		});
	}
	return out;
}

// ---------------------------------------------------------------------------
// HOLY GRAPH — layout OFFICIEL de 42
//
// `/v2/project_data` est l'endpoint qui alimente projects.intra.42.fr/projects/graph.
// Chaque entrée : { project_session_id, kind, coordinates: [x, y], by: [[session, x1,y1,x2,y2], …] }
//  - `coordinates` = la position exacte du nœud sur le graphe officiel ;
//  - `by`          = les liens, segments de ligne déjà calculés ;
//  - `kind`        = project | big_project | rush | piscine | exam (le type de nœud).
//
// Deux propriétés vérifiées sur les données réelles, qui rendent tout ça simple :
//  1. les coordonnées sont GLOBALES (identiques d'un campus à l'autre, à ~2px près) ;
//  2. seuls les projets réellement présents sur le graphe officiel ont une entrée
//     avec des coordonnées non nulles — la curation de 42 est donc déjà DANS la
//     donnée. Plus besoin d'heuristiques pour deviner ce qui fait partie du cursus.
// ---------------------------------------------------------------------------
export interface HolyGraphNode {
	projectId: number;
	kind: string;
	x: number;
	y: number;
}

export interface HolyGraphEdge {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export interface OfficialGraphLayout {
	/** Position officielle par id de projet. */
	nodes: Map<number, HolyGraphNode>;
	edges: HolyGraphEdge[];
}

let projectDataCache: { data: SlimProjectData[]; at: number } | null = null;
let projectDataInFlight: Promise<void> | null = null;

/**
 * Compétences 42 associées aux projets : ce sont les « layers » proposés sur le
 * graphe officiel (Algorithms & AI, DB & Data, Graphics, Security…).
 */
export interface ProjectSkills {
	/** id de compétence -> nom lisible */
	skillNames: Record<number, string>;
	/** id de projet -> ids de compétences */
	byProject: Record<number, number[]>;
}

const projectSkillsCache = new Map<string, { data: ProjectSkills; at: number }>();
const projectSkillsInFlight = new Map<string, Promise<void>>();

// ---------------------------------------------------------------------------
// DÉTAIL D'UN PROJET — ce que l'intra affiche quand on clique sur un nœud
//
// `/v2/project_sessions?filter[cursus_id]=X&filter[campus_id]=Y` renvoie, pour
// chaque projet du campus, sa description, sa durée estimée, s'il est solo ou
// en groupe, et surtout ses `project_sessions_rules` : c'est là que 42 encode
// les prérequis (projets à avoir validés, niveau minimum, rang du tronc commun).
//
// Mesuré sur 42cursus / Nice : 424 sessions = 5 pages, ~2,3 Mo bruts. Une fois
// allégé et mis en cache un mois, ça représente 5 requêtes par mois, partagées
// par tous les utilisateurs du campus.
// ---------------------------------------------------------------------------

/** Une règle d'inscription/correction, réduite à ce qu'on sait interpréter. */
export interface SlimSessionRule {
	/** `internal_name` côté 42 : ProjectsValidated, LevelMin, GroupSizeBetweenNAndM… */
	name: string;
	kind: string;
	/** Paramètres indexés par `param_id` (leur signification dépend de la règle). */
	params: Record<number, string>;
}

export interface SlimProjectSession {
	id: number;
	projectId: number;
	solo: boolean;
	estimateTime: string | null;
	durationDays: number | null;
	description: string | null;
	objectives: string[];
	difficulty: number;
	maxPeople: number | null;
	isSubscriptable: boolean;
	/** Nombre de correcteurs prévu par le barème principal. */
	correctionNumber: number | null;
	/** Corrections automatiques attachées (« Moulinette »). */
	uploads: string[];
	rules: SlimSessionRule[];
}

function slimProjectSessions(raw: any[]): SlimProjectSession[] {
	return raw
		.filter((s) => s?.id != null && s?.project_id != null)
		.map((s) => {
			const primaryScale = (s.scales ?? []).find((sc: any) => sc?.is_primary) ?? (s.scales ?? [])[0];
			return {
				id: s.id,
				projectId: s.project_id,
				solo: s.solo === true,
				estimateTime: s.estimate_time ?? null,
				durationDays: s.duration_days ?? null,
				description: s.description ?? null,
				objectives: Array.isArray(s.objectives) ? s.objectives : [],
				difficulty: s.difficulty ?? 0,
				maxPeople: s.max_people ?? null,
				isSubscriptable: s.is_subscriptable === true,
				correctionNumber: primaryScale?.correction_number ?? null,
				uploads: (s.uploads ?? []).map((u: any) => u?.name).filter((n: any): n is string => !!n),
				rules: (s.project_sessions_rules ?? [])
					.filter((r: any) => r?.rule?.internal_name)
					.map((r: any) => ({
						name: r.rule.internal_name as string,
						kind: (r.rule.kind ?? '') as string,
						params: Object.fromEntries(
							(r.params ?? [])
								.filter((p: any) => p?.param_id != null)
								.map((p: any) => [p.param_id, String(p.value ?? '')])
						) as Record<number, string>,
					})),
			};
		});
}

const projectSessionsCache = new Map<string, { data: SlimProjectSession[]; at: number }>();
const projectSessionsInFlight = new Map<string, Promise<void>>();

/**
 * Identifiants des paramètres des règles 42, relevés sur les données réelles du
 * 42cursus. Une règle porte ses valeurs dans des `params` numérotés dont seul
 * l'id donne le sens : les nommer ici évite des nombres magiques plus bas.
 */
const RULE_PARAM = {
	projectsValidated: 1,
	groupMin: 2,
	groupMax: 3,
	levelMin: 5,
	notValidatedProjects: 22,
	retryDelayDays: 23,
	minimumCount: 24,
	minimumProjects: 25,
	questsValidated: 31,
	neitherOngoingOrValidated: 32,
	questAndQuestValidated: 47,
} as const;

/** Détail affichable d'un projet du Holy Graph. */
export interface GraphProjectDetails {
	projectId: number;
	xp: number;
	estimateTime: string | null;
	durationDays: number | null;
	description: string | null;
	objectives: string[];
	solo: boolean;
	groupMin: number | null;
	groupMax: number | null;
	correctionNumber: number | null;
	uploads: string[];
	isSubscriptable: boolean;
	retryDelayDays: number | null;
	minLevel: number | null;
	/** Projets à avoir validés (tous). */
	requiredProjects: { slug: string; name: string }[];
	/** « N projets parmi cette liste » (règle MinimumProjectValidated). */
	anyOfProjects: { count: number; projects: { slug: string; name: string }[] } | null;
	/** Projets qui EMPÊCHENT l'inscription s'ils sont validés (choix exclusif). */
	exclusiveProjects: { slug: string; name: string }[];
	/** Rangs / quêtes du tronc commun exigés (non vérifiables depuis nos données). */
	requiredQuests: string[];
}

/**
 * Supprime les seuls traits qui flottent VRAIMENT dans le vide, c'est-à-dire
 * dont aucune des deux extrémités ne touche un projet affiché.
 *
 * Volontairement conservateur : un lien est souvent tracé en plusieurs
 * segments avec un coude, et le point de pliage n'est pas un nœud. Une règle
 * plus agressive (élaguer les extrémités non partagées) supprimait en cascade
 * une trentaine de liens parfaitement légitimes qui se terminent sur un coude.
 */
function pruneDanglingEdges(edges: HolyGraphEdge[], nodes: HolyGraphNode[]): HolyGraphEdge[] {
	if (edges.length === 0) return edges;

	const NODE_REACH = 62; // le trait s'arrête au bord du nœud (rayon 50), pas au centre
	const touchesNode = (x: number, y: number) =>
		nodes.some((n) => Math.hypot(n.x - x, n.y - y) <= NODE_REACH);

	return edges.filter((e) => touchesNode(e.x1, e.y1) || touchesNode(e.x2, e.y2));
}


/**
 * Projets exclus du graphe : contrats d'alternance, stages et expériences
 * professionnelles. Ce ne sont pas des projets à réaliser mais des marqueurs
 * administratifs (durée de contrat, upload de convention…).
 */
const EXCLUDED_NAME_RE =
	/^(FR - Alternance|FR Apprentissage|Apprentissage |Work Experience|Part_Time|Startup Experience|Internship|Hive Internship|Hive Startup|Contract Upload|Duration)/i;

// ============================================================================
// API 42 SERVICE — chaque requête passe par le rate limiter
// ============================================================================
export class API42Service {
	static async request<T>(url: string, token: string, timeoutMs?: number): Promise<T> {
		return rateLimiter.enqueue<T>(url, token, timeoutMs);
	}

	/** Tous les projets d'un utilisateur (paginé). */
	static async getUserProjects(userId: number, token: string): Promise<any[]> {
		let page = 1;
		const pageSize = 100;
		const allProjects: any[] = [];

		while (true) {
			const url = `${config.oauth42.apiUrl}/users/${userId}/projects_users?page[number]=${page}&page[size]=${pageSize}`;
			const projects = await this.request<any[]>(url, token);

			if (!projects || projects.length === 0) break;
			allProjects.push(...projects);
			if (projects.length < pageSize) break;
			page++;
		}

		// Normaliser "validated?" -> "validated"
		return allProjects.map((project: any) => ({
			...project,
			validated: project['validated?'] !== undefined ? project['validated?'] : project.validated,
		}));
	}

	/** Cursus d'un utilisateur. */
	static async getUserCursus(userId: number, token: string): Promise<any[]> {
		return this.request<any[]>(`${config.oauth42.apiUrl}/users/${userId}/cursus_users`, token);
	}

	/**
	 * Catalogue COMPLET des projets d'un cursus, déjà en cache et FRAIS, ou
	 * `null` sinon. Ne déclenche jamais d'appel réseau — à utiliser dans le
	 * chemin de requête HTTP normal, qui ne doit jamais bloquer plusieurs
	 * dizaines de secondes derrière l'API 42.
	 */
	static getCursusProjectsCached(cursusId: number): SlimProject[] | null {
		return cursusProjectsCache.get(cursusId)?.data ?? null;
	}

	/**
	 * Démarre (si besoin) le remplissage du cache pour un cursus, en tâche de
	 * fond — jamais attendu par le chemin de requête HTTP. `/cursus/:id/projects`
	 * est mesuré à ~10s PAR PAGE côté API 42 (ex. ~487 projets = 5 pages =>
	 * ~50-60s pour le tronc commun) : bien trop lent pour bloquer une requête
	 * utilisateur. Un seul fetch en vol par cursus (les appels concurrents
	 * partagent la même promesse) ; le résultat alimente le cache 24h partagé
	 * par tous les utilisateurs.
	 */
	static ensureCursusProjectsFetching(cursusId: number): void {
		if (this.getCursusProjectsCached(cursusId) !== null) return;
		if (cursusProjectsInFlight.has(cursusId)) return;

		const promise = (async () => {
			// La base d'abord : après un redémarrage, le cache mémoire est vide
			// mais les données sont toujours valables — inutile de retaper l'API 42.
			const cacheKey = cacheKeyCursusProjects(cursusId);
			const persisted = await api42CacheRepository.getFresh<SlimProject[]>(cacheKey);
			if (persisted) {
				cursusProjectsCache.set(cursusId, { data: persisted, at: Date.now() });
				return;
			}

			const token = await appToken42Service.get();
			let page = 1;
			const pageSize = 100;
			const all: any[] = [];
			while (true) {
				const url = `${config.oauth42.apiUrl}/cursus/${cursusId}/projects?page[number]=${page}&page[size]=${pageSize}`;
				const projects = await this.request<any[]>(url, token, CURSUS_PROJECTS_PAGE_TIMEOUT_MS);
				if (!projects || projects.length === 0) break;
				all.push(...projects);
				if (projects.length < pageSize) break;
				page++;
			}

			// Aucun filtrage ici : c'est `/v2/project_data` (le layout officiel)
			// qui fait office de curation — un projet absent du graphe officiel
			// n'a tout simplement pas de coordonnées, et disparaît de lui-même.
			const slim = slimCursusProjects(all);
			cursusProjectsCache.set(cursusId, { data: slim, at: Date.now() });
			await api42CacheRepository.set(cacheKey, slim);
			console.log(`[API42] Catalogue cursus ${cursusId} récupéré : ${slim.length} projets`);
		})()
			.catch((error) => {
				console.error(`[API42] Échec du fetch du catalogue cursus ${cursusId}:`, error?.message || error);
			})
			.finally(() => {
				cursusProjectsInFlight.delete(cursusId);
			});

		cursusProjectsInFlight.set(cursusId, promise);
	}

	/** Layout officiel déjà en cache mémoire, ou `null`. Aucun appel réseau. */
	static getProjectDataCached(): SlimProjectData[] | null {
		return projectDataCache?.data ?? null;
	}

	/**
	 * Démarre (si besoin) la récupération du layout officiel du Holy Graph, en
	 * tâche de fond. ~6000 entrées = ~61 pages, soit ~35s via le rate limiter :
	 * jamais attendu par une requête HTTP. Mis en cache 24h et partagé par tous
	 * les utilisateurs (ces coordonnées sont les mêmes pour tout le monde).
	 */
	static ensureProjectDataFetching(): void {
		if (this.getProjectDataCached() !== null) return;
		if (projectDataInFlight) return;

		projectDataInFlight = (async () => {
			// La base d'abord (cf. catalogue) : 61 pages d'API évitées à chaque
			// redémarrage du backend.
			const persisted = await api42CacheRepository.getFresh<SlimProjectData[]>(CACHE_KEY_PROJECT_DATA);
			if (persisted) {
				projectDataCache = { data: persisted, at: Date.now() };
				console.log(`[API42] Layout officiel repris du cache en base : ${persisted.length} entrées`);
				return;
			}

			const token = await appToken42Service.get();
			let page = 1;
			const pageSize = 100;
			const all: any[] = [];
			while (true) {
				const url = `${config.oauth42.apiUrl}/project_data?page[number]=${page}&page[size]=${pageSize}`;
				const data = await this.request<any[]>(url, token, CURSUS_PROJECTS_PAGE_TIMEOUT_MS);
				if (!data || data.length === 0) break;
				all.push(...data);
				if (data.length < pageSize) break;
				page++;
			}
			const slim = slimProjectData(all);
			projectDataCache = { data: slim, at: Date.now() };
			await api42CacheRepository.set(CACHE_KEY_PROJECT_DATA, slim);
			console.log(`[API42] Layout officiel du Holy Graph récupéré : ${slim.length} nœuds placés`);
		})()
			.catch((error) => {
				console.error('[API42] Échec du fetch du layout officiel (project_data):', error?.message || error);
			})
			.finally(() => {
				projectDataInFlight = null;
			});
	}

	/**
	 * Assemble le layout officiel pour un cursus : positions et liens tels que
	 * 42 les dessine. Renvoie `null` tant que l'un des deux jeux de données
	 * (catalogue du cursus, project_data) n'est pas encore en cache.
	 */
	static getOfficialGraph(cursusId: number, campusId: number | null): OfficialGraphLayout | null {
		const projects = this.getCursusProjectsCached(cursusId);
		const projectData = this.getProjectDataCached();
		if (!projects || !projectData) return null;

		// session -> projet, et projets réellement proposés sur le campus de
		// l'utilisateur. Sans ce filtre, on affiche l'union mondiale de tous les
		// catalogues : des projets locaux d'autres campus viennent alors se
		// superposer aux nôtres (mesuré : 33 chevauchements contre 9 en filtrant).
		const projectBySession = new Map<number, number>();
		const offeredHere = new Set<number>();
		for (const p of projects) {
			// L'exclusion (alternances, stages) doit se faire ICI et pas seulement à
			// l'affichage : sinon le nœud disparaît mais ses liens restent, et on se
			// retrouve avec des traits qui flottent dans le vide.
			if (this.isExcludedFromGraph(p.name)) continue;
			for (const s of p.sessions) {
				if (s.cursusId !== cursusId) continue;
				projectBySession.set(s.id, p.id);
				if (campusId == null || s.campusId === campusId) offeredHere.add(p.id);
			}
		}

		// Chaque campus peut décaler sa propre version du graphe : un même projet
		// a donc plusieurs positions (167 sur 232 dans le 42cursus). Prendre la
		// première venue mélange les layouts et déplace des projets ; on retient
		// la position MAJORITAIRE, qui est la disposition de référence.
		const placements = new Map<number, SlimProjectData[]>();
		for (const entry of projectData) {
			const projectId = projectBySession.get(entry.sessionId);
			if (projectId == null || !offeredHere.has(projectId)) continue;
			const list = placements.get(projectId) ?? [];
			list.push(entry);
			placements.set(projectId, list);
		}

		const nodes = new Map<number, HolyGraphNode>();
		const edges: HolyGraphEdge[] = [];
		const seenEdges = new Set<string>();

		for (const [projectId, list] of placements) {
			const counts = new Map<string, number>();
			for (const c of list) {
				const key = `${Math.round(c.x / 25)}:${Math.round(c.y / 25)}`;
				counts.set(key, (counts.get(key) ?? 0) + 1);
			}
			let bestKey: string | null = null;
			let bestCount = -1;
			for (const [key, count] of counts) {
				if (count > bestCount) {
					bestCount = count;
					bestKey = key;
				}
			}
			const chosen = list.find((c) => `${Math.round(c.x / 25)}:${Math.round(c.y / 25)}` === bestKey);
			if (!chosen) continue;

			nodes.set(projectId, { projectId, kind: chosen.kind, x: chosen.x, y: chosen.y });

			// `by` porte directement les segments tracés par 42.
			for (const link of chosen.by) {
				if (!Array.isArray(link) || link.length < 5) continue;
				const [, x1, y1, x2, y2] = link;
				if ([x1, y1, x2, y2].some((v) => typeof v !== 'number')) continue;
				// Clé insensible au sens : le même trait décrit une fois A->B et une
				// fois B->A sinon, et il se retrouve dessiné en double.
				const a = `${x1},${y1}`;
				const b = `${x2},${y2}`;
				const key = a < b ? `${a}|${b}` : `${b}|${a}`;
				if (seenEdges.has(key)) continue;
				seenEdges.add(key);
				edges.push({ x1, y1, x2, y2 });
			}
		}

		return { nodes, edges: pruneDanglingEdges(edges, [...nodes.values()]) };
	}

	/**
	 * Campus de l'utilisateur, relevé à sa connexion et stocké en base : aucune
	 * requête vers l'API 42 ici (la réponse `/me` du callback OAuth le contient
	 * déjà). `null` tant qu'il ne s'est pas reconnecté depuis l'ajout du champ —
	 * dans ce cas aucun filtre campus n'est appliqué.
	 */
	static async getUserCampusId(userId: number): Promise<number | null> {
		const row = await prisma.userSimulation.findUnique({
			where: { userId42: userId },
			select: { campusId: true },
		});
		return row?.campusId ?? null;
	}

	/** Un projet purement administratif (contrat d'alternance, stage) ? */
	static isExcludedFromGraph(name: string): boolean {
		return EXCLUDED_NAME_RE.test(name.trim());
	}

	/** Vide les caches de référence en mémoire (refresh global de l'admin). */
	static clearReferenceCaches(): void {
		cursusProjectsCache.clear();
		projectDataCache = null;
		projectSkillsCache.clear();
		projectSessionsCache.clear();
	}

	/** Sessions du cursus/campus déjà en cache mémoire, ou `null`. Aucun appel réseau. */
	static getProjectSessionsCached(cursusId: number, campusId: number): SlimProjectSession[] | null {
		return projectSessionsCache.get(cacheKeyProjectSessions(cursusId, campusId))?.data ?? null;
	}

	/**
	 * Récupère en tâche de fond le détail des sessions d'un cursus sur un campus.
	 * Non bloquant, comme les layers : le graphe s'affiche sans attendre et le
	 * panneau de détail se remplit dès que la donnée est là.
	 *
	 * Le filtre campus est indispensable : sans lui, l'endpoint renvoie les
	 * sessions de TOUS les campus (des dizaines de milliers de lignes).
	 */
	static ensureProjectSessionsFetching(cursusId: number, campusId: number): void {
		const cacheKey = cacheKeyProjectSessions(cursusId, campusId);
		if (this.getProjectSessionsCached(cursusId, campusId) !== null) return;
		if (projectSessionsInFlight.has(cacheKey)) return;

		const promise = (async () => {
			const persisted = await api42CacheRepository.getFresh<SlimProjectSession[]>(cacheKey);
			if (persisted) {
				projectSessionsCache.set(cacheKey, { data: persisted, at: Date.now() });
				return;
			}

			const token = await appToken42Service.get();
			let page = 1;
			const pageSize = 100;
			const all: any[] = [];
			while (true) {
				const url =
					`${config.oauth42.apiUrl}/project_sessions` +
					`?filter[cursus_id]=${cursusId}&filter[campus_id]=${campusId}` +
					`&page[number]=${page}&page[size]=${pageSize}`;
				const rows = await this.request<any[]>(url, token, CURSUS_PROJECTS_PAGE_TIMEOUT_MS);
				if (!rows || rows.length === 0) break;
				all.push(...rows);
				if (rows.length < pageSize) break;
				page++;
			}

			const slim = slimProjectSessions(all);
			projectSessionsCache.set(cacheKey, { data: slim, at: Date.now() });
			await api42CacheRepository.set(cacheKey, slim);
			console.log(
				`[API42] Détail des sessions récupéré pour le cursus ${cursusId} / campus ${campusId} : ${slim.length} sessions`
			);
		})()
			.catch((error) => {
				console.error('[API42] Échec du fetch du détail des sessions :', error?.message || error);
			})
			.finally(() => {
				projectSessionsInFlight.delete(cacheKey);
			});

		projectSessionsInFlight.set(cacheKey, promise);
	}

	/**
	 * Détail d'un projet pour le panneau du Holy Graph. `null` tant que les
	 * sessions ne sont pas en cache (l'appelant relance alors le fetch de fond).
	 *
	 * Un projet peut avoir plusieurs sessions sur un même campus (rejeu d'une
	 * ancienne version) : on retient la plus récente, celle dont l'id est le
	 * plus grand, qui est celle proposée aujourd'hui.
	 */
	static getProjectDetails(
		cursusId: number,
		campusId: number,
		projectId: number
	): GraphProjectDetails | null {
		const sessions = this.getProjectSessionsCached(cursusId, campusId);
		if (!sessions) return null;

		const mine = sessions.filter((s) => s.projectId === projectId);
		if (mine.length === 0) return null;
		const session = mine.reduce((best, s) => (s.id > best.id ? s : best));

		const catalog = this.getCursusProjectsCached(cursusId) ?? [];
		// slug -> nom lisible, pour traduire les prérequis (42 les référence par slug).
		const nameBySlug = new Map<string, string>();
		for (const p of catalog) {
			nameBySlug.set(p.slug, p.name.trim());
			// Les règles citent souvent le slug SANS le préfixe de cursus
			// (`libft` là où le catalogue dit `42cursus-libft`).
			const stripped = p.slug.replace(/^42cursus-/, '');
			if (!nameBySlug.has(stripped)) nameBySlug.set(stripped, p.name.trim());
		}
		const toProjects = (value: string | undefined) =>
			(value ?? '')
				.split(/\s+/)
				.filter(Boolean)
				.map((slug) => ({ slug, name: nameBySlug.get(slug) ?? slug }));

		const ruleNamed = (name: string) => session.rules.find((r) => r.name === name);
		const num = (value: string | undefined) => {
			const n = Number.parseInt(value ?? '', 10);
			return Number.isFinite(n) ? n : null;
		};

		const groupSize = ruleNamed('GroupSizeBetweenNAndM');
		const minimum = ruleNamed('MinimumProjectValidated');
		const minimumCount = num(minimum?.params[RULE_PARAM.minimumCount]);
		// La règle « ni en cours ni validé » se cite toujours elle-même : on retire
		// le projet courant, qui n'apprend rien, pour ne garder que ses alternatives
		// exclusives (ex. minishell ↔ 42sh, cub3d ↔ miniRT).
		const ownSlug = catalog.find((c) => c.id === projectId)?.slug ?? '';
		const ownSlugs = new Set([ownSlug, ownSlug.replace(/^42cursus-/, '')]);
		const exclusive = toProjects(
			ruleNamed('NeitherOngoingOrValidated')?.params[RULE_PARAM.neitherOngoingOrValidated]
		).filter((p) => !ownSlugs.has(p.slug));

		const quests = [
			...toProjects(ruleNamed('QuestsValidated')?.params[RULE_PARAM.questsValidated]),
			...toProjects(ruleNamed('QuestAndQuestValidated')?.params[RULE_PARAM.questAndQuestValidated]),
		].map((q) => q.slug);

		return {
			projectId,
			xp: session.difficulty,
			estimateTime: session.estimateTime,
			durationDays: session.durationDays,
			description: session.description,
			objectives: session.objectives,
			solo: session.solo,
			groupMin: num(groupSize?.params[RULE_PARAM.groupMin]),
			groupMax: num(groupSize?.params[RULE_PARAM.groupMax]) ?? session.maxPeople,
			correctionNumber: session.correctionNumber,
			uploads: session.uploads,
			isSubscriptable: session.isSubscriptable,
			retryDelayDays: num(ruleNamed('InDays')?.params[RULE_PARAM.retryDelayDays]),
			minLevel: num(ruleNamed('LevelMin')?.params[RULE_PARAM.levelMin]),
			requiredProjects: toProjects(ruleNamed('ProjectsValidated')?.params[RULE_PARAM.projectsValidated]),
			anyOfProjects:
				minimum && minimumCount != null
					? { count: minimumCount, projects: toProjects(minimum.params[RULE_PARAM.minimumProjects]) }
					: null,
			exclusiveProjects: exclusive,
			requiredQuests: [...new Set(quests)],
		};
	}

	/**
	 * Compétences par projet — ce sont les « layers » du graphe officiel
	 * (Algorithms & AI, DB & Data, Graphics, Security…). Déjà en cache mémoire
	 * ou `null`. Aucun appel réseau.
	 */
	static getProjectSkillsCached(cursusId: number, campusId: number | null): ProjectSkills | null {
		return projectSkillsCache.get(cacheKeyProjectSkills(cursusId, campusId))?.data ?? null;
	}

	/**
	 * Récupère les compétences en tâche de fond. Volontairement NON bloquant
	 * pour l'affichage : le graphe s'affiche sans attendre, et le sélecteur de
	 * layer apparaît dès que la donnée est là.
	 *
	 * `/v2/project_sessions_skills` compte ~43 000 lignes au global : on ne
	 * demande donc que les sessions du cursus et du campus concernés, par
	 * paquets de 50 identifiants (≈7 requêtes, une fois par mois).
	 */
	static ensureProjectSkillsFetching(cursusId: number, campusId: number | null): void {
		const cacheKey = cacheKeyProjectSkills(cursusId, campusId);
		if (this.getProjectSkillsCached(cursusId, campusId) !== null) return;
		if (projectSkillsInFlight.has(cacheKey)) return;

		// Sans le catalogue on ne sait pas quelles sessions interroger : on
		// réessaiera au prochain passage, une fois le catalogue en cache.
		const catalog = this.getCursusProjectsCached(cursusId);
		if (!catalog) return;

		const promise = (async () => {
			const persisted = await api42CacheRepository.getFresh<ProjectSkills>(cacheKey);
			if (persisted) {
				projectSkillsCache.set(cacheKey, { data: persisted, at: Date.now() });
				return;
			}

			const token = await appToken42Service.get();

			// 1) Le référentiel des compétences du cursus (id -> nom).
			const skills = await this.request<any[]>(
				`${config.oauth42.apiUrl}/cursus/${cursusId}/skills?page[size]=100`,
				token
			);
			const skillNames: Record<number, string> = {};
			for (const s of skills ?? []) {
				if (s?.id != null && s?.name) skillNames[s.id] = s.name;
			}

			// 2) Les compétences de chaque session affichée.
			const sessionToProject = new Map<number, number>();
			for (const p of catalog) {
				if (this.isExcludedFromGraph(p.name)) continue;
				for (const s of p.sessions) {
					if (s.cursusId !== cursusId) continue;
					if (campusId != null && s.campusId !== campusId) continue;
					sessionToProject.set(s.id, p.id);
				}
			}

			const sessionIds = [...sessionToProject.keys()];
			const byProject: Record<number, number[]> = {};
			const CHUNK = 50;
			for (let i = 0; i < sessionIds.length; i += CHUNK) {
				const chunk = sessionIds.slice(i, i + CHUNK);
				const rows = await this.request<any[]>(
					`${config.oauth42.apiUrl}/project_sessions_skills?filter[project_session_id]=${chunk.join(',')}&page[size]=100`,
					token
				);
				for (const row of rows ?? []) {
					const projectId = sessionToProject.get(row?.project_session_id);
					if (projectId == null || row?.skill_id == null) continue;
					const list = byProject[projectId] ?? [];
					if (!list.includes(row.skill_id)) list.push(row.skill_id);
					byProject[projectId] = list;
				}
			}

			const data: ProjectSkills = { skillNames, byProject };
			projectSkillsCache.set(cacheKey, { data, at: Date.now() });
			await api42CacheRepository.set(cacheKey, data);
			console.log(
				`[API42] Compétences (layers) récupérées pour le cursus ${cursusId} : ${Object.keys(byProject).length} projets`
			);
		})()
			.catch((error) => {
				console.error('[API42] Échec du fetch des compétences (layers) :', error?.message || error);
			})
			.finally(() => {
				projectSkillsInFlight.delete(cacheKey);
			});

		projectSkillsInFlight.set(cacheKey, promise);
	}

	/**
	 * Renseigne le campus des utilisateurs qui n'en ont pas encore.
	 *
	 * Le campus est normalement relevé à la connexion, sans coût. Ce rattrapage
	 * ne sert qu'aux comptes qui ne se sont pas reconnectés depuis l'ajout du
	 * champ : une requête par utilisateur concerné, une seule fois, et via le
	 * rate limiter. Renvoie le nombre de campus renseignés.
	 */
	static async backfillMissingCampuses(): Promise<number> {
		const users = await prisma.userSimulation.findMany({
			where: { campusId: null },
			select: { userId42: true },
		});
		if (users.length === 0) return 0;

		const token = await appToken42Service.get();
		let filled = 0;
		for (const { userId42 } of users) {
			try {
				const user = await this.request<any>(`${config.oauth42.apiUrl}/users/${userId42}`, token);
				const primary = (user?.campus_users ?? []).find((c: any) => c?.is_primary);
				const campusId: number | null = primary?.campus_id ?? user?.campus?.[0]?.id ?? null;
				if (campusId == null) continue;
				await prisma.userSimulation.update({ where: { userId42 }, data: { campusId } });
				filled++;
			} catch (error: any) {
				console.error(`[API42] Campus non récupéré pour ${userId42}:`, error?.message || error);
			}
		}
		console.log(`[API42] Campus renseigné pour ${filled}/${users.length} utilisateur(s)`);
		return filled;
	}

	/** Événements d'un utilisateur (filtrés pour le RNCP). */
	static async getUserEvents(userId: number, token: string): Promise<any[]> {
		const eventsData = await this.request<any[]>(
			`${config.oauth42.apiUrl}/users/${userId}/events_users`,
			token
		);

		const validEventKinds = [
			'meet_up', 'conference', 'exam', 'challenge', 'hackathon',
			'pedago', 'event', 'rush', 'workshop', 'partnership',
			'speed_working', 'meet', 'other',
		];

		return eventsData
			.map((eventUser: any) => eventUser.event)
			.filter((event: any) => validEventKinds.includes(event.kind));
	}

	/** Infos complètes de l'utilisateur connecté. */
	static async getMe(token: string): Promise<any> {
		return this.request<any>(`${config.oauth42.apiUrl}/me`, token);
	}

	/** Utilisateurs inscrits sur un projet (par slug). */
	static async getProjectRegisteredUsers(slug: string, token: string): Promise<{ login: string; id: number }[]> {
		const projects = await this.request<any[]>(
			`${config.oauth42.apiUrl}/projects?filter[slug]=${encodeURIComponent(slug)}&page[size]=1`,
			token
		);

		if (!projects || projects.length === 0) return [];
		const projectId = projects[0].id;

		const projectUsers = await this.request<any[]>(
			`${config.oauth42.apiUrl}/projects/${projectId}/projects_users?filter[cursus_id]=21&page[size]=100`,
			token
		);

		return (projectUsers || [])
			.filter((pu: any) => pu.user?.login)
			.map((pu: any) => ({ login: pu.user.login, id: pu.user.id }));
	}

	/**
	 * Récupère un instantané FRAIS des données 42 d'un utilisateur.
	 * Appelé uniquement par un refresh explicite (jamais en usage normal).
	 */
	static async fetchFresh(userId: number, token: string): Promise<UserData42Snapshot> {
		const [projects, cursus, events] = await Promise.all([
			this.getUserProjects(userId, token),
			this.getUserCursus(userId, token),
			this.getUserEvents(userId, token),
		]);

		const cursus42 = cursus.find((c: any) => c.cursus_id === 21);
		const validatedProjects = projects
			.filter((p: any) => p.validated === true)
			.map((p: any) => p.project.name);

		return {
			level: cursus42?.level || 0,
			projects: validatedProjects,
			eventsCount: events.length,
			allProjects: projects,
			allCursus: cursus,
			allEvents: events,
		};
	}

	/** Compteur horaire live (pour debug / ETA). */
	static getHourlyRemaining(): number | null {
		return rateLimiter.getHourlyRemaining();
	}

	/** Stats d'usage de l'API 42 (rate limiter + file de refresh) pour la page Conso API. */
	static getUsageStats() {
		return { ...rateLimiter.getStats(), refresh: refreshJobManager.getStats() };
	}
}

// ============================================================================
// REFRESH JOB MANAGER — file au niveau "refresh utilisateur"
//
// Un seul job de refresh à la fois. Un utilisateur déjà dans la file (ou en
// cours) ne peut pas en relancer un : il attend. Recharger la page ne
// contourne rien (l'état vit ici, côté serveur). À la fin, l'instantané est
// écrit en base ; l'usage normal lit la base sans jamais toucher l'API 42.
// ============================================================================
export type RefreshJobState = 'queued' | 'running';

export interface RefreshJobStatus {
	state: RefreshJobState;
	position: number; // 0 = en cours ; 1 = prochain ; ...
	etaSeconds: number;
}

interface RefreshJob {
	userId42: number;
	enqueuedAt: number;
}

class RefreshJobManager {
	private waiting: RefreshJob[] = [];
	private running: RefreshJob | null = null;
	private processing = false;
	// Dernier résultat par user (succès OU échec) : base du cooldown même quand le
	// fetch échoue (sinon aucun `fetchedAt` posé -> réenfilage instantané en boucle).
	// `status` = code HTTP de l'échec (ex. 401 = token 42 expiré).
	private lastResult = new Map<number, { at: number; ok: boolean; status?: number }>();

	/** Dernier résultat de job pour un utilisateur, ou null. */
	getLastResult(userId42: number): { at: number; ok: boolean; status?: number } | null {
		return this.lastResult.get(userId42) ?? null;
	}

	/** Nombre de refresh en attente / en cours (pour la page Conso API). */
	getStats(): { waiting: number; running: number } {
		return { waiting: this.waiting.length, running: this.running ? 1 : 0 };
	}

	/** Estimation de durée d'un job : ~5 requêtes espacées + marge. */
	private estJobMs(): number {
		return 5 * config.api42.minDelayMs + 900;
	}

	/** Statut du job d'un utilisateur, ou null s'il n'en a pas. */
	getStatus(userId42: number): RefreshJobStatus | null {
		if (this.running?.userId42 === userId42) {
			return { state: 'running', position: 0, etaSeconds: Math.ceil(this.estJobMs() / 1000) };
		}
		const idx = this.waiting.findIndex((j) => j.userId42 === userId42);
		if (idx === -1) return null;
		const jobsAhead = idx + (this.running ? 1 : 0);
		return {
			state: 'queued',
			position: idx + 1,
			etaSeconds: Math.ceil(((jobsAhead + 1) * this.estJobMs()) / 1000),
		};
	}

	has(userId42: number): boolean {
		return this.running?.userId42 === userId42 || this.waiting.some((j) => j.userId42 === userId42);
	}

	/**
	 * Met un refresh en file (ou renvoie le job existant si déjà présent).
	 * Le token 42 n'est PAS capturé ici : il est résolu (et rafraîchi si besoin)
	 * au moment de l'exécution du job, pour ne jamais dépendre d'un token gelé.
	 */
	enqueue(userId42: number): RefreshJobStatus {
		const existing = this.getStatus(userId42);
		if (existing) return existing;

		this.waiting.push({ userId42, enqueuedAt: Date.now() });
		void this.process();
		return this.getStatus(userId42)!;
	}

	private async process(): Promise<void> {
		if (this.processing) return;
		this.processing = true;

		while (this.waiting.length > 0) {
			const job = this.waiting.shift()!;
			this.running = job;
			let ok = false;
			let status: number | undefined;
			try {
				// Token 42 valide, rafraîchi au besoin. null => reconnexion requise :
				// on marque 401 pour que le front affiche « session expirée ».
				const token = await token42Service.getValidAccessToken(job.userId42);
				if (!token) {
					status = 401;
					throw new Error('Aucun token 42 valide (reconnexion requise)');
				}
				const snapshot = await API42Service.fetchFresh(job.userId42, token);
				await userData42Repository.upsert(job.userId42, snapshot);
				ok = true;
				console.log(`[Refresh] Instantané mis à jour pour ${job.userId42}`);
			} catch (error: any) {
				// Échec : `fetchedAt` reste inchangé, mais on mémorise la tentative
				// (lastResult) pour appliquer un cooldown et éviter le réenfilage en boucle.
				status = status ?? error?.response?.status;
				console.error(`[Refresh] Échec du job pour ${job.userId42} (status ${status ?? '?'}):`, error?.message || error);
			} finally {
				this.lastResult.set(job.userId42, { at: Date.now(), ok, status });
				this.running = null;
			}
		}

		this.processing = false;
	}
}

export const refreshJobManager = new RefreshJobManager();
