import { FastifyRequest, FastifyReply } from 'fastify';

// Le type AuthenticatedRequest est maintenant géré par fastify.d.ts
export type AuthenticatedRequest = FastifyRequest;

/**
 * Middleware d'authentification JWT
 * Vérifie le token et attache l'utilisateur à la requête
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    console.log('[Auth Middleware] Authorization header:', authHeader?.substring(0, 50) + '...');
    
    await request.jwtVerify();
    console.log('[Auth Middleware] JWT verified successfully, user:', request.user);
    // Le payload JWT est automatiquement attaché à request.user par @fastify/jwt
  } catch (err: any) {
    console.error('[Auth Middleware] JWT verification failed:', err.message);
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or missing token' });
  }
}

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
