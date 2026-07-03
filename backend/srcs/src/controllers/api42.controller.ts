import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { API42Service, refreshJobManager } from '../services/api42.service.js';
import { simulationRepository } from '../db/simulationRepository.js';
import { userData42Repository } from '../db/userData42Repository.js';
import { config } from '../config/config.js';

const IS_DEV = process.env.NODE_ENV !== 'production';

/**
 * Secondes restantes avant qu'un nouveau refresh soit autorisé (0 = dispo).
 * Basé sur la dernière ACTIVITÉ (succès via `fetchedAt`, OU dernier échec via
 * lastResult) : sans ça, un fetch en échec ne poserait aucun cooldown et se
 * réenfilerait en boucle, martelant l'API 42.
 */
function computeCooldownSeconds(fetchedAt: Date | null, userId: number): number {
  const now = Date.now();
  let leftMs = 0;
  if (fetchedAt) {
    leftMs = Math.max(leftMs, config.api42.refreshCooldownMs - (now - fetchedAt.getTime()));
  }
  const last = refreshJobManager.getLastResult(userId);
  if (last && !last.ok) {
    leftMs = Math.max(leftMs, config.api42.failureCooldownMs - (now - last.at));
  }
  return leftMs > 0 ? Math.ceil(leftMs / 1000) : 0;
}

const EMPTY_SNAPSHOT = {
  level: 0,
  projects: [] as string[],
  eventsCount: 0,
  allProjects: [] as any[],
  allCursus: [] as any[],
  allEvents: [] as any[],
};

/**
 * Résout le user_id_42 effectif pour la requête.
 * - En dev : ?target_user_id=XXX override (impersonation sans vérif privacy)
 * - Partout : ?view_user_id=XXX si l'utilisateur cible est public
 */
async function getEffectiveUserId(request: FastifyRequest, reply: FastifyReply): Promise<number | null> {
  const query = request.query as { target_user_id?: string; view_user_id?: string };

  if (IS_DEV && query.target_user_id) {
    const id = parseInt(query.target_user_id, 10);
    if (!isNaN(id) && id > 0) {
      console.log(`[DEV] Impersonating user ID: ${id} (real: ${request.user.user_id_42})`);
      return id;
    }
  }

  if (query.view_user_id) {
    const id = parseInt(query.view_user_id, 10);
    if (!isNaN(id) && id > 0) {
      const pub = await simulationRepository.isPublic(id);
      if (!pub) {
        reply.code(403).send({ error: 'This profile is private' });
        return null;
      }
      return id;
    }
  }

  return request.user.user_id_42;
}

/**
 * Gère les erreurs de l'API 42
 */
export function handleAPI42Error(error: any, reply: FastifyReply, fastify: FastifyInstance) {
  console.error('[API42 Controller] Error:', error.message);
  console.error('[API42 Controller] Error response:', error.response?.data);
  console.error('[API42 Controller] Error status:', error.response?.status);

  // Token expiré
  if (error.response?.status === 401) {
    fastify.log.error('API 42 token expired, user needs to re-authenticate');
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'API 42 token expired. Please login again.',
      code: 'TOKEN_EXPIRED'
    });
    return;
  }

  // Rate limit
  if (error.response?.status === 429) {
    fastify.log.error('API 42 rate limit exceeded');
    reply.code(429).send({
      error: 'Too Many Requests',
      message: 'API 42 rate limit exceeded. Please try again later.',
      code: 'RATE_LIMIT'
    });
    return;
  }

  // Autre erreur
  fastify.log.error('Error calling API 42:', error.response?.data || error.message);
  reply.code(500).send({
    error: 'Internal Server Error',
    message: 'Failed to fetch data from API 42'
  });
}

/**
 * Contrôleur pour les endpoints de l'API 42
 */
export class API42Controller {
  /**
   * GET /api42/projects
   * Récupère TOUS les projets de l'utilisateur (avec pagination)
   */
  static async getAllProjects(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    try {
      const { api_token } = request.user;
      const userId = await getEffectiveUserId(request, reply);
      if (userId === null) return;

      const projects = await API42Service.getUserProjects(userId, api_token);

      fastify.log.info(`[API42 Controller] Fetched ${projects.length} total projects for user ${userId}`);

      return projects;
    } catch (error: any) {
      return handleAPI42Error(error, reply, fastify);
    }
  }

  /**
   * GET /api42/cursus
   * Récupère les cursus de l'utilisateur connecté
   */
  static async getCursus(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    try {
      const { api_token } = request.user;
      const userId = await getEffectiveUserId(request, reply);
      if (userId === null) return;

      const cursus = await API42Service.getUserCursus(userId, api_token);

      fastify.log.info(`[API42 Controller] Fetched ${cursus.length} cursus for user ${userId}`);

      return cursus;
    } catch (error: any) {
      return handleAPI42Error(error, reply, fastify);
    }
  }

  /**
   * GET /api42/events
   * Récupère les événements RNCP de l'utilisateur connecté
   */
  static async getEvents(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    try {
      const { api_token } = request.user;
      const userId = await getEffectiveUserId(request, reply);
      if (userId === null) return;

      const events = await API42Service.getUserEvents(userId, api_token);

      fastify.log.info(`[API42 Controller] Fetched ${events.length} events for user ${userId}`);

      return events;
    } catch (error: any) {
      return handleAPI42Error(error, reply, fastify);
    }
  }

  /**
   * GET /api42/user-data
   * Sert l'instantané stocké en base. NE CONTACTE JAMAIS l'API 42 (l'usage
   * normal ne doit pas rafraîchir). Seule exception : une première synchro est
   * mise en file automatiquement si l'utilisateur n'a encore aucune donnée —
   * et uniquement pour lui-même, jamais pour un profil qu'il consulte.
   */
  static async getUserData(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    try {
      const selfId = request.user.user_id_42;
      const userId = await getEffectiveUserId(request, reply);
      if (userId === null) return; // 403 déjà envoyé (profil privé)
      const isSelf = userId === selfId;

      const snap = await userData42Repository.get(userId);
      const cooldownSeconds = isSelf ? computeCooldownSeconds(snap?.fetchedAt ?? null, userId) : 0;

      // Le job/refresh ne concerne QUE soi (jamais le profil consulté).
      let job = isSelf ? refreshJobManager.getStatus(userId) : null;
      // Première synchro auto : seulement pour soi, et pas pendant un cooldown
      // (sinon un échec de synchro se réenfilerait en boucle).
      if (!snap && isSelf && !job && cooldownSeconds === 0) {
        job = refreshJobManager.enqueue(userId, request.user.api_token);
        fastify.log.info(`[API42 Controller] Première synchro mise en file pour ${userId}`);
      }

      // Catégorie de la dernière erreur de synchro (pour un message clair côté front).
      const last = isSelf ? refreshJobManager.getLastResult(userId) : null;
      const lastError: 'auth' | 'other' | null =
        last && !last.ok && !snap ? (last.status === 401 ? 'auth' : 'other') : null;

      return {
        ...(snap?.data ?? EMPTY_SNAPSHOT),
        _meta: {
          fetchedAt: snap ? snap.fetchedAt.toISOString() : null,
          job: job ?? null,
          cooldownSeconds,
          canRefresh: isSelf && !job && cooldownSeconds === 0,
          isViewingOther: !isSelf,
          lastError,
        },
      };
    } catch (error: any) {
      return handleAPI42Error(error, reply, fastify);
    }
  }

  /**
   * POST /api42/refresh
   * Met un refresh en file pour l'utilisateur connecté (soi uniquement).
   * - déjà en file / en cours -> renvoie le job (il doit attendre)
   * - cooldown non écoulé      -> refuse avec le temps restant
   * - sinon                    -> met en file et renvoie position + ETA
   */
  static async refreshUserData(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    try {
      const userId = request.user.user_id_42;

      const active = refreshJobManager.getStatus(userId);
      if (active) {
        return reply.send({ ok: true, job: active });
      }

      const fetchedAt = await userData42Repository.getFetchedAt(userId);
      const cooldownSeconds = computeCooldownSeconds(fetchedAt, userId);
      if (cooldownSeconds > 0) {
        return reply.send({
          ok: false,
          code: 'COOLDOWN',
          retryInSeconds: cooldownSeconds,
          message: `Prochaine réactualisation possible dans ${cooldownSeconds}s.`,
        });
      }

      const job = refreshJobManager.enqueue(userId, request.user.api_token);
      fastify.log.info(`[API42 Controller] Refresh mis en file pour ${userId} (position ${job.position})`);
      return reply.send({ ok: true, job });
    } catch (error: any) {
      return handleAPI42Error(error, reply, fastify);
    }
  }

  /**
   * GET /api42/refresh/status
   * État du job de refresh de l'utilisateur (position/ETA) + cooldown restant.
   * Permet au front de restaurer le badge après un rechargement de page.
   */
  static async getRefreshStatus(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    try {
      const userId = request.user.user_id_42;
      const job = refreshJobManager.getStatus(userId);
      const fetchedAt = await userData42Repository.getFetchedAt(userId);
      const cooldownSeconds = computeCooldownSeconds(fetchedAt, userId);
      const last = refreshJobManager.getLastResult(userId);

      return reply.send({
        job: job ?? null,
        fetchedAt: fetchedAt ? fetchedAt.toISOString() : null,
        cooldownSeconds,
        canRefresh: !job && cooldownSeconds === 0,
        // true si la dernière tentative a échoué et qu'on n'a toujours pas de données.
        lastFailed: !!(last && !last.ok && !fetchedAt),
      });
    } catch (error: any) {
      return handleAPI42Error(error, reply, fastify);
    }
  }

  /**
   * GET /api42/me
   * Récupère les informations complètes de l'utilisateur connecté
   */
  static async getMe(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    try {
      const { api_token } = request.user;

      const userInfo = await API42Service.getMe(api_token);

      fastify.log.info(`[API42 Controller] Fetched user info for ${userInfo.login}`);

      return userInfo;
    } catch (error: any) {
      return handleAPI42Error(error, reply, fastify);
    }
  }

  /**
   * GET /api42/project-users/:slug
   * Récupère les utilisateurs inscrits sur un projet depuis l'intra 42
   */
  static async getProjectRegisteredUsers(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    try {
      const { api_token } = request.user;
      const { slug } = request.params as { slug: string };

      const users = await API42Service.getProjectRegisteredUsers(slug, api_token);

      fastify.log.info(`[API42 Controller] Fetched ${users.length} registered users for project ${slug}`);

      return users;
    } catch (error: any) {
      return handleAPI42Error(error, reply, fastify);
    }
  }

  /**
   * GET /api42/usage
   * Usage courant de l'API 42 (rate limiter + file de refresh). Lecture en mémoire,
   * AUCUN appel à l'API 42. Sert la page "Conso API" (visible par tous).
   */
  static async getUsage(_request: FastifyRequest, reply: FastifyReply, _fastify: FastifyInstance) {
    return reply.send(API42Service.getUsageStats());
  }
}
