import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { API42Service, refreshJobManager } from '../services/api42.service.js';
import { token42Service } from '../services/token42.service.js';
import { simulationRepository } from '../db/simulationRepository.js';
import { userData42Repository } from '../db/userData42Repository.js';
import { config } from '../config/config.js';

const IS_DEV = process.env.NODE_ENV !== 'production';

/**
 * Token 42 valide pour l'APPELANT (jamais pour un profil consulté), rafraîchi
 * au besoin. Amorce d'abord le store depuis le JWT (sessions ouvertes avant le
 * déploiement), puis retombe sur le token du JWT si le store est vide.
 */
async function callerAccessToken(request: FastifyRequest): Promise<string> {
  const selfId = request.user.user_id_42;
  await token42Service.ensureStored(selfId, request.user);
  return (await token42Service.getValidAccessToken(selfId)) ?? request.user.api_token;
}

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
      const api_token = await callerAccessToken(request);
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
      const api_token = await callerAccessToken(request);
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
      const api_token = await callerAccessToken(request);
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
        // Amorce le store de tokens depuis le JWT avant d'enfiler (le job résout
        // ensuite un token 42 valide tout seul, rafraîchi si nécessaire).
        await token42Service.ensureStored(userId, request.user);
        job = refreshJobManager.enqueue(userId);
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

      await token42Service.ensureStored(userId, request.user);
      const job = refreshJobManager.enqueue(userId);
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
      const api_token = await callerAccessToken(request);

      const userInfo = await API42Service.getMe(api_token);

      fastify.log.info(`[API42 Controller] Fetched user info for ${userInfo.login}`);

      return userInfo;
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

  /**
   * GET /api42/holy-graph
   * Le Holy Graph OFFICIEL de 42 : positions et liens tels que dessinés sur
   * projects.intra.42.fr/projects/graph (endpoint `/v2/project_data`), avec le
   * statut personnel de l'utilisateur plaqué dessus.
   *
   * Le statut vient du snapshot déjà stocké en base (aucun appel 42 pour les
   * données perso, comme /api42/user-data). Le layout, lui, est identique pour
   * tout le monde : récupéré via le token applicatif (scope `projects`) et mis
   * en cache 24h, partagé par tous les utilisateurs.
   */
  static async getHolyGraph(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    try {
      const userId = await getEffectiveUserId(request, reply);
      if (userId === null) return;

      const snap = await userData42Repository.get(userId);
      if (!snap) {
        return reply.send({ cursus: [] });
      }

      const { allCursus, allProjects } = snap.data;

      // Statut personnel par project id (projects_users -> project.id).
      const statusByProjectId = new Map<number, { status: string; validated: boolean; finalMark: number | null }>();
      for (const pu of allProjects) {
        const pid = pu?.project?.id;
        if (pid == null) continue;
        statusByProjectId.set(pid, {
          status: pu.status ?? 'unknown',
          validated: pu.validated === true,
          finalMark: typeof pu.final_mark === 'number' ? pu.final_mark : null,
        });
      }

      // Les piscines (kind 'piscine' ou 'external', ex. "C Piscine",
      // "C-Piscine-Reloaded") ne font pas partie du Holy Graph : seuls les
      // cursus réels (kind 'main', ex. 42cursus) sont affichés.
      const cursusList = (allCursus ?? []).filter((c: any) => {
        const id = c?.cursus?.id ?? c?.cursus_id;
        if (id == null) return false;
        const kind = c?.cursus?.kind;
        return kind == null || kind === 'main';
      });

      // Les deux jeux de données (catalogue du cursus ~10s/page, et le layout
      // officiel ~61 pages) sont lents côté API 42 : jamais attendus ici. S'ils
      // ne sont pas en cache, on lance leur remplissage en tâche de fond et on
      // répond tout de suite avec `loading: true` — le front repolle jusqu'à ce
      // que ce soit prêt (même pattern que le refresh utilisateur).
      const campusId = await API42Service.getUserCampusId(userId);

      const cursus = cursusList.map((cu: any) => {
        const cursusId = cu.cursus?.id ?? cu.cursus_id;
        const cursusName = cu.cursus?.name ?? `Cursus ${cursusId}`;
        const graph = API42Service.getOfficialGraph(cursusId, campusId);

        if (graph === null) {
          API42Service.ensureCursusProjectsFetching(cursusId);
          API42Service.ensureProjectDataFetching();
          return { id: cursusId, name: cursusName, level: cu.level ?? 0, loading: true, projects: [], edges: [], layers: [] };
        }

        const catalog = API42Service.getCursusProjectsCached(cursusId) ?? [];
        const catalogById = new Map<number, any>(catalog.map((p: any) => [p.id, p]));

        // Les « layers » (compétences 42) enrichissent le graphe sans le
        // bloquer : s'ils ne sont pas encore là, le graphe s'affiche quand même
        // et le sélecteur apparaîtra au prochain passage.
        API42Service.ensureProjectSkillsFetching(cursusId, campusId);
        const skills = API42Service.getProjectSkillsCached(cursusId, campusId);

        // Seuls les projets présents sur le graphe officiel sont affichés :
        // c'est la curation de 42 elle-même, pas une heuristique de notre part.
        const projects = [...graph.nodes.values()].flatMap((node) => {
          const p = catalogById.get(node.projectId);
          if (!p) return [];
          const mine = statusByProjectId.get(node.projectId);
          return [{
            id: p.id,
            name: (p.name as string).trim(),
            slug: p.slug,
            difficulty: p.difficulty ?? 0,
            exam: p.exam === true,
            kind: node.kind,
            x: node.x,
            y: node.y,
            status: mine?.status ?? 'not_started',
            validated: mine?.validated ?? false,
            finalMark: mine?.finalMark ?? null,
            layers: (skills?.byProject[p.id] ?? [])
              .map((skillId) => skills?.skillNames[skillId])
              .filter((name): name is string => !!name),
          }];
        });

        // Liste des layers réellement représentés, pour alimenter le sélecteur.
        const layers = [...new Set(projects.flatMap((p) => p.layers))].sort((a, b) =>
          a.localeCompare(b, 'fr')
        );

        return {
          id: cursusId,
          name: cursusName,
          level: cu.level ?? 0,
          loading: false,
          projects,
          edges: graph.edges,
          layers,
        };
      });

      fastify.log.info(`[API42 Controller] Holy graph: ${cursus.length} cursus pour ${userId}`);
      return reply.send({ cursus });
    } catch (error: any) {
      return handleAPI42Error(error, reply, fastify);
    }
  }

  /**
   * GET /api42/project-teams?cursus_id=21
   * Taille d'équipe de chaque projet du cursus (solo / groupe de N à M), pour
   * n'afficher la recherche de teammates que là où elle a un sens.
   *
   * Aucun appel 42 : tout vient du cache mensuel des sessions du campus.
   */
  static async getProjectTeams(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    try {
      const userId = await getEffectiveUserId(request, reply);
      if (userId === null) return;

      const query = request.query as { cursus_id?: string };
      const cursusId = parseInt(query.cursus_id ?? '21', 10);
      if (!Number.isFinite(cursusId)) {
        return reply.code(400).send({ error: 'cursus_id invalide' });
      }

      const campusId = await API42Service.getUserCampusId(userId);
      if (campusId == null) {
        return reply.send({ loading: false, available: false, projects: [] });
      }

      // Le catalogue du cursus est nécessaire pour relier une session à son
      // projet : il n'est pas forcément déjà en mémoire, cette page pouvant être
      // ouverte sans jamais passer par le Holy Graph.
      API42Service.ensureCursusProjectsFetching(cursusId);
      API42Service.ensureProjectSessionsFetching(cursusId, campusId);
      const projects = API42Service.getProjectTeamInfo(cursusId, campusId);
      return reply.send({
        loading: projects === null,
        available: true,
        projects: projects ?? [],
      });
    } catch (error: any) {
      return handleAPI42Error(error, reply, fastify);
    }
  }

  /**
   * GET /api42/project-registrations/:projectId?cursus_id=21
   * Personnes actuellement inscrites sur le projet côté intra 42, sur le campus
   * de l'utilisateur. Une requête 42 par projet, mise en cache 24 h.
   */
  static async getProjectRegistrations(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    try {
      const userId = await getEffectiveUserId(request, reply);
      if (userId === null) return;

      const params = request.params as { projectId: string };
      const query = request.query as { cursus_id?: string };
      const projectId = parseInt(params.projectId, 10);
      const cursusId = parseInt(query.cursus_id ?? '21', 10);
      if (!Number.isFinite(projectId) || !Number.isFinite(cursusId)) {
        return reply.code(400).send({ error: 'projectId et cursus_id requis' });
      }

      const campusId = await API42Service.getUserCampusId(userId);
      if (campusId == null) {
        return reply.send({ available: false, reason: 'UNKNOWN_CAMPUS', users: [], fetchedAt: null });
      }

      const { users, fetchedAt } = await API42Service.getProjectRegistrations(projectId, cursusId, campusId);
      return reply.send({ available: true, users, fetchedAt });
    } catch (error: any) {
      return handleAPI42Error(error, reply, fastify);
    }
  }

  /**
   * GET /api42/project-details/:projectId?cursus_id=21
   * Détail d'un projet du Holy Graph : description, durée estimée, solo ou
   * groupe, XP, et prérequis d'inscription avec, pour chacun, le fait qu'on le
   * remplisse ou non (calculé sur l'instantané déjà en base, aucun appel 42).
   *
   * Les sessions du campus sont récupérées en tâche de fond et mises en cache
   * un mois : `loading: true` tant qu'elles n'y sont pas, le front repolle.
   */
  static async getProjectDetails(request: FastifyRequest, reply: FastifyReply, fastify: FastifyInstance) {
    try {
      const userId = await getEffectiveUserId(request, reply);
      if (userId === null) return;

      const params = request.params as { projectId: string };
      const query = request.query as { cursus_id?: string };
      const projectId = parseInt(params.projectId, 10);
      const cursusId = parseInt(query.cursus_id ?? '', 10);
      if (!Number.isFinite(projectId) || !Number.isFinite(cursusId)) {
        return reply.code(400).send({ error: 'projectId et cursus_id requis' });
      }

      const campusId = await API42Service.getUserCampusId(userId);
      if (campusId == null) {
        // Le détail vient de `/v2/project_sessions`, qui exige un filtre campus
        // sous peine de ramener les sessions du monde entier. Le campus est
        // relevé à la connexion : une reconnexion suffit à le renseigner.
        return reply.send({ loading: false, available: false, reason: 'UNKNOWN_CAMPUS', details: null });
      }

      API42Service.ensureCursusProjectsFetching(cursusId);
      API42Service.ensureProjectSessionsFetching(cursusId, campusId);
      const details = API42Service.getProjectDetails(cursusId, campusId, projectId);
      if (!details) {
        const ready = API42Service.getProjectSessionsCached(cursusId, campusId) !== null;
        // Sessions présentes mais projet absent : il n'est pas proposé sur ce
        // campus, inutile de faire repoller le front indéfiniment.
        return reply.send({
          loading: !ready,
          available: ready ? false : true,
          reason: ready ? 'NOT_OFFERED' : undefined,
          details: null,
        });
      }

      // Prérequis : on marque ceux que l'utilisateur remplit déjà, à partir de
      // son instantané (aucune requête vers 42).
      const snap = await userData42Repository.get(userId);
      const validatedSlugs = new Set<string>();
      for (const pu of snap?.data.allProjects ?? []) {
        if (pu?.validated !== true) continue;
        const slug = pu?.project?.slug;
        if (typeof slug !== 'string') continue;
        validatedSlugs.add(slug);
        validatedSlugs.add(slug.replace(/^42cursus-/, ''));
      }
      const isDone = (slug: string) =>
        validatedSlugs.has(slug) || validatedSlugs.has(slug.replace(/^42cursus-/, ''));

      const level =
        (snap?.data.allCursus ?? []).find((c: any) => (c?.cursus?.id ?? c?.cursus_id) === cursusId)?.level ?? 0;

      const anyOf = details.anyOfProjects;
      return reply.send({
        loading: false,
        available: true,
        details: {
          ...details,
          requiredProjects: details.requiredProjects.map((p) => ({ ...p, met: isDone(p.slug) })),
          anyOfProjects: anyOf
            ? {
                count: anyOf.count,
                done: anyOf.projects.filter((p) => isDone(p.slug)).length,
                projects: anyOf.projects.map((p) => ({ ...p, met: isDone(p.slug) })),
              }
            : null,
          exclusiveProjects: details.exclusiveProjects.map((p) => ({ ...p, met: isDone(p.slug) })),
          level,
          minLevelMet: details.minLevel == null ? null : level >= details.minLevel,
        },
      });
    } catch (error: any) {
      return handleAPI42Error(error, reply, fastify);
    }
  }
}
