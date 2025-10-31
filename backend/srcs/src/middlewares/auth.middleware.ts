import { FastifyRequest, FastifyReply } from 'fastify';

// Le type AuthenticatedRequest est maintenant géré par fastify.d.ts
export type AuthenticatedRequest = FastifyRequest;

/**
 * Middleware d'authentification JWT
 * Vérifie le token et attache l'utilisateur à la requête
 */
export const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
	try {
		await request.jwtVerify();
	} catch (err: any) {
		reply.code(401).send({ error: 'Token invalide ou expiré' });
	}
};

/**
 * Middleware optionnel d'authentification
 * Continue même si le token est invalide
 */
export async function optionalAuthenticate(
  request: FastifyRequest
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch (err) {
    // Continue sans erreur
  }
}
