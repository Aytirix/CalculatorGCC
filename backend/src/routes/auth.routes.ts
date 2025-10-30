import { FastifyInstance } from 'fastify';
import { AuthController } from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.middleware.js';

export async function authRoutes(fastify: FastifyInstance) {
  // Initie l'authentification OAuth 42
  fastify.get('/auth/42', async (_request, reply) => {
    return AuthController.initiateOAuth(reply);
  });

  // Callback OAuth 42
  fastify.get('/auth/callback', async (request, reply) => {
    return AuthController.handleCallback(request, reply);
  });

  // Routes protégées
  fastify.get('/auth/me', {
    preHandler: authenticate,
  }, async (request) => {
    return AuthController.getMe(request);
  });

  fastify.post('/auth/logout', {
    preHandler: authenticate,
  }, async () => {
    return AuthController.logout();
  });
}
