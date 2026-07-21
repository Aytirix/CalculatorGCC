import { FastifyRequest, FastifyReply } from 'fastify';
import {
  verifyConsoleToken,
  createOwnerSession,
  revokeOwnerSession,
  revokeOtherOwnerSessions,
} from '../services/adminAuth.service.js';
import { getAdminSessionToken } from '../middlewares/auth.middleware.js';
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

  // ===== Journal d'audit (owner requis) =====

  async getAudit(_request: FastifyRequest, reply: FastifyReply) {
    const events = await listAuditEvents(50);
    return reply.send({ events });
  },
};
