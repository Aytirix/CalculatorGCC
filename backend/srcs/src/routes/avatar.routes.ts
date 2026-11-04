import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AvatarBusyError, getAvatar, parseAvatarUrl } from '../services/avatarProxy.service.js';

/**
 * GET /avatar?u=<URL d'une photo du CDN 42>
 *
 * Sans authentification : une balise <img> n'envoie pas notre JWT. Ce n'est
 * pas une fuite — ces photos sont celles du profil PUBLIC 42 de chacun — et le
 * relais n'accepte que les URL de photo du CDN de 42 (voir avatarProxy.service).
 * Quota dédié, large mais borné, et cache navigateur d'une semaine (l'URL
 * contient un hash : elle change quand la photo change).
 */
export async function avatarRoutes(fastify: FastifyInstance) {
	fastify.get('/avatar', {
		config: { rateLimit: { max: 600, timeWindow: '1 minute' } },
	}, async (request: FastifyRequest<{ Querystring: { u?: string } }>, reply: FastifyReply) => {
		const url = parseAvatarUrl(request.query.u);
		if (!url) return reply.code(400).send({ error: 'Invalid avatar url' });

		// Même clé de visiteur que le reste de l'API (X-Real-IP posé par nginx).
		const realIp = request.headers['x-real-ip'];
		const client = (typeof realIp === 'string' && realIp) || request.ip;

		let image;
		try {
			image = await getAvatar(url, client);
		} catch (error) {
			if (error instanceof AvatarBusyError) {
				return reply.code(503).header('Retry-After', '5').send({ error: 'Avatar service busy' });
			}
			return reply.code(502).send({ error: 'Avatar unavailable' });
		}
		if (!image) return reply.code(404).send({ error: 'Avatar not found' });

		return reply
			.header('Content-Type', image.contentType)
			.header('Cache-Control', 'public, max-age=604800, immutable')
			// Image affichée par notre propre front : même origine.
			.header('Cross-Origin-Resource-Policy', 'same-origin')
			.header('X-Content-Type-Options', 'nosniff')
			.send(image.body);
	});
}
