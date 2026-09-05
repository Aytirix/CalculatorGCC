import { FastifyRequest, FastifyReply } from 'fastify';
import {
  verifyConsoleToken,
  createOwnerSession,
  revokeOwnerSession,
  revokeOtherOwnerSessions,
} from '../services/adminAuth.service.js';
import { getAdminSessionToken } from '../middlewares/auth.middleware.js';
import { globalRefreshService } from '../services/globalRefresh.service.js';
import {
  countCredentials,
  logAdminEvent,
  listCredentials,
  deleteCredential,
  listDelegates,
  addDelegate,
  removeDelegate,
  listAuditEvents,
} from '../db/adminRepository.js';
import {
  startRegistration,
  finishRegistration,
  startAuthentication,
  finishAuthentication,
} from '../services/webauthn.service.js';
import { applyApi42Configuration, getApi42ConfigState } from '../services/api42Config.service.js';
import { allowedOriginRepository, normalizeOrigin } from '../db/allowedOriginRepository.js';
import { config } from '../config/config.js';
import { getMirrorApiUrl, normalizeMirrorUrl, setMirrorApiUrl } from '../services/mirror.service.js';

/** Acteur pour l'audit : sujet de la session owner, sinon 'owner'. */
function actorOf(request: FastifyRequest): string {
  return request.adminSession?.subject ?? 'owner';
}

export const adminController = {
  /**
   * Statut minimal pour piloter l'UI du bouton « Admin » : une passkey est-elle
   * enrôlée ? Si non, le front oriente vers le bootstrap par token console. On
   * n'expose rien de sensible (ni identité, ni secret).
   */
  async getStatus(_request: FastifyRequest, reply: FastifyReply) {
    const passkeyCount = await countCredentials();
    return reply.send({
      passkey_enrolled: passkeyCount > 0,
      passkey_count: passkeyCount,
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

  // ===== WebAuthn : enrôlement d'une passkey (owner requis) =====

  async webauthnRegisterOptions(_request: FastifyRequest, reply: FastifyReply) {
    const { flowId, options } = await startRegistration();
    return reply.send({ flow_id: flowId, options });
  },

  async webauthnRegisterVerify(request: FastifyRequest, reply: FastifyReply) {
    const body = (request.body ?? {}) as { flow_id?: string; response?: any; label?: string };
    if (!body.flow_id || !body.response) {
      return reply.code(400).send({ error: 'flow_id et response requis' });
    }
    try {
      const { credentialId } = await finishRegistration(body.flow_id, body.response, body.label);
      await logAdminEvent(actorOf(request), 'passkey_enrolled', credentialId);
      return reply.send({ ok: true, credential_id: credentialId });
    } catch (e: any) {
      return reply.code(400).send({ error: e?.message ?? "Échec de l'enrôlement" });
    }
  },

  // ===== WebAuthn : authentification par passkey (public) =====

  async webauthnAuthOptions(_request: FastifyRequest, reply: FastifyReply) {
    const { flowId, options } = await startAuthentication();
    return reply.send({ flow_id: flowId, options });
  },

  async webauthnAuthVerify(request: FastifyRequest, reply: FastifyReply) {
    const body = (request.body ?? {}) as { flow_id?: string; response?: any };
    if (!body.flow_id || !body.response) {
      return reply.code(400).send({ error: 'flow_id et response requis' });
    }
    try {
      const { credentialId } = await finishAuthentication(body.flow_id, body.response);
      const session = createOwnerSession('owner:' + credentialId);
      await logAdminEvent('owner:' + credentialId, 'admin_login', 'passkey');
      return reply.send({
        admin_token: session.token,
        expires_at: session.expiresAt,
        role: 'owner',
      });
    } catch {
      await logAdminEvent('unknown', 'admin_login_failed', 'passkey');
      return reply.code(401).send({ error: 'Authentification échouée' });
    }
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

  // ===== Passkeys (gestion, owner requis) =====

  async listPasskeys(_request: FastifyRequest, reply: FastifyReply) {
    const creds = await listCredentials();
    return reply.send({
      credentials: creds.map((c) => ({
        id: c.id,
        label: c.label,
        transports: c.transports,
        created_at: c.createdAt,
        last_used_at: c.lastUsedAt,
      })),
    });
  },

  async deletePasskey(request: FastifyRequest, reply: FastifyReply) {
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'id invalide' });
    }
    try {
      await deleteCredential(id);
    } catch {
      return reply.code(404).send({ error: 'Passkey introuvable' });
    }
    // Retirer un authenticator doit COUPER les accès qu'il a ouverts : sinon une
    // passkey compromise reste exploitable via sa session (et peut en ré-enrôler
    // une autre). On épargne la session courante, celle qui fait le ménage.
    const revoked = revokeOtherOwnerSessions(getAdminSessionToken(request));
    await logAdminEvent(actorOf(request), 'passkey_deleted', `${id} (sessions révoquées: ${revoked})`);
    return reply.send({ ok: true, sessions_revoked: revoked });
  },

  // ===== Délégués (logins 42 pouvant éditer les SEULS secrets 42, owner requis) =====

  async listDelegatesHandler(_request: FastifyRequest, reply: FastifyReply) {
    const delegates = await listDelegates();
    return reply.send({
      delegates: delegates.map((d) => ({ login: d.login42, created_at: d.createdAt })),
    });
  },

  async addDelegateHandler(request: FastifyRequest, reply: FastifyReply) {
    const body = (request.body ?? {}) as { login?: string };
    const login = (body.login ?? '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{1,64}$/.test(login)) {
      return reply.code(400).send({ error: 'Login 42 invalide' });
    }
    await addDelegate(login);
    await logAdminEvent(actorOf(request), 'delegate_added', login);
    return reply.send({ ok: true });
  },

  async removeDelegateHandler(request: FastifyRequest, reply: FastifyReply) {
    const login = String((request.params as any).login ?? '').trim().toLowerCase();
    if (!login) {
      return reply.code(400).send({ error: 'login requis' });
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

  async removeOriginHandler(request: FastifyRequest, reply: FastifyReply) {
    const raw = String((request.params as any).origin ?? '');
    const origin = normalizeOrigin(decodeURIComponent(raw));
    if (!origin) {
      return reply.code(400).send({ error: 'Origine invalide' });
    }
    await allowedOriginRepository.remove(origin);
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
};
