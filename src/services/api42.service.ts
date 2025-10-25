import { config } from '@/config/config';
import type { Project42, CursusUser, Event42 } from '@/types/rncp.types';
import { storage } from '@/utils/storage';

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CachedData<T> {
  data: T;
  timestamp: number;
}

const CACHE_KEYS = {
  USER_DATA: 'cached_user_data',
  PROJECTS: 'cached_projects',
  CURSUS: 'cached_cursus',
  EVENTS: 'cached_events',
};

// Helper pour vérifier si le cache est valide
const isCacheValid = (timestamp: number): boolean => {
  return Date.now() - timestamp < CACHE_DURATION;
};

// Helper pour faire une requête avec retry en cas de rate limit
const fetchWithRetry = async (url: string, accessToken: string, retries = 0): Promise<Response> => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 429 && retries < 3) {
    // Rate limited, attendre avant de réessayer
    const waitTime = Math.pow(2, retries) * 1000; // Exponential backoff
    console.log(`Rate limited, waiting ${waitTime}ms before retry...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    return fetchWithRetry(url, accessToken, retries + 1);
  }

  return response;
};

export const api42Service = {
  // Récupérer les projets de l'utilisateur
  getUserProjects: async (accessToken: string, userId: number): Promise<Project42[]> => {
    // Vérifier le cache
    const cached = storage.get(CACHE_KEYS.PROJECTS) as CachedData<Project42[]> | null;
    if (cached && isCacheValid(cached.timestamp)) {
      console.log('Using cached projects data');
      return cached.data;
    }

    const response = await fetchWithRetry(
      `${config.oauth.apiUrl}/users/${userId}/projects_users`,
      accessToken
    );

    if (!response.ok) {
      throw new Error('Failed to fetch user projects');
    }

    const rawData = await response.json();
    
    // L'API 42 retourne "validated?" au lieu de "validated"
    // On transforme les données pour avoir la bonne structure
    const data = rawData.map((project: Record<string, unknown>) => {
      return {
        ...project,
        validated: project['validated?'] !== undefined ? project['validated?'] : project.validated,
      };
    }) as Project42[];
    
    // Mettre en cache
    storage.set(CACHE_KEYS.PROJECTS, {
      data,
      timestamp: Date.now(),
    });

    return data;
  },

  // Récupérer les informations de cursus de l'utilisateur
  getUserCursus: async (accessToken: string, userId: number): Promise<CursusUser[]> => {
    // Vérifier le cache
    const cached = storage.get(CACHE_KEYS.CURSUS) as CachedData<CursusUser[]> | null;
    if (cached && isCacheValid(cached.timestamp)) {
      console.log('Using cached cursus data');
      return cached.data;
    }

    const response = await fetchWithRetry(
      `${config.oauth.apiUrl}/users/${userId}/cursus_users`,
      accessToken
    );

    if (!response.ok) {
      throw new Error('Failed to fetch user cursus');
    }

    const data = await response.json();
    
    // Mettre en cache
    storage.set(CACHE_KEYS.CURSUS, {
      data,
      timestamp: Date.now(),
    });

    return data;
  },

  // Récupérer le niveau et l'XP actuel (depuis le cursus 42)
  getCurrentLevel: async (accessToken: string, userId: number): Promise<{ level: number; xp: number }> => {
    const cursusUsers = await api42Service.getUserCursus(accessToken, userId);
    
    // Trouver le cursus 42 (ID 21)
    const cursus42 = cursusUsers.find((c) => c.cursus_id === 21);
    
    if (!cursus42) {
      return { level: 0, xp: 0 };
    }

    // TODO: Calculer l'XP exact depuis le fichier level.json
    return {
      level: cursus42.level,
      xp: 0, // Sera calculé avec le service XP
    };
  },

  // Récupérer les événements auxquels l'utilisateur a participé
  getUserEvents: async (accessToken: string, userId: number): Promise<Event42[]> => {
    // Vérifier le cache
    const cached = storage.get(CACHE_KEYS.EVENTS) as CachedData<Event42[]> | null;
    if (cached && isCacheValid(cached.timestamp)) {
      console.log('Using cached events data');
      return cached.data;
    }

    const response = await fetchWithRetry(
      `${config.oauth.apiUrl}/users/${userId}/events`,
      accessToken
    );

    if (!response.ok) {
      throw new Error('Failed to fetch user events');
    }

    const data = await response.json();
    
    // Mettre en cache
    storage.set(CACHE_KEYS.EVENTS, {
      data,
      timestamp: Date.now(),
    });

    return data;
  },

  // Compter le nombre d'événements validés
  getEventsCount: async (accessToken: string, userId: number): Promise<number> => {
    const events = await api42Service.getUserEvents(accessToken, userId);
    return events.length;
  },

  // Récupérer les projets validés (seulement ceux qui ont une note >= 100)
  getValidatedProjects: async (accessToken: string, userId: number): Promise<string[]> => {
    const projects = await api42Service.getUserProjects(accessToken, userId);
    
    return projects
      .filter((p) => p.validated === true || (p.final_mark !== undefined && p.final_mark >= 100))
      .map((p) => p.project.slug);
  },

  // Récupérer toutes les données utilisateur en une fois
  getUserData: async (accessToken: string, userId: number) => {
    // Vérifier le cache global
    const cached = storage.get(CACHE_KEYS.USER_DATA) as CachedData<{
      level: number;
      projects: string[];
      eventsCount: number;
      allProjects: Project42[];
    }> | null;
    
    if (cached && isCacheValid(cached.timestamp)) {
      console.log('Using cached user data');
      return cached.data;
    }

    // Les requêtes individuelles utilisent déjà le cache, donc on peut faire Promise.all
    const [projects, cursusUsers, events] = await Promise.all([
      api42Service.getUserProjects(accessToken, userId),
      api42Service.getUserCursus(accessToken, userId),
      api42Service.getUserEvents(accessToken, userId),
    ]);

    const cursus42 = cursusUsers.find((c) => c.cursus_id === 21);
    const validatedProjects = projects
      .filter((p) => p.validated === true)
      .map((p) => p.project.name);

    const userData = {
      level: cursus42?.level || 0,
      projects: validatedProjects,
      eventsCount: events.length,
      allProjects: projects,
    };

    // Mettre en cache
    storage.set(CACHE_KEYS.USER_DATA, {
      data: userData,
      timestamp: Date.now(),
    });

    return userData;
  },

  // Fonction pour vider le cache (utile pour forcer un refresh)
  clearCache: () => {
    storage.remove(CACHE_KEYS.USER_DATA);
    storage.remove(CACHE_KEYS.PROJECTS);
    storage.remove(CACHE_KEYS.CURSUS);
    storage.remove(CACHE_KEYS.EVENTS);
  },
};
