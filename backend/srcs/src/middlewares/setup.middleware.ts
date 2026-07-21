import { FastifyRequest, FastifyReply } from 'fastify';
import { isConfigured } from '../db/configRepository.js';

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

  if (!(await isConfigured())) {
    return reply.status(503).send({
      error: 'Application not configured',
      message: 'Please complete the initial setup wizard',
      setupRequired: true
    });
  }
}
