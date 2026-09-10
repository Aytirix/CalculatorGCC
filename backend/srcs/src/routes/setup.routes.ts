import { FastifyInstance } from 'fastify';
import { setupController } from '../controllers/setup.controller.js';

export async function setupRoutes(server: FastifyInstance) {
  // Seul reste public : « cette instance est-elle configurée ? », que le frontend
  // interroge au démarrage pour savoir s'il doit envoyer vers le bootstrap admin.
  //
  // Les routes /setup/admin/* ont été retirées : elles doublaient la zone
  // « Secrets 42 » du panneau, avec le défaut d'exiger une session 42 valide pour
  // réparer... la connexion 42. Quand la clé était morte, cette voie ne pouvait
  // jamais aboutir. Tout passe désormais par /admin.
  server.get('/setup/status', async (request, reply) => {
    return setupController.getStatus(request, reply);
  });
}
