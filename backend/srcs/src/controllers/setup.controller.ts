import { FastifyRequest, FastifyReply } from 'fastify';
import {
  isConfigured,
  getSetupToken,
  updateEnvConfiguration
} from '../utils/envSetup.js';
import { validateApi42Credentials } from '../utils/validateApi42Credentials.js';

interface ConfigureRequest {
  setupToken: string;
  clientId: string;
  clientSecret: string;
}

class SetupController {
  /**
   * Vérifie l'état de configuration de l'application
   */
  async getStatus(_request: FastifyRequest, reply: FastifyReply) {
    const configured = isConfigured();
    
    return reply.send({
      configured,
      message: configured
        ? 'Application is configured'
        : 'Application requires initial setup'
    });
  }
  
  /**
   * Retourne le token de setup (uniquement si non configuré)
   * Ce token est utilisé pour sécuriser la configuration initiale
   */
  async getSetupToken(_request: FastifyRequest, reply: FastifyReply) {
    const setupToken = getSetupToken();
    
    if (!setupToken) {
      return reply.status(500).send({
        error: 'Setup token not found',
        message: 'Please restart the server to generate a new setup token'
      });
    }
    
    return reply.send({
      setupToken,
      message: 'Use this token to complete the setup. It will be invalidated after configuration.'
    });
  }
  
  /**
   * Configure l'application avec les credentials 42 API
   */
  async configure(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as ConfigureRequest;
    
    // Validation des champs requis
    if (!body.setupToken || !body.clientId || !body.clientSecret) {
      return reply.status(400).send({
        error: 'Missing required fields',
        message: 'setupToken, clientId, and clientSecret are required'
      });
    }
    
    // Vérifie le token de setup
    const validToken = getSetupToken();
    if (!validToken || body.setupToken !== validToken) {
      return reply.status(403).send({
        error: 'Invalid setup token',
        message: 'The provided setup token is invalid or has expired'
      });
    }
    
    // Valide les credentials avec l'API 42
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
    
    console.log('✅ Credentials validés, sauvegarde...');
    
    // Met à jour la configuration
    try {
      updateEnvConfiguration({
        clientId: body.clientId,
        clientSecret: body.clientSecret
      });
      
      console.log('✅ Configuration sauvegardée');
      
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
