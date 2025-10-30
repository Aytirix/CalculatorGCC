import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';
import { config } from '../config/config.js';
import { authenticate } from '../middlewares/auth.middleware.js';

// Cache simple en mémoire pour éviter le rate limiting
interface CacheEntry {
  data: any;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL =  7 * 24 * 60 * 60 * 1000; // 7 jours (réduit le spam API 42)
const CACHE_MIN_AGE = 60 * 1000; // 1 minute - ne jamais refetch avant ce délai, même avec forceRefresh

function getCached(key: string): any | null {
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

function getCachedAge(key: string): number | null {
  const entry = cache.get(key);
  if (!entry) return null;
  return Date.now() - entry.timestamp;
}

function setCache(key: string, data: any): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
  });
  console.log(`[Cache] Set for key: ${key}`);
}

/**
 * Gère les erreurs de l'API 42 et renvoie la réponse appropriée
 */
function handleAPI42Error(error: any, reply: FastifyReply, fastify: FastifyInstance): void {
  console.error('[API42 Routes] Error:', error.message);
  console.error('[API42 Routes] Error response:', error.response?.data);
  console.error('[API42 Routes] Error status:', error.response?.status);
  
  // Si le token API 42 a expiré, renvoyer 401 pour forcer la déconnexion
  if (error.response?.status === 401) {
    fastify.log.error('API 42 token expired, user needs to re-authenticate');
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'API 42 token expired. Please login again.',
      code: 'TOKEN_EXPIRED'
    });
    return;
  }
  
  // Si rate limit, renvoyer 429
  if (error.response?.status === 429) {
    fastify.log.error('API 42 rate limit exceeded');
    reply.code(429).send({
      error: 'Too Many Requests',
      message: 'API 42 rate limit exceeded. Please try again later.',
      code: 'RATE_LIMIT'
    });
    return;
  }
  
  // Autre erreur
  fastify.log.error('Error calling API 42:', error.response?.data || error.message);
  reply.code(500).send({
    error: 'Internal Server Error',
    message: 'Failed to fetch data from API 42'
  });
}

export async function api42Routes(fastify: FastifyInstance) {
  // Récupérer les projets de l'utilisateur
  fastify.get('/api42/projects', {
    preHandler: authenticate,
  }, async (request: FastifyRequest) => {
    try {
      const { api_token, user_id_42 } = request.user;
      
      const response = await axios.get(
        `${config.oauth42.apiUrl}/users/${user_id_42}/projects_users`,
        {
          headers: {
            Authorization: `Bearer ${api_token}`,
          },
        }
      );

      // Transformer les données pour avoir "validated" au lieu de "validated?"
      const data = response.data.map((project: any) => ({
        ...project,
        validated: project['validated?'] !== undefined ? project['validated?'] : project.validated,
      }));

      return data;
    } catch (error: any) {
      fastify.log.error('Error fetching projects:', error.response?.data || error.message);
      throw new Error('Failed to fetch user projects');
    }
  });

  // Récupérer les cursus de l'utilisateur
  fastify.get('/api42/cursus', {
    preHandler: authenticate,
  }, async (request: FastifyRequest) => {
    try {
      const { api_token, user_id_42 } = request.user;
      
      const response = await axios.get(
        `${config.oauth42.apiUrl}/users/${user_id_42}/cursus_users`,
        {
          headers: {
            Authorization: `Bearer ${api_token}`,
          },
        }
      );

      return response.data;
    } catch (error: any) {
      fastify.log.error('Error fetching cursus:', error.response?.data || error.message);
      throw new Error('Failed to fetch user cursus');
    }
  });

  // Récupérer les événements de l'utilisateur
  fastify.get('/api42/events', {
    preHandler: authenticate,
  }, async (request: FastifyRequest) => {
    try {
      const { api_token, user_id_42 } = request.user;
      
      const response = await axios.get(
        `${config.oauth42.apiUrl}/users/${user_id_42}/events_users`,
        {
          headers: {
            Authorization: `Bearer ${api_token}`,
          },
        }
      );

      // Filtrer uniquement les événements valides pour le RNCP
      const validEventKinds = [
        'meet_up', 'conference', 'exam', 'challenge', 'hackathon',
        'pedago', 'event', 'rush', 'workshop', 'partnership',
        'speed_working', 'meet', 'other'
      ];

      const events = response.data
        .map((eventUser: any) => eventUser.event)
        .filter((event: any) => validEventKinds.includes(event.kind));

      return events;
    } catch (error: any) {
      fastify.log.error('Error fetching events:', error.response?.data || error.message);
      throw new Error('Failed to fetch user events');
    }
  });

  // Récupérer toutes les données utilisateur en une fois
  fastify.get('/api42/user-data', {
    preHandler: authenticate,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { api_token, user_id_42 } = request.user;
      const { refresh } = request.query as { refresh?: string };
      
      console.log('[API42 Routes] Fetching user data for user_id:', user_id_42);
      
      // Vérifier le cache d'abord
      const cacheKey = `user-data-${user_id_42}`;
      const cacheAge = getCachedAge(cacheKey);
      
      // Si le cache existe et a moins de 1 minute, TOUJOURS le retourner (même avec refresh)
      // pour éviter le spam API 42 et le rate limiting
      if (cacheAge !== null && cacheAge < CACHE_MIN_AGE) {
        console.log(`[API42 Routes] ⚠️  Cache too fresh (${Math.round(cacheAge / 1000)}s), refusing to bypass - preventing rate limit`);
        const cached = getCached(cacheKey);
        if (cached) return cached;
      }
      
      // Vérifier le cache normal (sauf si refresh demandé)
      if (refresh !== 'true') {
        const cached = getCached(cacheKey);
        if (cached) {
          console.log('[API42 Routes] Returning cached data');
          return cached;
        }
      } else {
        console.log('[API42 Routes] Cache bypass requested (data older than 1 minute)');
      }
      
      console.log('[API42 Routes] API token preview:', api_token.substring(0, 20) + '...');
      
      // Faire les requêtes en séquence pour éviter le rate limiting
      // Au lieu de les envoyer toutes en parallèle, on attend chacune avant d'envoyer la suivante
      console.log('[API42 Routes] Making sequential requests to API 42 (to avoid rate limit)...');
      
      console.log('[API42 Routes] 1/3 Fetching projects...');
      const projectsRes = await axios.get(`${config.oauth42.apiUrl}/users/${user_id_42}/projects_users`, {
        headers: { Authorization: `Bearer ${api_token}` },
      });
      console.log(`[API42 Routes] ✓ Projects fetched: ${projectsRes.data.length} items`);
      
      console.log('[API42 Routes] 2/3 Fetching cursus...');
      const cursusRes = await axios.get(`${config.oauth42.apiUrl}/users/${user_id_42}/cursus_users`, {
        headers: { Authorization: `Bearer ${api_token}` },
      });
      console.log(`[API42 Routes] ✓ Cursus fetched: ${cursusRes.data.length} items`);
      
      console.log('[API42 Routes] 3/3 Fetching events...');
      const eventsRes = await axios.get(`${config.oauth42.apiUrl}/users/${user_id_42}/events_users`, {
        headers: { Authorization: `Bearer ${api_token}` },
      });
      console.log(`[API42 Routes] ✓ Events fetched: ${eventsRes.data.length} items`);

      console.log('[API42 Routes] ✓ All API 42 requests successful');

      // Transformer les données
      const projects = projectsRes.data.map((project: any) => ({
        ...project,
        validated: project['validated?'] !== undefined ? project['validated?'] : project.validated,
      }));

      const cursus = cursusRes.data;
      const cursus42 = cursus.find((c: any) => c.cursus_id === 21);

      const validEventKinds = [
        'meet_up', 'conference', 'exam', 'challenge', 'hackathon',
        'pedago', 'event', 'rush', 'workshop', 'partnership',
        'speed_working', 'meet', 'other'
      ];

      const events = eventsRes.data
        .map((eventUser: any) => eventUser.event)
        .filter((event: any) => validEventKinds.includes(event.kind));

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
      setCache(cacheKey, result);
      
      return result;
    } catch (error: any) {
      handleAPI42Error(error, reply, fastify);
    }
  });

  // Récupérer les infos complètes de l'utilisateur depuis l'API 42
  fastify.get('/api42/me', {
    preHandler: authenticate,
  }, async (request: FastifyRequest) => {
    try {
      const { api_token } = request.user;
      
      const response = await axios.get(`${config.oauth42.apiUrl}/me`, {
        headers: {
          Authorization: `Bearer ${api_token}`,
        },
      });

      return response.data;
    } catch (error: any) {
      fastify.log.error('Error fetching user info:', error.response?.data || error.message);
      throw new Error('Failed to fetch user information');
    }
  });
}
