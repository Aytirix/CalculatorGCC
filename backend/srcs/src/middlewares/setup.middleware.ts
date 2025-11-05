import { FastifyRequest, FastifyReply } from 'fastify';
import { isConfigured } from '../utils/envSetup';

/**
 * Middleware qui bloque toutes les routes si l'application n'est pas configurée
 * Sauf les routes de setup (/api/setup/*)
 */
export async function requireConfigured(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Permet l'accès aux routes de setup
  if (request.url.startsWith('/api/setup')) {
    return;
  }
  
  // Vérifie si l'application est configurée
  if (!isConfigured()) {
    return reply.status(503).send({
      error: 'Application not configured',
      message: 'Please complete the initial setup wizard',
      setupRequired: true
    });
  }
}

/**
 * Middleware qui bloque les routes de setup si l'application est déjà configurée
 */
export async function requireNotConfigured(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (isConfigured()) {
    return reply.status(403).send({
      error: 'Already configured',
      message: 'The application has already been configured'
    });
  }
}
