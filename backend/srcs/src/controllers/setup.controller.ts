import { FastifyRequest, FastifyReply } from 'fastify';
import { isConfigured } from '../db/configRepository.js';

class SetupController {
  async getStatus(_request: FastifyRequest, reply: FastifyReply) {
    const configured = await isConfigured();

    return reply.send({
      configured,
      message: configured
        ? 'Application is configured'
        : 'Application requires initial setup'
    });
  }
}

export const setupController = new SetupController();
