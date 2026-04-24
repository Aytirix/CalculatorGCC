import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { API42Service } from '../services/api42.service.js';
import { simulationRepository } from '../db/simulationRepository.js';

const IS_DEV = process.env.NODE_ENV !== 'production';

/**
 * Résout le user_id_42 effectif pour la requête.
 * - En dev : ?target_user_id=XXX override (impersonation sans vérif privacy)
 * - Partout : ?view_user_id=XXX si l'utilisateur cible est public
 */
async function getEffectiveUserId(request: FastifyRequest, reply: FastifyReply): Promise<number | null> {
  const query = request.query as { target_user_id?: string; view_user_id?: string };

  if (IS_DEV && query.target_user_id) {
    const id = parseInt(query.target_user_id, 10);
    if (!isNaN(id) && id > 0) {
      console.log(`[DEV] Impersonating user ID: ${id} (real: ${request.user.user_id_42})`);
      return id;
    }
  }

  if (query.view_user_id) {
    const id = parseInt(query.view_user_id, 10);
    if (!isNaN(id) && id > 0) {
      const pub = await simulationRepository.isPublic(id);
      if (!pub) {
        reply.code(403).send({ error: 'This profile is private' });
        return null;
      }
      return id;
    }
  }

  return request.user.user_id_42;
}

/**
 * Gère les erreurs de l'API 42
 */
export function handleAPI42Error(error: any, reply: FastifyReply, fastify: FastifyInstance) {
  console.error('[API42 Controller] Error:', error.message);
  console.error('[API42 Controller] Error response:', error.response?.data);
  console.error('[API42 Controller] Error status:', error.response?.status);

  // Token expiré
  if (error.response?.status === 401) {
    fastify.log.error('API 42 token expired, user needs to re-authenticate');
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'API 42 token expired. Please login again.',
      code: 'TOKEN_EXPIRED'
    });
    return;
  }

  // Rate limit
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

/**
 * Contrôleur pour les endpoints de l'API 42
 */
export class API42Controller {
  /**
   * GET /api42/projects
   * Récupère TOUS les projets de l'utilisateur (avec pagination)
   */
  static async getAllProjects(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    try {
      const { api_token } = request.user;
      const userId = await getEffectiveUserId(request, reply);
      if (userId === null) return;

      const projects = await API42Service.getUserProjects(userId, api_token);

      fastify.log.info(`[API42 Controller] Fetched ${projects.length} total projects for user ${userId}`);

      return projects;
    } catch (error: any) {
      return handleAPI42Error(error, reply, fastify);
    }
  }

  /**
   * GET /api42/cursus
   * Récupère les cursus de l'utilisateur connecté
   */
  static async getCursus(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    try {
      const { api_token } = request.user;
      const userId = await getEffectiveUserId(request, reply);
      if (userId === null) return;

      const cursus = await API42Service.getUserCursus(userId, api_token);

      fastify.log.info(`[API42 Controller] Fetched ${cursus.length} cursus for user ${userId}`);

      return cursus;
    } catch (error: any) {
      return handleAPI42Error(error, reply, fastify);
    }
  }

  /**
   * GET /api42/events
   * Récupère les événements RNCP de l'utilisateur connecté
   */
  static async getEvents(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    try {
      const { api_token } = request.user;
      const userId = await getEffectiveUserId(request, reply);
      if (userId === null) return;

      const events = await API42Service.getUserEvents(userId, api_token);

      fastify.log.info(`[API42 Controller] Fetched ${events.length} events for user ${userId}`);

      return events;
    } catch (error: any) {
      return handleAPI42Error(error, reply, fastify);
    }
  }

  /**
   * GET /api42/user-data
   * Récupère toutes les données utilisateur en une fois (avec cache)
   */
  static async getUserData(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    try {
      const { api_token } = request.user;
      const userId = await getEffectiveUserId(request, reply);
      if (userId === null) return;
      const { refresh } = request.query as { refresh?: string };

      fastify.log.info(`[API42 Controller] Fetching user data for user ${userId}`);

      const data = await API42Service.getUserData(
        userId,
        api_token,
        refresh === 'true'
      );

      return data;
    } catch (error: any) {
      return handleAPI42Error(error, reply, fastify);
    }
  }

  /**
   * GET /api42/me
   * Récupère les informations complètes de l'utilisateur connecté
   */
  static async getMe(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    try {
      const { api_token } = request.user;

      const userInfo = await API42Service.getMe(api_token);

      fastify.log.info(`[API42 Controller] Fetched user info for ${userInfo.login}`);

      return userInfo;
    } catch (error: any) {
      return handleAPI42Error(error, reply, fastify);
    }
  }

  /**
   * GET /api42/project-users/:slug
   * Récupère les utilisateurs inscrits sur un projet depuis l'intra 42
   */
  static async getProjectRegisteredUsers(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    try {
      const { api_token } = request.user;
      const { slug } = request.params as { slug: string };

      const users = await API42Service.getProjectRegisteredUsers(slug, api_token);

      fastify.log.info(`[API42 Controller] Fetched ${users.length} registered users for project ${slug}`);

      return users;
    } catch (error: any) {
      return handleAPI42Error(error, reply, fastify);
    }
  }
}
