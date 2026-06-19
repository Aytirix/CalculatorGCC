import { FastifyRequest, FastifyReply } from 'fastify';
import {
  isConfigured,
  getSetupToken,
  ensureSetupToken,
  saveConfiguration,
  stageNextSecret,
} from '../db/configRepository.js';
import { validateApi42Credentials } from '../utils/validateApi42Credentials.js';

interface ConfigureRequest {
  setupToken: string;
  clientId: string;
  clientSecret: string;
  nextSecret?: string;
  nextSecretExpiresAt?: string; // ISO date : promotion auto une fois dépassée
}

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

  async getSetupToken(_request: FastifyRequest, reply: FastifyReply) {
    const setupToken = await ensureSetupToken();

    return reply.send({
      setupToken,
      message: 'Use this token to complete the setup. It will be invalidated after configuration.'
    });
  }

  async configure(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as ConfigureRequest;

    if (!body.setupToken || !body.clientId || !body.clientSecret) {
      return reply.status(400).send({
        error: 'Missing required fields',
        message: 'setupToken, clientId, and clientSecret are required'
      });
    }

    const validToken = await getSetupToken();
    if (!validToken || body.setupToken !== validToken) {
      return reply.status(403).send({
        error: 'Invalid setup token',
        message: 'The provided setup token is invalid or has expired'
      });
    }

    console.log('🔐 Validation des credentials API 42...');
    const validation = await validateApi42Credentials(body.clientId, body.clientSecret);

    if (!validation.valid) {
      console.log('❌ Validation échouée:', validation.error);
      return reply.status(400).send({
        error: 'Invalid credentials',
        message: validation.error || 'The provided credentials are invalid or cannot access 42 API',
        validationFailed: true
      });
    }

    // Si un Next Secret est fourni, sa date d'expiration est obligatoire.
    if (body.nextSecret && !body.nextSecretExpiresAt) {
      return reply.status(400).send({
        error: 'Missing expiry date',
        message: 'nextSecretExpiresAt est requis lorsque nextSecret est fourni'
      });
    }

    let nextExpiresAt: Date | null = null;
    if (body.nextSecret && body.nextSecretExpiresAt) {
      nextExpiresAt = new Date(body.nextSecretExpiresAt);
      if (isNaN(nextExpiresAt.getTime())) {
        return reply.status(400).send({
          error: 'Invalid expiry date',
          message: 'nextSecretExpiresAt doit être une date valide'
        });
      }
    }

    console.log('✅ Credentials validés, sauvegarde...');

    try {
      await saveConfiguration(body.clientId, body.clientSecret);
      console.log('✅ Configuration sauvegardée en base de données');

      // Programme le futur secret (promu automatiquement à l'expiration).
      if (body.nextSecret && nextExpiresAt) {
        await stageNextSecret(body.nextSecret, nextExpiresAt);
        console.log('✅ Next Secret JWT programmé (expiration :', nextExpiresAt.toISOString(), ')');
      }

      return reply.send({
        success: true,
        message: 'Configuration updated successfully. Changes applied immediately.',
        configured: true
      });
    } catch (error) {
      console.error('❌ Erreur sauvegarde:', error);
      return reply.status(500).send({
        error: 'Configuration failed',
        message: 'An error occurred while updating the configuration'
      });
    }
  }
}

export const setupController = new SetupController();
