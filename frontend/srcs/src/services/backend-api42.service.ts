import { backendAuthService } from './backend-auth.service';
import { config } from '@/config/config';

const BACKEND_URL = config.backendUrl;

// ID de l'utilisateur consulté (mode lecture seule)
let _viewUserId: number | null = null;

export function setViewUserId(id: number | null) {
  _viewUserId = id;
}

export function getViewUserId(): number | null {
  return _viewUserId;
}

export interface Project42 {
  id: number;
  project: {
    id: number;
    name: string;
    slug: string;
  };
  final_mark: number;
  validated: boolean;
  marked: boolean;
  status: string;
  created_at?: string;
  marked_at?: string;
}

export interface CursusUser {
  id: number;
  cursus_id: number;
  level: number;
  grade: string;
}

export interface Event42 {
  id: number;
  name: string;
  kind: string;
  begin_at: string;
  end_at: string;
}

export interface UserData {
  level: number;
  projects: string[];
  eventsCount: number;
  allProjects: Project42[];
  allCursus: CursusUser[];
  allEvents: Event42[];
}

/** État d'un job de refresh dans la file d'attente serveur. */
export interface RefreshJobStatus {
  state: 'queued' | 'running';
  position: number; // 0 = en cours, 1 = prochain, ...
  etaSeconds: number;
}

/** Métadonnées renvoyées avec l'instantané (fraîcheur, job en cours, cooldown). */
export interface UserDataMeta {
  fetchedAt: string | null; // null = jamais synchronisé
  job: RefreshJobStatus | null;
  cooldownSeconds: number; // temps restant avant prochain refresh possible
  canRefresh: boolean;
  isViewingOther: boolean;
  // Catégorie de la dernière synchro en échec (aucune donnée) : 'auth' = token 42 expiré.
  lastError: 'auth' | 'other' | null;
}

export type UserDataResponse = UserData & { _meta: UserDataMeta };

/** Réponse à une demande de refresh (POST /api42/refresh). */
export interface RefreshEnqueueResult {
  ok: boolean;
  job?: RefreshJobStatus;
  code?: 'COOLDOWN';
  retryInSeconds?: number;
  message?: string;
}

/** Usage courant de l'API 42 (GET /api42/usage) — pour la page Conso API. */
export interface ApiUsageStats {
  hourlyLimit: number;
  hourlyRemaining: number | null; // null tant qu'aucune requête n'a été observée
  secondlyLimit: number;
  secondlyRemaining: number | null;
  requestsLastHour: number; // requêtes émises par notre backend sur la dernière heure
  queueDepth: number; // requêtes bas-niveau en attente dans le rate limiter
  paused: boolean;
  pausedForSeconds: number;
  minDelayMs: number;
  lastRequestAt: string | null;
  refresh: { waiting: number; running: number };
}

/** État courant du refresh (GET /api42/refresh/status). */
export interface RefreshStatusResult {
  job: RefreshJobStatus | null;
  fetchedAt: string | null;
  cooldownSeconds: number;
  canRefresh: boolean;
  /** Dernière tentative en échec et toujours aucune donnée (première synchro ratée). */
  lastFailed: boolean;
}

/**
 * Un nœud du Holy Graph officiel : `x`/`y` et `kind` viennent directement de
 * `/v2/project_data` (l'endpoint qui dessine projects.intra.42.fr/projects/graph),
 * le statut vient du snapshot personnel de l'utilisateur.
 */
export interface HolyGraphProject {
  id: number;
  name: string;
  slug: string;
  difficulty: number;
  exam: boolean;
  /** project | big_project | rush | piscine | exam — le type de nœud tel que 42 le classe. */
  kind: string;
  x: number;
  y: number;
  status: string;
  validated: boolean;
  finalMark: number | null;
}

/** Un lien du graphe officiel : segment déjà calculé par 42. */
export interface HolyGraphEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface HolyGraphCursus {
  id: number;
  name: string;
  level: number;
  /** true tant que le layout officiel est en cours de récupération côté serveur. */
  loading: boolean;
  projects: HolyGraphProject[];
  edges: HolyGraphEdge[];
}

export interface HolyGraphResponse {
  cursus: HolyGraphCursus[];
}

/**
 * Service pour récupérer les données de l'API 42 via le backend
 */
export class BackendAPI42Service {
  /**
   * Effectue une requête vers le backend
   */
  private static async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const jwtToken = backendAuthService.getToken();

    if (!jwtToken) {
      throw new Error('No authentication token available. Please login first.');
    }

    let url = `${BACKEND_URL}${endpoint}`;
    // Mode lecture seule : consulter le profil public d'un autre utilisateur.
    if (_viewUserId !== null) {
      const separator = url.includes('?') ? '&' : '?';
      url += `${separator}view_user_id=${_viewUserId}`;
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${jwtToken}`,
        ...(options?.headers as Record<string, string> | undefined),
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token expiré ou invalide, déconnecter l'utilisateur
        console.error('[BackendAPI42] Token expired or invalid, logging out');
        await backendAuthService.logout();
        
        // Récupérer le message d'erreur pour affichage
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.code === 'TOKEN_EXPIRED'
          ? 'Your session has expired. Please login again.'
          : 'Session expired. Please login again.';
        
        // Rediriger vers la page de login
        window.location.href = '/';
        throw new Error(errorMessage);
      }
      
      // Autres erreurs
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.message || response.statusText;
      throw new Error(`API request failed: ${errorMessage}`);
    }

    return response.json();
  }

  /**
   * Récupère les projets de l'utilisateur
   */
  static async getUserProjects(): Promise<Project42[]> {
    return this.request<Project42[]>('/api42/projects');
  }

  /**
   * Récupère les cursus de l'utilisateur
   */
  static async getUserCursus(): Promise<CursusUser[]> {
    return this.request<CursusUser[]>('/api42/cursus');
  }

  /**
   * Récupère les événements de l'utilisateur
   */
  static async getUserEvents(): Promise<Event42[]> {
    return this.request<Event42[]>('/api42/events');
  }

  /**
   * Récupère l'instantané des données utilisateur (stocké en base côté serveur).
   * NE déclenche AUCUN appel à l'API 42 : l'usage normal ne rafraîchit jamais.
   * Utiliser requestRefresh() pour forcer une mise à jour.
   */
  static async getUserData(): Promise<UserDataResponse> {
    return this.request<UserDataResponse>('/api42/user-data');
  }

  /**
   * Déclenche un refresh (mise en file d'attente serveur, soi uniquement).
   * Renvoie la position/ETA, ou un refus si cooldown non écoulé.
   */
  static async requestRefresh(): Promise<RefreshEnqueueResult> {
    return this.request<RefreshEnqueueResult>('/api42/refresh', { method: 'POST' });
  }

  /**
   * État courant du refresh (job en cours + cooldown). Permet de restaurer
   * le badge après un rechargement de page.
   */
  static async getRefreshStatus(): Promise<RefreshStatusResult> {
    return this.request<RefreshStatusResult>('/api42/refresh/status');
  }

  /**
   * Usage courant de l'API 42 (budget restant, file, débit). Lecture en mémoire
   * côté serveur : appeler cet endroit ne consomme AUCUNE requête 42.
   */
  static async getUsage(): Promise<ApiUsageStats> {
    return this.request<ApiUsageStats>('/api42/usage');
  }

  /**
   * Récupère les infos complètes de l'utilisateur depuis l'API 42
   */
  static async getMe(): Promise<unknown> {
    return this.request<unknown>('/api42/me');
  }

  /**
   * Récupère les projets validés (seulement ceux qui ont validated = true)
   */
  static async getValidatedProjects(): Promise<string[]> {
    const projects = await this.getUserProjects();
    return projects
      .filter((p) => p.validated === true || (p.final_mark !== undefined && p.final_mark >= 100))
      .map((p) => p.project.slug);
  }

  /**
   * Récupère le niveau actuel de l'utilisateur (depuis le cursus 42)
   */
  static async getCurrentLevel(): Promise<{ level: number; xp: number }> {
    const cursusUsers = await this.getUserCursus();
    const cursus42 = cursusUsers.find((c) => c.cursus_id === 21);

    if (!cursus42) {
      return { level: 0, xp: 0 };
    }

    return {
      level: cursus42.level,
      xp: 0, // Sera calculé avec le service XP
    };
  }

  /**
   * Compte le nombre d'événements validés
   */
  static async getEventsCount(): Promise<number> {
    const events = await this.getUserEvents();
    return events.length;
  }

  /**
   * Récupère les utilisateurs inscrits sur un projet depuis l'intra 42
   */
  static async getProjectIntraUsers(slug: string): Promise<{ login: string; id: number }[]> {
    return this.request<{ login: string; id: number }[]>(`/api42/project-users/${encodeURIComponent(slug)}`);
  }

  /**
   * Holy Graph : catalogue complet des projets de chaque cursus suivi par
   * l'utilisateur (tronc commun + cursus secondaires), avec son statut perso.
   */
  static async getHolyGraph(): Promise<HolyGraphResponse> {
    return this.request<HolyGraphResponse>('/api42/holy-graph');
  }
}
