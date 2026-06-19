import { FastifyInstance } from 'fastify';
import { setupController } from '../controllers/setup.controller.js';
import { requireLocalhost } from '../middlewares/setup.middleware.js';

export async function setupRoutes(server: FastifyInstance) {
  // Route pour vérifier l'état de configuration (accessible depuis n'importe où)
  server.get('/setup/status', async (request, reply) => {
    return setupController.getStatus(request, reply);
  });

  // Route pour obtenir le token de setup/reconfigure (localhost uniquement)
  server.get('/setup/token', {
    preHandler: [requireLocalhost]
  }, async (request, reply) => {
    return setupController.getSetupToken(request, reply);
  });

  // Route pour configurer ou reconfigurer l'application (localhost uniquement)
  server.post('/setup/configure', {
    preHandler: [requireLocalhost]
  }, async (request, reply) => {
    return setupController.configure(request, reply);
  });
}
