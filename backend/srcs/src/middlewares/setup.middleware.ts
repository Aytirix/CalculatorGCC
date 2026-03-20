import { FastifyRequest, FastifyReply } from 'fastify';
import { isConfigured } from '../db/configRepository.js';

export async function requireConfigured(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (request.url.startsWith('/setup') || request.url.startsWith('/api/setup')) {
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

export async function requireNotConfigured(
  _request: FastifyRequest,
  reply: FastifyReply
) {
  if (await isConfigured()) {
    return reply.status(403).send({
      error: 'Already configured',
      message: 'The application has already been configured'
    });
  }
}

export async function requireLocalhost(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const host = request.headers.host || '';
  const hostIsLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1');

  if (!hostIsLocalhost) {
    return reply.status(403).send({
      error: 'Access denied',
      message: 'Setup configuration is only accessible from localhost',
      remoteAccessBlocked: true
    });
  }
}
