import { FastifyRequest, FastifyReply } from 'fastify';
import {
  verifyConsoleToken,
  createOwnerSession,
  revokeOwnerSession,
} from '../services/adminAuth.service.js';
import { getAdminSessionToken, adminActorLabel } from '../middlewares/auth.middleware.js';
import { globalRefreshService } from '../services/globalRefresh.service.js';
import { compareWithGcc, GccError } from '../services/gccReferential.service.js';
import {
  applyOperations,
  exportAsTypeScript,
  getReferentialVersion,
  listVersions,
  ReferentialConflict,
  revertTo,
  type ReferentialOperation,
} from '../services/referentialStore.js';
import { simulationRepository } from '../db/simulationRepository.js';
import { rncpService } from '../services/rncp.service.js';
import {
  logAdminEvent,
  listDelegates,
  addDelegate,
  removeDelegate,
  listAuditEvents,
} from '../db/adminRepository.js';
import {
  ADMIN_PERMISSIONS,
  ADMIN_PERMISSION_LABELS,
  parsePermissions,
  serializePermissions,
} from '../services/adminPermissions.js';
import { applyApi42Configuration, getApi42ConfigState } from '../services/api42Config.service.js';
import { allowedOriginRepository, normalizeOrigin } from '../db/allowedOriginRepository.js';
import { config } from '../config/config.js';
import { checkMirrorApi, getMirrorApiUrl, normalizeMirrorUrl, setMirrorApiUrl } from '../services/mirror.service.js';

/**
 * Forme d'un identifiant du référentiel. Volontairement étroite : ces valeurs
 * sont écrites dans du code TypeScript par l'export, servies à tous les clients,
 * et surtout PERSISTÉES dans les simulations des utilisateurs, où elles ne sont
 * plus renommables sans casser leurs données.
 */
const IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** Slug de l'API 42 : même esprit, en tolérant les majuscules qu'elle emploie. */
const SLUG_42 = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Acteur pour l'audit : `console` pour l'owner, `delegate:<login>` sinon. */
function actorOf(request: FastifyRequest): string {
  return adminActorLabel(request);
}

export const adminController = {
  /**
   * Statut public minimal, pour que l'écran de connexion sache quoi proposer.
   * On n'expose rien de sensible : ni identité, ni secret, ni qui est délégué.
   */
  async getStatus(_request: FastifyRequest, reply: FastifyReply) {
    // Qui peut réparer une clé 42 morte : les délégués portant `secrets42`. Cette
    // liste est PUBLIQUE, et c'est délibéré — quand la connexion 42 ne fonctionne
    // plus, plus personne ne peut s'authentifier pour la demander ailleurs, et
    // l'écran d'erreur n'aurait aucun destinataire à proposer. Ce sont des logins
    // 42, publics sur l'intra ; on ne renvoie rien d'autre.
    const contacts = (await listDelegates())
      .filter((d) => parsePermissions(d.permissions).includes('secrets42'))
      .map((d) => d.login42);

    return reply.send({
      // Le token console est la seule voie OWNER. Un délégué, lui, entre avec sa
      // session 42 ordinaire et ne voit que les zones qui lui sont ouvertes.
      methods: ['console', 'delegate'],
      permissions: ADMIN_PERMISSIONS.map((p) => ({ key: p, label: ADMIN_PERMISSION_LABELS[p] })),
      contacts,
    });
  },

  /**
   * Qui suis-je et que puis-je faire ? Le panneau s'en sert pour n'afficher que
   * les zones autorisées — sans quoi un délégué verrait des sections qui
   * répondraient 403 à chaque clic.
   *
   * Ne dit jamais NON : un visiteur sans droit reçoit une liste vide, pas une
   * erreur, pour que l'écran puisse l'expliquer plutôt que de casser.
   */
  async getMe(request: FastifyRequest, reply: FastifyReply) {
    const actor = request.adminActor;
    if (!actor) return reply.send({ kind: 'none', permissions: [] });
    return reply.send({
      kind: actor.kind,
      label: actor.label,
      permissions: actor.permissions === 'all' ? [...ADMIN_PERMISSIONS] : actor.permissions,
    });
  },

  /**
   * Bootstrap / recovery : échange le token console (affiché dans les logs au boot)
   * contre une session owner. Route rate-limitée. Message d'erreur neutre en cas
   * d'échec + trace d'audit.
   */
  async loginWithConsoleToken(request: FastifyRequest, reply: FastifyReply) {
    const body = (request.body ?? {}) as { token?: unknown };

    if (!verifyConsoleToken(body.token)) {
      await logAdminEvent('console', 'admin_login_failed', 'console token');
      return reply.code(401).send({ error: 'Token console invalide' });
    }

    const session = createOwnerSession('console');
    await logAdminEvent('console', 'admin_login', 'console token');
    return reply.send({
      admin_token: session.token,
      expires_at: session.expiresAt,
      role: 'owner',
    });
  },

  /** Déconnexion admin : révoque la session owner courante. */
  async logout(request: FastifyRequest, reply: FastifyReply) {
    revokeOwnerSession(getAdminSessionToken(request));
    return reply.send({ ok: true });
  },

  // ===== Secrets 42 (courant + next) =====

  /** État des credentials 42 pour le panel — SANS jamais renvoyer les secrets. */
  async getConfig(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send(await getApi42ConfigState());
  },

  /** Met à jour clientId + secret courant (+ Next optionnel). Validé auprès de 42. */
  async updateSecrets(request: FastifyRequest, reply: FastifyReply) {
    const body = (request.body ?? {}) as {
      client_id?: string;
      client_secret?: string;
      client_secret_next?: string;
    };
    if (!body.client_id || !body.client_secret) {
      return reply.code(400).send({ error: 'client_id et client_secret requis' });
    }

    const result = await applyApi42Configuration({
      clientId: body.client_id,
      clientSecret: body.client_secret,
      clientSecret42Next: body.client_secret_next,
    });

    if (!result.ok) {
      await logAdminEvent(actorOf(request), 'secret_update_failed', result.error);
      return reply.code(result.status).send({
        error: result.error,
        validation_failed: result.validationFailed ?? false,
      });
    }

    await logAdminEvent(
      actorOf(request),
      'secret_updated',
      body.client_secret_next?.trim() ? 'current+next' : 'current',
    );
    return reply.send({ ok: true });
  },

  // ===== Délégués (permission `delegates`) =====

  /**
   * Le délégué visé est-il MOI ?
   *
   * Un délégué qui édite sa propre ligne s'accorde ce qu'il veut : le garde-fou
   * le plus simple est de lui interdire de se toucher lui-même. L'owner, lui,
   * n'est jamais un délégué — il entre par le token console — donc la règle ne
   * le gêne pas.
   */
  estSoiMeme(request: FastifyRequest, login: string): boolean {
    const actor = request.adminActor;
    if (actor?.kind !== 'delegate') return false;
    // Comparaison INSENSIBLE à la casse, pour s'aligner sur la collation de la
    // base (`utf8mb4_unicode_ci`). Sans ça, un JWT portant `Theo` retrouvait bien
    // la ligne `theo` — donc ses droits — mais échappait aux gardes « ne pas se
    // modifier soi-même » et « ne pas se retirer ». Pas d'escalade (la règle
    // « on n'accorde pas ce qu'on n'a pas » tient), mais une garde qui ne garde
    // rien est pire qu'une garde absente : on croit être protégé.
    // `trim()` en plus de la casse : la collation MariaDB compare aussi en PAD
    // SPACE, si bien qu'un login `alice ` retrouve la ligne `alice` et ses droits,
    // tout en échappant à une comparaison de chaînes stricte.
    const moi = actor.label.slice('delegate:'.length).trim().toLowerCase();
    return moi === login.trim().toLowerCase();
  },

  async listDelegatesHandler(_request: FastifyRequest, reply: FastifyReply) {
    const delegates = await listDelegates();
    return reply.send({
      delegates: delegates.map((d) => ({
        login: d.login42,
        permissions: parsePermissions(d.permissions),
        created_at: d.createdAt,
      })),
    });
  },

  async addDelegateHandler(request: FastifyRequest, reply: FastifyReply) {
    const body = (request.body ?? {}) as { login?: string; permissions?: unknown };
    const login = (body.login ?? '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{1,64}$/.test(login)) {
      return reply.code(400).send({ error: 'Login 42 invalide' });
    }

    // `undefined` (champ absent) et `[]` (tout décoché) ne veulent PAS dire la même
    // chose : le premier laisse les zones en place, le second les retire.
    const demandees = Array.isArray(body.permissions)
      ? body.permissions.filter((p): p is string => typeof p === 'string')
      : undefined;

    // ANTI-ESCALADE, deux règles.
    //
    // 1. On ne s'édite pas soi-même. Sans ça, un délégué portant `delegates` se
    //    coche toutes les cases en une requête et devient owner de fait.
    // 2. On n'accorde pas ce qu'on n'a pas. Sans ça, il lui suffit de créer un
    //    second compte avec tous les droits, puis de s'y connecter.
    // L'owner échappe aux deux : ses permissions valent `'all'` et il n'est pas
    // un délégué.
    const actor = request.adminActor;
    if (actor?.kind === 'delegate') {
      if (adminController.estSoiMeme(request, login)) {
        return reply.code(403).send({
          error: 'Un délégué ne peut pas modifier ses propres permissions',
        });
      }
      const siennes = actor.permissions === 'all' ? [...ADMIN_PERMISSIONS] : actor.permissions;
      const enTrop = (demandees ?? []).filter(
        (p) => !(siennes as readonly string[]).includes(p) && (ADMIN_PERMISSIONS as readonly string[]).includes(p),
      );
      if (enTrop.length > 0) {
        return reply.code(403).send({
          error: `Vous ne détenez pas : ${enTrop.join(', ')}`,
        });
      }
    }

    await addDelegate(login, demandees);
    await logAdminEvent(
      actorOf(request),
      'delegate_added',
      demandees === undefined
        ? `${login} [zones inchangées]`
        : `${login} [${serializePermissions(demandees) || 'aucune'}]`,
    );
    return reply.send({ ok: true });
  },

  async removeDelegateHandler(request: FastifyRequest, reply: FastifyReply) {
    const login = String((request.params as any).login ?? '').trim().toLowerCase();
    if (!login) {
      return reply.code(400).send({ error: 'login requis' });
    }
    // Se retirer soi-même n'est pas une escalade, mais c'est un pied de biche :
    // le panneau perdrait son dernier gestionnaire sans que personne l'ait voulu.
    if (adminController.estSoiMeme(request, login)) {
      return reply.code(403).send({ error: 'Un délégué ne peut pas se retirer lui-même' });
    }
    await removeDelegate(login);
    await logAdminEvent(actorOf(request), 'delegate_removed', login);
    return reply.send({ ok: true });
  },

  // ===== Origines autorisées (owner requis) =====

  async listOriginsHandler(_request: FastifyRequest, reply: FastifyReply) {
    const origins = await allowedOriginRepository.list();
    return reply.send({
      origins: origins.map((o) => ({
        origin: o.origin,
        label: o.label,
        created_at: o.createdAt,
      })),
      // L'instance elle-même est toujours autorisée, sans être en base : on la
      // renvoie pour que le panneau puisse l'afficher comme telle.
      self: config.frontendUrl,
      // En production, une origine locale n'est jamais auto-autorisée.
      self_allowed: await allowedOriginRepository.isAllowed(config.frontendUrl),
      environment: config.nodeEnv,
    });
  },

  async addOriginHandler(request: FastifyRequest, reply: FastifyReply) {
    const body = (request.body ?? {}) as { origin?: string; label?: string };
    const origin = normalizeOrigin(body.origin ?? '');
    if (!origin) {
      return reply.code(400).send({ error: 'Origine invalide (attendu : https://exemple.fr)' });
    }
    const label = (body.label ?? '').trim().slice(0, 128) || null;
    await allowedOriginRepository.add(origin, label);
    await logAdminEvent(actorOf(request), 'origin_added', origin);
    return reply.send({ ok: true, origin });
  },

  /**
   * L'origine arrive en QUERY, pas dans le chemin : nginx décode et normalise
   * l'URI avant de la transmettre, si bien que
   * `DELETE /admin/origins/https%3A%2F%2Fex.fr` arrivait ici en
   * `/admin/origins/https:/ex.fr` — trois segments, aucune route, 404. Le
   * bouton « Révoquer » ne fonctionnait donc jamais.
   */
  async removeOriginHandler(request: FastifyRequest, reply: FastifyReply) {
    // Un paramètre répété (`?origin=a&origin=b`) arrive en tableau : le laisser
    // passer par `String()` révoquerait une origine « a,b » qui n'existe pas.
    const raw = (request.query as { origin?: unknown }).origin;
    if (typeof raw !== 'string') {
      return reply.code(400).send({ error: 'Origine invalide' });
    }
    const origin = normalizeOrigin(raw);
    if (!origin) {
      return reply.code(400).send({ error: 'Origine invalide' });
    }
    // Ne journaliser que ce qui a réellement été supprimé : sinon le journal
    // d'audit enregistre des révocations qui n'ont jamais eu lieu.
    const removed = await allowedOriginRepository.remove(origin);
    if (!removed) {
      return reply.code(404).send({ error: "Cette origine n'est pas autorisée" });
    }
    await logAdminEvent(actorOf(request), 'origin_removed', origin);
    return reply.send({ ok: true });
  },

  // ===== Mode miroir (owner requis) =====

  async getMirrorHandler(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send({ mirror_api_url: await getMirrorApiUrl() });
  },

  async setMirrorHandler(request: FastifyRequest, reply: FastifyReply) {
    const body = (request.body ?? {}) as { mirror_api_url?: string | null };
    const raw = body.mirror_api_url;

    // Chaîne vide ou null : on repasse l'instance sur ses propres données.
    if (!raw) {
      await setMirrorApiUrl(null);
      await logAdminEvent(actorOf(request), 'mirror_disabled');
      return reply.send({ mirror_api_url: null });
    }

    const url = normalizeMirrorUrl(raw);
    if (!url) {
      return reply.code(400).send({ error: 'URL invalide (attendu : https://exemple.fr/api)' });
    }
    // On refuse de se relayer vers soi-même : boucle infinie garantie.
    if (url.startsWith(config.frontendUrl)) {
      return reply.code(400).send({ error: 'Cette instance ne peut pas se relayer vers elle-même.' });
    }

    // On vérifie AVANT d'enregistrer : une URL erronée rendrait toute
    // l'application blanche, y compris la page permettant de la corriger.
    const check = await checkMirrorApi(url, config.frontendUrl);
    if (!check.ok) {
      return reply.code(400).send({ error: `${url} ${check.reason}.` });
    }

    await setMirrorApiUrl(url);
    await logAdminEvent(actorOf(request), 'mirror_enabled', url);
    return reply.send({ mirror_api_url: url });
  },

  // ===== Journal d'audit (owner requis) =====

  async getAudit(_request: FastifyRequest, reply: FastifyReply) {
    const events = await listAuditEvents(50);
    return reply.send({ events });
  },

  // ===== Refresh global des données 42 (owner requis) =====

  async getGlobalRefresh(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send(await globalRefreshService.getState());
  },

  /**
   * Renouvelle le cache de référence partagé puis remet en file l'instantané de
   * tous les utilisateurs. Refusé si un refresh est déjà en cours : les
   * requêtes partent au compte-gouttes et l'opération peut durer longtemps.
   */
  async startGlobalRefresh(request: FastifyRequest, reply: FastifyReply) {
    const actor = actorOf(request);
    const started = await globalRefreshService.start(actor);
    if (!started) {
      return reply.code(409).send({
        ok: false,
        code: 'ALREADY_RUNNING',
        message: 'Un refresh global est déjà en cours.',
        state: await globalRefreshService.getState(),
      });
    }

    await logAdminEvent(actor, 'global_refresh_started');
    return reply.send({ ok: true, state: await globalRefreshService.getState() });
  },

  /**
   * Confronte notre référentiel RNCP à celui de GCC, la source de vérité de l'école.
   *
   * Le jeton de session GCC est fourni par l'administrateur à chaque appel : il
   * vient de l'OIDC de l'école, dure cinq minutes, et n'est ni stocké ni
   * journalisé — seul le fait d'avoir lancé la comparaison l'est.
   */
  async compareGccReferential(request: FastifyRequest, reply: FastifyReply) {
    const body = (request.body ?? {}) as { token?: unknown; rule_ids?: unknown };
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) {
      return reply.code(400).send({
        ok: false,
        message: 'Jeton GCC manquant.',
      });
    }

    // Échappatoire si GCC renomme ses règles : on peut imposer les identifiants
    // des quatre racines plutôt que de les reconnaître par leur nom.
    const forcedRuleIds = Array.isArray(body.rule_ids)
      ? body.rule_ids.filter((id): id is number => Number.isInteger(id))
      : undefined;

    try {
      const comparison = await compareWithGcc(token, forcedRuleIds);
      await logAdminEvent(actorOf(request), 'gcc_referential_compared');
      return reply.send({ ok: true, comparison });
    } catch (error) {
      // `GccError` porte un statut pensé pour l'appelant (401 jeton refusé, 502
      // GCC injoignable…). Toute autre erreur reste un 500 sans détail : son
      // message pourrait venir de la base ou de l'API 42.
      // Tracé même en échec : une comparaison refusée est une information
      // d'exploitation (jeton expiré, GCC injoignable), et n'en garder que les
      // succès donne un journal d'audit qui ment par omission.
      await logAdminEvent(actorOf(request), 'gcc_referential_compare_failed');
      if (error instanceof GccError) {
        return reply.code(error.status).send({ ok: false, message: error.message });
      }
      request.log.error({ err: error }, 'comparaison GCC en échec');
      return reply.code(500).send({
        ok: false,
        message: 'La comparaison a échoué. Voir les journaux du serveur.',
      });
    }
  },

  /** Version courante du référentiel et historique des modifications. */
  async getReferentialState(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send({
      version: getReferentialVersion(),
      versions: await listVersions(),
    });
  },

  /**
   * Applique les modifications cochées dans le panneau.
   *
   * Le corps ne porte QUE des opérations ciblées, jamais un référentiel complet :
   * accepter un payload entier reviendrait à laisser une requête HTTP réécrire
   * ce qui valide les diplômes de tout le monde. Chaque opération est vérifiée
   * indépendamment, et celles qui échouent n'empêchent pas les autres.
   */
  async applyReferential(request: FastifyRequest, reply: FastifyReply) {
    const body = (request.body ?? {}) as { operations?: unknown };
    if (!Array.isArray(body.operations) || body.operations.length === 0) {
      return reply.code(400).send({ ok: false, message: 'Aucune modification à appliquer.' });
    }
    if (body.operations.length > 200) {
      return reply.code(400).send({ ok: false, message: 'Trop de modifications en une fois (200 maximum).' });
    }

    const KINDS = new Set(['add', 'retire', 'unretire', 'remove']);
    const operations: ReferentialOperation[] = [];
    for (const raw of body.operations) {
      const op = raw as Record<string, unknown>;
      if (
        typeof op.kind !== 'string' || !KINDS.has(op.kind) ||
        typeof op.rncpId !== 'string' || typeof op.categoryId !== 'string' ||
        typeof op.projectId !== 'string'
      ) {
        return reply.code(400).send({ ok: false, message: 'Modification mal formée.' });
      }
      // Ces identifiants finissent PERSISTÉS dans les simulations des utilisateurs
      // et ne sont plus renommables ensuite. Sans contrainte de forme, la chaîne
      // vide, un saut de ligne, un octet NUL ou 100 ko de texte entraient dans le
      // référentiel servi à tout le monde — la chaîne vide devenant même un
      // identifiant « valide » que le chemin de sauvegarde acceptait.
      if (!IDENTIFIER.test(op.projectId)) {
        return reply.code(400).send({
          ok: false,
          message: `Identifiant de projet invalide : « ${op.projectId.slice(0, 40)} ». Attendu : minuscules, chiffres, tirets, points ou underscores (64 caractères maximum).`,
        });
      }
      if (!IDENTIFIER.test(op.rncpId) || !IDENTIFIER.test(op.categoryId)) {
        return reply.code(400).send({ ok: false, message: 'Identifiant de RNCP ou de catégorie invalide.' });
      }
      if (op.kind === 'add' && !(typeof op.slug42 === 'string' || op.slug42 === null)) {
        return reply.code(400).send({ ok: false, message: 'slug42 doit être une chaîne ou null.' });
      }
      if (op.kind === 'add' && typeof op.slug42 === 'string' && !SLUG_42.test(op.slug42)) {
        return reply.code(400).send({
          ok: false,
          message: `Slug 42 invalide : « ${op.slug42.slice(0, 40)} ».`,
        });
      }
      operations.push(op as unknown as ReferentialOperation);
    }

    // Une suppression franche est refusée sur un projet encore simulé : ces
    // personnes verraient le projet cesser de compter sans explication. Le
    // compte est relu ICI, pas repris du rapport, qui peut dater.
    const counts = await simulationRepository.countByProjectIds(
      operations.filter((o) => o.kind === 'remove').map((o) => o.projectId),
    );

    // Nom et XP affichés aujourd'hui, pour figer un `fallback` en même temps
    // qu'un `retired` (sinon le projet disparaît au lieu d'être grisé).
    const displayed = new Map<string, { name: string; xp: number }>();
    if (operations.some((o) => o.kind === 'retire')) {
      const built = await rncpService.build();
      for (const entry of built ?? []) {
        for (const category of entry.categories) {
          for (const project of category.projects) {
            displayed.set(project.id, { name: project.name, xp: project.xp });
          }
        }
      }
    }

    const actor = actorOf(request);
    let result;
    try {
      result = await applyOperations(operations, actor, counts, displayed);
    } catch (error) {
      // 409 et pas 500 : ce n'est pas une panne, c'est un état de départ périmé.
      // Le message dit quoi faire, et RIEN n'a été enregistré.
      if (error instanceof ReferentialConflict) {
        return reply.code(409).send({ ok: false, message: error.message });
      }
      throw error;
    }
    if (result.applied.length > 0) {
      await logAdminEvent(actor, 'referential_updated', `v${result.version} — ${result.applied.length} modification(s)`);
      // Mémoire ET copie persistée : sans la seconde, un redémarrage avant que
      // le catalogue 42 soit en cache resservirait le référentiel d'avant.
      await rncpService.invalidate();
    }
    return reply.send({ ok: true, ...result });
  },

  /** Rétablit une version antérieure, en en créant une nouvelle qui la recopie. */
  async revertReferential(request: FastifyRequest, reply: FastifyReply) {
    const body = (request.body ?? {}) as { version?: unknown };
    if (!Number.isInteger(body.version)) {
      return reply.code(400).send({ ok: false, message: 'Version invalide.' });
    }
    const actor = actorOf(request);
    try {
      // Le compte est passé en fonction : `revertTo` ne connaît les projets qui
      // vont disparaître qu'après avoir lu la version cible.
      const version = await revertTo(body.version as number, actor, (ids) =>
        simulationRepository.countByProjectIds(ids),
      );
      await logAdminEvent(actor, 'referential_reverted', `→ v${body.version} (nouvelle v${version})`);
      await rncpService.invalidate();
      return reply.send({ ok: true, version });
    } catch (error) {
      if (error instanceof ReferentialConflict) {
        return reply.code(409).send({ ok: false, message: error.message });
      }
      return reply.code(404).send({
        ok: false,
        message: error instanceof Error ? error.message : 'Version introuvable.',
      });
    }
  },

  /** Le référentiel courant réécrit en TypeScript, pour remettre la graine à jour. */
  async exportReferential(_request: FastifyRequest, reply: FastifyReply) {
    return reply.send({ version: getReferentialVersion(), typescript: exportAsTypeScript() });
  },
};
