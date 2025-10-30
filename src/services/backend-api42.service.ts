import { backendAuthService } from './backend-auth.service';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:7000';

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

/**
 * Service pour récupérer les données de l'API 42 via le backend
 */
export class BackendAPI42Service {
  /**
   * Effectue une requête vers le backend
   */
  private static async request<T>(endpoint: string): Promise<T> {
    const jwtToken = backendAuthService.getToken();

    if (!jwtToken) {
      throw new Error('No authentication token available. Please login first.');
    }

    const response = await fetch(`${BACKEND_URL}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${jwtToken}`,
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
    return this.request<Project42[]>('/api/api42/projects');
  }

  /**
   * Récupère les cursus de l'utilisateur
   */
  static async getUserCursus(): Promise<CursusUser[]> {
    return this.request<CursusUser[]>('/api/api42/cursus');
  }

  /**
   * Récupère les événements de l'utilisateur
   */
  static async getUserEvents(): Promise<Event42[]> {
    return this.request<Event42[]>('/api/api42/events');
  }

  /**
   * Récupère toutes les données utilisateur en une fois (optimisé)
   */
  static async getUserData(forceRefresh = false): Promise<UserData> {
    const endpoint = forceRefresh 
      ? '/api/api42/user-data?refresh=true' 
      : '/api/api42/user-data';
    return this.request<UserData>(endpoint);
  }

  /**
   * Récupère les infos complètes de l'utilisateur depuis l'API 42
   */
  static async getMe(): Promise<unknown> {
    return this.request<unknown>('/api/api42/me');
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
}
