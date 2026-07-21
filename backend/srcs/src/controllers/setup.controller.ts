import { FastifyRequest, FastifyReply } from 'fastify';
import { isConfigured } from '../db/configRepository.js';
import { applyApi42Configuration, getApi42ConfigState } from '../services/api42Config.service.js';

interface ConfigureRequest {
  clientId: string;
  clientSecret: string;
  // « Next Secret 42 » optionnel : le prochain client_secret affiché par l'intra.
  // Pris en relais automatiquement dès que le secret courant est révoqué. Pas de
  // date : la bascule se déclenche sur le refus (invalid_client), pas sur un délai.
  clientSecret42Next?: string;
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

  /**
   * État des credentials 42 pour le formulaire du délégué : permet de préremplir le
   * Client ID courant (sans quoi il faut le retaper de mémoire pour changer un secret)
   * et d'afficher ce qui est déjà en place. Ne renvoie JAMAIS les secrets.
   * Même garde que la reconfiguration : requireDelegate.
   */
  async getConfigAsAdmin(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send(await getApi42ConfigState());
  }

  /**
   * Reconfiguration par un admin délégué. L'accès est garanti en amont par le
   * preHandler requireDelegate (JWT 42 signé + login inscrit par l'owner) : plus
   * de setupToken ni de verrou localhost — ces deux voies ont été supprimées, le
   * bootstrap se fait sur /admin (token console + passkey). Permet de remettre les
   * credentials 42 (secret révoqué, ajout d'un Next Secret) sans accès SSH.
   */
  async configureAsAdmin(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as ConfigureRequest;

    if (!body.clientId || !body.clientSecret) {
      return reply.status(400).send({
        error: 'Missing required fields',
        message: 'clientId and clientSecret are required'
      });
    }

    // Trace d'audit : QUI reconfigure (jamais les secrets eux-mêmes).
    console.log(`🔐 Reconfiguration à distance par l'admin « ${request.user.login} »`);

    const result = await applyApi42Configuration({
      clientId: body.clientId,
      clientSecret: body.clientSecret,
      clientSecret42Next: body.clientSecret42Next,
    });

    if (!result.ok) {
      return reply.status(result.status).send({
        error: result.status === 400 ? 'Invalid credentials' : 'Configuration failed',
        message: result.error,
        ...(result.validationFailed ? { validationFailed: true } : {}),
      });
    }

    return reply.send({
      success: true,
      message: 'Configuration updated successfully. Changes applied immediately.',
      configured: true,
    });
  }
}

export const setupController = new SetupController();
