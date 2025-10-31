import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { API42Service } from '../services/api42.service.js';

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
      const { api_token, user_id_42 } = request.user;

      const projects = await API42Service.getUserProjects(user_id_42, api_token);

      fastify.log.info(`[API42 Controller] Fetched ${projects.length} total projects for user ${user_id_42}`);

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
      const { api_token, user_id_42 } = request.user;

      const cursus = await API42Service.getUserCursus(user_id_42, api_token);

      fastify.log.info(`[API42 Controller] Fetched ${cursus.length} cursus for user ${user_id_42}`);

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
      const { api_token, user_id_42 } = request.user;

      const events = await API42Service.getUserEvents(user_id_42, api_token);

      fastify.log.info(`[API42 Controller] Fetched ${events.length} events for user ${user_id_42}`);

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
      const { api_token, user_id_42 } = request.user;
      const { refresh } = request.query as { refresh?: string };

      fastify.log.info(`[API42 Controller] Fetching user data for user ${user_id_42}`);

      const data = await API42Service.getUserData(
        user_id_42,
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
}
