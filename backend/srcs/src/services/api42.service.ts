import axios from 'axios';
import { config } from '../config/config.js';

// ===== CACHE =====
interface CacheEntry {
  data: any;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 jours
const CACHE_MIN_AGE = 10 * 60 * 1000; // 10 minutes minimum avant refresh

export class CacheService {
  static get(key: string): any | null {
    const entry = cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > CACHE_TTL) {
      cache.delete(key);
      return null;
    }

    console.log(`[Cache] Hit for key: ${key} (age: ${Math.round(age / 1000)}s)`);
    return entry.data;
  }

  static getAge(key: string): number | null {
    const entry = cache.get(key);
    if (!entry) return null;
    return Date.now() - entry.timestamp;
  }

  static set(key: string, data: any): void {
    cache.set(key, {
      data,
      timestamp: Date.now(),
    });
    console.log(`[Cache] Set for key: ${key}`);
  }

  static isMinAgeRespected(key: string): boolean {
    const age = this.getAge(key);
    return age !== null && age < CACHE_MIN_AGE;
  }
}

// ===== RATE LIMITER =====
interface QueuedRequest<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
}

class API42RateLimiter {
  private queue: QueuedRequest<any>[] = [];
  private processing = false;
  private lastRequestTime = 0;
  private readonly minDelay = 100; // millisecondes

  async enqueue<T>(execute: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({ execute, resolve, reject });
      console.log(`[API42 Queue] Request added (queue size: ${this.queue.length})`);

      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift()!;

      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;

      if (timeSinceLastRequest < this.minDelay) {
        const waitTime = this.minDelay - timeSinceLastRequest;
        console.log(`[API42 Queue] Waiting ${waitTime}ms (${this.queue.length} in queue)...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      try {
        console.log(`[API42 Queue] Executing request (${this.queue.length} remaining)`);
        const result = await request.execute();
        this.lastRequestTime = Date.now();
        request.resolve(result);
      } catch (error) {
        request.reject(error);
      }
    }

    this.processing = false;
    console.log('[API42 Queue] Queue empty');
  }
}

const rateLimiter = new API42RateLimiter();

// ===== API 42 SERVICE =====
export class API42Service {
  /**
   * Effectue une requête vers l'API 42 avec rate limiting automatique
   */
  static async request<T>(url: string, token: string): Promise<T> {
    return rateLimiter.enqueue(async () => {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    });
  }

  /**
   * Récupère tous les projets d'un utilisateur (avec pagination)
   */
  static async getUserProjects(userId: number, token: string): Promise<any[]> {
    let page = 1;
    const pageSize = 100;
    const allProjects: any[] = [];

    while (true) {
      const url = `${config.oauth42.apiUrl}/users/${userId}/projects_users?page[number]=${page}&page[size]=${pageSize}`;
      const projects = await this.request<any[]>(url, token);

      if (!projects || projects.length === 0) {
        break;
      }

      console.log(`[API42 Service] Fetched page ${page}, ${projects.length} projects`);
      
      allProjects.push(...projects);
      if (projects.length < pageSize) {
        break;
      }
      page++;
    }

    // Normaliser "validated?" en "validated"
    return allProjects.map((project: any) => ({
      ...project,
      validated: project['validated?'] !== undefined ? project['validated?'] : project.validated,
    }));
  }

  /**
   * Récupère les cursus d'un utilisateur
   */
  static async getUserCursus(userId: number, token: string): Promise<any[]> {
    return this.request<any[]>(
      `${config.oauth42.apiUrl}/users/${userId}/cursus_users`,
      token
    );
  }

  /**
   * Récupère les événements d'un utilisateur (filtrés pour le RNCP)
   */
  static async getUserEvents(userId: number, token: string): Promise<any[]> {
    const eventsData = await this.request<any[]>(
      `${config.oauth42.apiUrl}/users/${userId}/events_users`,
      token
    );

    const validEventKinds = [
      'meet_up', 'conference', 'exam', 'challenge', 'hackathon',
      'pedago', 'event', 'rush', 'workshop', 'partnership',
      'speed_working', 'meet', 'other'
    ];

    return eventsData
      .map((eventUser: any) => eventUser.event)
      .filter((event: any) => validEventKinds.includes(event.kind));
  }

  /**
   * Récupère les informations complètes de l'utilisateur connecté
   */
  static async getMe(token: string): Promise<any> {
    return this.request<any>(`${config.oauth42.apiUrl}/me`, token);
  }

  /**
   * Récupère toutes les données utilisateur en une fois (avec cache)
   */
  static async getUserData(userId: number, token: string, forceRefresh: boolean = false): Promise<any> {
    const cacheKey = `user-data-${userId}`;

    // Vérifier le cache minimum age
    if (CacheService.isMinAgeRespected(cacheKey)) {
      console.log(`[API42 Service] Cache too fresh, refusing bypass - preventing rate limit`);
      const cached = CacheService.get(cacheKey);
      if (cached) return cached;
    }

    // Vérifier le cache normal
    if (!forceRefresh) {
      const cached = CacheService.get(cacheKey);
      if (cached) {
        console.log('[API42 Service] Returning cached data');
        return cached;
      }
    } else {
      console.log('[API42 Service] Cache bypass requested');
    }

    // Faire les requêtes
    console.log('[API42 Service] Fetching all user data from API 42...');

    const [projects, cursus, events] = await Promise.all([
      this.getUserProjects(userId, token),
      this.getUserCursus(userId, token),
      this.getUserEvents(userId, token),
    ]);

    const cursus42 = cursus.find((c: any) => c.cursus_id === 21);
    const validatedProjects = projects
      .filter((p: any) => p.validated === true)
      .map((p: any) => p.project.name);

    const result = {
      level: cursus42?.level || 0,
      projects: validatedProjects,
      eventsCount: events.length,
      allProjects: projects,
      allCursus: cursus,
      allEvents: events,
    };

    // Mettre en cache
    CacheService.set(cacheKey, result);

    return result;
  }
}
