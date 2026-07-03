import axios from 'axios';
import { config } from '../config/config.js';
import { userData42Repository, UserData42Snapshot } from '../db/userData42Repository.js';
import { token42Service } from './token42.service.js';

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

	enqueue<T>(url: string, token: string): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.queue.push({ url, token, resolve, reject, retries: 0 });
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
					timeout: config.api42.requestTimeoutMs, // évite qu'une requête pendue gèle la file
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

// ============================================================================
// API 42 SERVICE — chaque requête passe par le rate limiter
// ============================================================================
export class API42Service {
	static async request<T>(url: string, token: string): Promise<T> {
		return rateLimiter.enqueue<T>(url, token);
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
