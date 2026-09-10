import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyOwnerSession } from '../services/adminAuth.service.js';
import { getDelegatePermissions } from '../db/adminRepository.js';
import type { AdminPermission } from '../services/adminPermissions.js';
import { touchPresence } from '../services/stats.service.js';

// Le type AuthenticatedRequest est maintenant géré par fastify.d.ts
export type AuthenticatedRequest = FastifyRequest;

/**
 * Middleware d'authentification JWT (session OAuth 42).
 * Vérifie le token et attache l'utilisateur à la requête.
 */
export const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
	try {
		await request.jwtVerify();
		// Marque le passage pour les statistiques d'usage agrégées. Throttlé à une
		// écriture par heure et par utilisateur, et jamais attendu.
		touchPresence(request.user.user_id_42);
	} catch (err: any) {
		reply.code(401).send({ error: 'Token invalide ou expiré' });
	}
};

// ===== Authentification admin autonome (owner) =====

/** En-tête portant le token de session admin owner (distinct du Bearer JWT 42). */
export const ADMIN_SESSION_HEADER = 'x-admin-session';

/** Extrait le token de session admin depuis l'en-tête dédié. */
export function getAdminSessionToken(request: FastifyRequest): string | undefined {
  const raw = request.headers[ADMIN_SESSION_HEADER];
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

/**
 * Autorise UNIQUEMENT l'owner : session admin autonome (token opaque en mémoire
 * serveur) valide et non expirée. Ne subsiste que pour la déconnexion : les zones du
 * panneau passent par `requirePermission`. Indépendant d'OAuth 42 → fonctionne même
 * si 42 est mort. La session est attachée à `request.adminSession`.
 */
export const requireOwner = async (request: FastifyRequest, reply: FastifyReply) => {
  const session = verifyOwnerSession(getAdminSessionToken(request));
  if (!session) {
    return reply.code(401).send({ error: 'Session admin invalide ou expirée' });
  }
  request.adminSession = session;
};

/**
 * Autorise une zone du panneau, à l'owner ou à un délégué qui la détient.
 *
 * Deux identités distinctes mènent au même panneau :
 *  - l'OWNER prouve l'accès à la machine (token console) et a toutes les zones ;
 *  - un DÉLÉGUÉ prouve une identité 42 (JWT signé par nous, donc un `login` gravé
 *    au retour d'OAuth et non forgeable) et n'a que les zones qu'on lui a cochées.
 *
 * L'ordre compte : on regarde la session owner AVANT le JWT, pour qu'un owner qui
 * se trouve aussi être délégué garde ses pleins droits plutôt que d'être ramené
 * aux permissions de sa ligne.
 *
 * `request.adminSession` reste posé pour l'owner ; `request.adminActor` dit dans
 * tous les cas qui agit, ce dont le journal d'audit a besoin.
 */
export const requirePermission = (permission: AdminPermission) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const session = verifyOwnerSession(getAdminSessionToken(request));
    if (session) {
      request.adminSession = session;
      request.adminActor = { kind: 'owner', label: session.subject, permissions: 'all' };
      return;
    }

    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Session admin invalide ou expirée' });
    }

    const permissions = await getDelegatePermissions(request.user.login);
    if (!permissions) {
      return reply.code(403).send({ error: 'Accès réservé aux administrateurs' });
    }
    if (!permissions.includes(permission)) {
      return reply.code(403).send({ error: `Permission « ${permission} » requise` });
    }

    request.adminActor = {
      kind: 'delegate',
      label: `delegate:${request.user.login}`,
      permissions,
    };
  };
};

/** Qui agit, pour le journal d'audit — quelle que soit la voie d'entrée. */
export function adminActorLabel(request: FastifyRequest): string {
  return request.adminActor?.label ?? request.adminSession?.subject ?? 'inconnu';
}

/**
 * Renseigne `request.adminActor` sans jamais refuser la requête.
 *
 * Sert à `/admin/me` : l'écran a besoin de savoir qu'il n'a aucun droit, ce
 * qu'un 401 ne lui permettrait pas de distinguer d'une panne.
 */
export const attachAdminActor = async (request: FastifyRequest) => {
  const session = verifyOwnerSession(getAdminSessionToken(request));
  if (session) {
    request.adminSession = session;
    request.adminActor = { kind: 'owner', label: session.subject, permissions: 'all' };
    return;
  }
  try {
    await request.jwtVerify();
  } catch {
    return;
  }
  const permissions = await getDelegatePermissions(request.user.login);
  if (permissions) {
    request.adminActor = {
      kind: 'delegate',
      label: `delegate:${request.user.login}`,
      permissions,
    };
  }
};
