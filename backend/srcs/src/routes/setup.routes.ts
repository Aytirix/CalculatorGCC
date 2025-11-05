import { FastifyInstance } from 'fastify';
import { setupController } from '../controllers/setup.controller';
import { requireNotConfigured } from '../middlewares/setup.middleware';

export async function setupRoutes(server: FastifyInstance) {
  // Route pour vérifier l'état de configuration
  server.get('/api/setup/status', async (request, reply) => {
    return setupController.getStatus(request, reply);
  });
  
  // Route pour obtenir le token de setup (seulement si non configuré)
  server.get('/api/setup/token', {
    preHandler: requireNotConfigured
  }, async (request, reply) => {
    return setupController.getSetupToken(request, reply);
  });
  
  // Route pour configurer l'application
  server.post('/api/setup/configure', {
    preHandler: requireNotConfigured
  }, async (request, reply) => {
    return setupController.configure(request, reply);
  });
}
