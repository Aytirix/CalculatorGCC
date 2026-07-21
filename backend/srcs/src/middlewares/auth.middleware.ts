import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyOwnerSession } from '../services/adminAuth.service.js';
import { isDelegate } from '../db/adminRepository.js';

// Le type AuthenticatedRequest est maintenant géré par fastify.d.ts
export type AuthenticatedRequest = FastifyRequest;

/**
 * Middleware d'authentification JWT (session OAuth 42).
 * Vérifie le token et attache l'utilisateur à la requête.
 */
export const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
	try {
		await request.jwtVerify();
	} catch (err: any) {
		reply.code(401).send({ error: 'Token invalide ou expiré' });
	}
};

/**
 * Autorisation « admin délégué » : utilisateur authentifié via OAuth 42 dont le login
 * figure dans la liste des délégués (gérée par l'owner depuis le panneau). Ces délégués
 * peuvent reconfigurer les SEULS secrets 42 (voie /setup admin) — jamais l'identité
 * admin (passkeys, liste des délégués), réservée à l'owner.
 *  - jwtVerify() exige un JWT signé par le serveur → le `login` est celui gravé au
 *    login OAuth depuis le profil 42, non forgeable côté client ;
 *  - l'accès n'est accordé que si ce login est un délégué enregistré en base.
 */
export const requireDelegate = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Token invalide ou expiré' });
  }
  if (!(await isDelegate(request.user.login))) {
    return reply.code(403).send({ error: 'Accès réservé aux administrateurs délégués' });
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
 * serveur) valide et non expirée. Réservé aux actions sensibles (gestion des passkeys,
 * des délégués, secrets 42 via le panneau). Indépendant d'OAuth 42 → fonctionne même
 * si 42 est mort. La session est attachée à `request.adminSession`.
 */
export const requireOwner = async (request: FastifyRequest, reply: FastifyReply) => {
  const session = verifyOwnerSession(getAdminSessionToken(request));
  if (!session) {
    return reply.code(401).send({ error: 'Session admin invalide ou expirée' });
  }
  request.adminSession = session;
};
