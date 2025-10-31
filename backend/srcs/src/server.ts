import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/config.js';
import { authRoutes } from './routes/auth.routes.js';
import { api42Routes } from './routes/api42.routes.js';

const fastify = Fastify({
	logger: {
		level: config.nodeEnv === 'development' ? 'info' : 'warn',
		transport: config.nodeEnv === 'development'
			? {
				target: 'pino-pretty',
				options: {
					translateTime: 'HH:MM:ss Z',
					ignore: 'pid,hostname',
				},
			}
			: undefined,
	},
});

// ===== SECURITY PLUGINS =====

// CORS
// Le frontend accède au backend via Nginx (frontendUrl)
// En dev, on accepte aussi les ports Vite directs pour le développement local
await fastify.register(cors, {
	origin: true,
	credentials: true,
	methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
	maxAge: 86400,
});

// Helmet - sécurise les headers HTTP
await fastify.register(helmet, {
	contentSecurityPolicy: {
		directives: {
			defaultSrc: ["'self'"],
			styleSrc: ["'self'", "'unsafe-inline'"],
			scriptSrc: ["'self'"],
			imgSrc: ["'self'", 'data:', 'https:'],
		},
	},
});

// Rate limiting
await fastify.register(rateLimit, {
	max: config.rateLimit.max,
	timeWindow: config.rateLimit.timeWindow,
	errorResponseBuilder: () => ({
		code: 429,
		error: 'Too Many Requests',
		message: 'Rate limit exceeded, retry later',
	}),
});

// JWT
await fastify.register(jwt, {
	secret: config.jwt.secret,
	sign: {
		expiresIn: config.jwt.expiresIn,
	},
});

// ===== HEALTH CHECK =====

fastify.get('/health', async () => {
	return {
		status: 'ok',
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
	};
});

// ===== API ROUTES =====
// Note: Pas de préfixe /api ici car Nginx le gère déjà
// Les requêtes arrivent comme: /auth/42, /auth/callback, etc.
await fastify.register(authRoutes);
await fastify.register(api42Routes);

// ===== ERROR HANDLER =====

fastify.setErrorHandler((error, _request, reply) => {
	fastify.log.error(error);

	// JWT errors
	if (error.statusCode === 401) {
		return reply.code(401).send({
			error: 'Unauthorized',
			message: error.message,
		});
	}

	// Validation errors
	if (error.statusCode === 400) {
		return reply.code(400).send({
			error: 'Bad Request',
			message: error.message,
		});
	}

	// Generic server error
	return reply.code(error.statusCode || 500).send({
		error: 'Internal Server Error',
		message: config.nodeEnv === 'development' ? error.message : 'An error occurred',
	});
});

// ===== START SERVER =====

async function start() {
	try {
		await fastify.listen({
			port: config.port,
			host: '0.0.0.0'
		});

		console.log(`
╔════════════════════════════════════════╗
║   🚀 Calculator GCC Backend Started   ║
╠════════════════════════════════════════╣
║  Port: ${config.port.toString().padEnd(31)}  ║
║  Environment: ${config.nodeEnv.padEnd(24)}  ║
║  Frontend: ${config.frontendUrl.padEnd(25)}║
╚════════════════════════════════════════╝
    `);
	} catch (err) {
		fastify.log.error(err);
		process.exit(1);
	}
}

// Graceful shutdown
const signals = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
	process.on(signal, async () => {
		console.log(`\n${signal} received, closing server gracefully...`);
		await fastify.close();
		process.exit(0);
	});
});

start();
