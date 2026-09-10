import { FastifyRequest, FastifyReply } from 'fastify';
import { isConfigured } from '../db/configRepository.js';
import { allowedOriginRepository, normalizeOrigin } from '../db/allowedOriginRepository.js';
import { origineAutorisee } from '../services/originGate.js';

class SetupController {
  /**
   * « Ce frontend-là peut-il travailler contre ce backend-ci ? »
   *
   * Deux questions dans une seule requête, parce qu'elles appellent la même
   * réponse pratique — « non, et voilà pourquoi » :
   *  - `configured` : l'instance a-t-elle reçu ses identifiants 42 ?
   *  - `origin_allowed` : ce frontend est-il une origine reconnue ?
   *
   * La seconde n'a de sens que pour un miroir. Un miroir relaie `/api` vers cette
   * instance, mais la connexion 42 doit revenir chez LUI, via l'origine scellée
   * dans le `state`. Or `initiateOAuth` retombe SILENCIEUSEMENT sur le domaine de
   * cette instance quand l'origine demandée n'est pas déclarée : le visiteur du
   * miroir cliquait « Se connecter » et atterrissait sur le site principal, sans
   * un mot d'explication, tandis que le miroir avait démarré sans broncher.
   *
   * Le paramètre est OPTIONNEL et son absence répond `true` : un appelant qui ne
   * pose pas la question n'a rien à se voir bloquer (sonde de supervision,
   * frontend d'une version antérieure).
   *
   * Ce que cela expose : « telle origine est-elle déclarée ici ? », pour une
   * origine que l'appelant fournit lui-même. Aucune énumération — la liste n'est
   * jamais renvoyée — et la route est comptée par le rate-limit comme les autres.
   */
  async getStatus(request: FastifyRequest, reply: FastifyReply) {
    const configured = await isConfigured();
    const { origin } = request.query as { origin?: unknown };

    // `APP_DOMAIN` renseigné = cette instance sait sous quel domaine on la sert.
    // Sinon `config.frontendUrl` devine, et son verdict ne vaut rien : cf. le
    // quatrième paramètre de `origineAutorisee`.
    const originAllowed = await origineAutorisee(
      origin,
      normalizeOrigin,
      (o) => allowedOriginRepository.isAllowed(o),
      Boolean(process.env.APP_DOMAIN)
    );

    return reply.send({
      configured,
      origin_allowed: originAllowed,
      message: configured
        ? 'Application is configured'
        : 'Application requires initial setup'
    });
  }
}

export const setupController = new SetupController();
