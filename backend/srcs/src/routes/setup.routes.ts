import { FastifyInstance } from 'fastify';
import { setupController } from '../controllers/setup.controller.js';
import { requireNotConfigured, requireLocalhost } from '../middlewares/setup.middleware.js';

export async function setupRoutes(server: FastifyInstance) {
  // Route pour vérifier l'état de configuration (accessible depuis n'importe où)
  server.get('/api/setup/status', async (request, reply) => {
    return setupController.getStatus(request, reply);
  });
  
  // Route pour obtenir le token de setup (localhost uniquement + non configuré)
  server.get('/api/setup/token', {
    preHandler: [requireLocalhost, requireNotConfigured]
  }, async (request, reply) => {
    return setupController.getSetupToken(request, reply);
  });
  
  // Route pour configurer l'application (localhost uniquement + non configuré)
  server.post('/api/setup/configure', {
    preHandler: [requireLocalhost, requireNotConfigured]
  }, async (request, reply) => {
    return setupController.configure(request, reply);
  });
}
