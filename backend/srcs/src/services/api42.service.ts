import axios from 'axios';
import { config } from '../config/config.js';
import { userData42Repository, UserData42Snapshot } from '../db/userData42Repository.js';
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

// Cache mémoire du catalogue "cursus -> projets" (Holy Graph). Partagé entre
// tous les utilisateurs : le contenu d'un cursus ne dépend de personne.
const CURSUS_PROJECTS_TTL_MS = 24 * 60 * 60 * 1000;
const CURSUS_PROJECTS_PAGE_TIMEOUT_MS = 30_000; // mesuré ~10s/page côté API 42, large marge
const cursusProjectsCache = new Map<number, { data: any[]; at: number }>();
const cursusProjectsInFlight = new Map<number, Promise<void>>();

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

const PROJECT_DATA_TTL_MS = 24 * 60 * 60 * 1000;
let projectDataCache: { data: any[]; at: number } | null = null;
let projectDataInFlight: Promise<void> | null = null;

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

// Campus de l'utilisateur : détermine QUELS projets sont affichés (on ne montre
// que ceux réellement proposés sur son campus). Mis en cache 24h par user.
const USER_CAMPUS_TTL_MS = 24 * 60 * 60 * 1000;
const userCampusCache = new Map<number, { campusId: number | null; at: number }>();

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
	static getCursusProjectsCached(cursusId: number): any[] | null {
		const cached = cursusProjectsCache.get(cursusId);
		if (cached && Date.now() - cached.at < CURSUS_PROJECTS_TTL_MS) return cached.data;
		return null;
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
			cursusProjectsCache.set(cursusId, { data: all, at: Date.now() });
		})()
			.catch((error) => {
				console.error(`[API42] Échec du fetch du catalogue cursus ${cursusId}:`, error?.message || error);
			})
			.finally(() => {
				cursusProjectsInFlight.delete(cursusId);
			});

		cursusProjectsInFlight.set(cursusId, promise);
	}

	/** Layout officiel déjà en cache et frais, ou `null`. Aucun appel réseau. */
	static getProjectDataCached(): any[] | null {
		if (projectDataCache && Date.now() - projectDataCache.at < PROJECT_DATA_TTL_MS) {
			return projectDataCache.data;
		}
		return null;
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
			projectDataCache = { data: all, at: Date.now() };
			console.log(`[API42] Layout officiel du Holy Graph récupéré : ${all.length} entrées`);
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
			for (const s of p.project_sessions ?? []) {
				if (s?.id == null || s.cursus_id !== cursusId) continue;
				projectBySession.set(s.id, p.id);
				if (campusId == null || s.campus_id === campusId) offeredHere.add(p.id);
			}
		}

		// Chaque campus peut décaler sa propre version du graphe : un même projet
		// a donc plusieurs positions (167 sur 232 dans le 42cursus). Prendre la
		// première venue mélange les layouts et déplace des projets ; on retient
		// la position MAJORITAIRE, qui est la disposition de référence.
		const placements = new Map<number, { kind: string; x: number; y: number; by: any[] }[]>();
		for (const entry of projectData) {
			const projectId = projectBySession.get(entry?.project_session_id);
			if (projectId == null || !offeredHere.has(projectId)) continue;

			const [x, y] = entry.coordinates ?? [];
			// [0,0] = projet non placé sur le graphe officiel (donc pas affiché).
			if (typeof x !== 'number' || typeof y !== 'number' || (x === 0 && y === 0)) continue;

			const list = placements.get(projectId) ?? [];
			list.push({ kind: entry.kind ?? 'project', x, y, by: entry.by ?? [] });
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
	 * Campus de l'utilisateur (mis en cache 24h). Sert à n'afficher que les
	 * projets réellement proposés là où il étudie. `null` si on n'arrive pas à
	 * le déterminer : dans ce cas on n'applique aucun filtre campus.
	 */
	static async getUserCampusId(userId: number): Promise<number | null> {
		const cached = userCampusCache.get(userId);
		if (cached && Date.now() - cached.at < USER_CAMPUS_TTL_MS) return cached.campusId;

		try {
			const token = await appToken42Service.get();
			const user = await this.request<any>(`${config.oauth42.apiUrl}/users/${userId}`, token);
			// `campus_users` porte le campus principal quand l'utilisateur en a plusieurs.
			const primary = (user?.campus_users ?? []).find((c: any) => c?.is_primary);
			const campusId: number | null =
				primary?.campus_id ?? user?.campus?.[0]?.id ?? null;
			userCampusCache.set(userId, { campusId, at: Date.now() });
			return campusId;
		} catch (error: any) {
			console.error(`[API42] Campus introuvable pour ${userId}:`, error?.message || error);
			return null;
		}
	}

	/** Un projet purement administratif (contrat d'alternance, stage) ? */
	static isExcludedFromGraph(name: string): boolean {
		return EXCLUDED_NAME_RE.test(name.trim());
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
