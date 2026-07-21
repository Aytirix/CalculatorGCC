import { FastifyInstance } from 'fastify';
import { setupController } from '../controllers/setup.controller.js';
import { requireDelegate } from '../middlewares/auth.middleware.js';

export async function setupRoutes(server: FastifyInstance) {
  // Route pour vérifier l'état de configuration (accessible depuis n'importe où)
  server.get('/setup/status', async (request, reply) => {
    return setupController.getStatus(request, reply);
  });

  // État des credentials 42 (jamais les secrets) pour préremplir le formulaire du
  // délégué. Même garde que l'écriture ci-dessous.
  server.get('/setup/admin/config', {
    preHandler: [requireDelegate]
  }, async (request, reply) => {
    return setupController.getConfigAsAdmin(request, reply);
  });

  // Reconfiguration réservée aux admins délégués (JWT 42 signé + login inscrit par
  // l'owner). Seule voie d'écriture restante ici : le bootstrap d'une instance vierge
  // passe désormais par /admin (token console + passkey), qui ne dépend ni du réseau
  // ni d'un en-tête client.
  server.post('/setup/admin/configure', {
    preHandler: [requireDelegate]
  }, async (request, reply) => {
    return setupController.configureAsAdmin(request, reply);
  });
}
