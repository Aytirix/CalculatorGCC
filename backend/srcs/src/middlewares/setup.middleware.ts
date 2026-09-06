import { FastifyRequest, FastifyReply } from 'fastify';
import { isConfigured } from '../db/configRepository.js';
import { getMirrorApiUrl } from '../services/mirror.service.js';

export async function requireConfigured(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (
    request.url.startsWith('/setup') || request.url.startsWith('/api/setup') ||
    request.url.startsWith('/admin') || request.url.startsWith('/api/admin')
  ) {
    return;
  }

  // Une instance MIROIR n'a ni credentials 42 ni données : elle relaie tout vers
  // l'instance principale. L'exiger « configurée » la bloquerait en 503 avant
  // même d'atteindre le relais, alors qu'elle n'a précisément rien à configurer.
  if (await getMirrorApiUrl()) {
    return;
  }

  if (!(await isConfigured())) {
    return reply.status(503).send({
      error: 'Application not configured',
      message: 'Please complete the initial setup wizard',
      setupRequired: true
    });
  }
}
