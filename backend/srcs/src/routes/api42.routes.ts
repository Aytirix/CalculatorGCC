import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middlewares/auth.middleware.js';
import { API42Controller } from '../controllers/api42.controller.js';

/**
 * Routes pour l'API 42
 */
export async function api42Routes(fastify: FastifyInstance) {
  // Récupérer TOUS les projets de l'utilisateur (avec pagination)
  fastify.get('/api42/projects', {
    preHandler: authenticate,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return API42Controller.getAllProjects(request, reply, fastify);
  });

  // Récupérer les cursus de l'utilisateur
  fastify.get('/api42/cursus', {
    preHandler: authenticate,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return API42Controller.getCursus(request, reply, fastify);
  });

  // Récupérer les événements de l'utilisateur
  fastify.get('/api42/events', {
    preHandler: authenticate,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return API42Controller.getEvents(request, reply, fastify);
  });

  // Récupérer toutes les données utilisateur en une fois
  fastify.get('/api42/user-data', {
    preHandler: authenticate,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return API42Controller.getUserData(request, reply, fastify);
  });

  // Récupérer les infos complètes de l'utilisateur depuis l'API 42
  fastify.get('/api42/me', {
    preHandler: authenticate,
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return API42Controller.getMe(request, reply, fastify);
  });
}
