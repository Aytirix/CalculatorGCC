import { FastifyRequest, FastifyReply } from 'fastify';
import { isConfigured } from '../db/configRepository.js';
import { allowedOriginRepository, normalizeOrigin } from '../db/allowedOriginRepository.js';
import { isMirrorActiveCached } from '../services/mirror.service.js';
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
   * La seconde n'a de sens que pour un miroir. Un miroir sert le site et relaie
   * `/api`, mais la connexion 42 doit revenir chez LUI, via l'origine scellée
   * dans le `state`. Or `initiateOAuth` retombe SILENCIEUSEMENT sur le domaine de
   * l'instance principale quand l'origine demandée n'est pas déclarée : le
   * visiteur cliquait « Se connecter » et atterrissait sur l'autre site, sans un
   * mot d'explication.
   *
   * `origin_allowed` vaut `true`, `false` ou **`null` quand cette instance ne
   * fait pas autorité** — voir `origineAutorisee`. Ce `null` n'est pas un détail
   * de forme : c'est lui qui empêche le contrôle d'affirmer ce qu'il n'a pas
   * vérifié, reproche qu'on adresse justement au repli silencieux.
   *
   * Ce que cela expose : « telle origine est-elle déclarée ici ? », pour une
   * origine que l'appelant fournit lui-même. Aucune énumération — la liste n'est
   * jamais renvoyée — et la route est comptée par le rate-limit comme les autres.
   * Le même oracle existait déjà via le `state` de `/auth/42` et via CORS.
   */
  async getStatus(request: FastifyRequest, reply: FastifyReply) {
    const configured = await isConfigured();
    const { origin } = request.query as { origin?: unknown };

    const originAllowed = await origineAutorisee(
      origin,
      normalizeOrigin,
      (o) => allowedOriginRepository.isAllowed(o),
      this.faitAutorite()
    );

    return reply.send({
      configured,
      origin_allowed: originAllowed,
      message: configured
        ? 'Application is configured'
        : 'Application requires initial setup'
    });
  }

  /**
   * Cette instance peut-elle trancher la question de l'origine ?
   *
   * Non si elle ignore son propre domaine (`APP_DOMAIN` absent ⇒ `frontendUrl`
   * devine à partir du nom d'hôte du conteneur). Non si elle est elle-même en
   * miroir applicatif : c'est alors sa cible qui scelle le `state`, et sa propre
   * liste blanche ne prouve rien — elle s'auto-autorisait, ce qui revenait à
   * donner un feu vert sur la panne même qu'on cherche à signaler.
   */
  private faitAutorite(): boolean {
    return Boolean(process.env.APP_DOMAIN) && !isMirrorActiveCached();
  }
}

export const setupController = new SetupController();
