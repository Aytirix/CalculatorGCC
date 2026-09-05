import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/config.js';
import { allowedOriginRepository } from './db/allowedOriginRepository.js';
import { getMirrorApiUrl, proxyToMirror } from './services/mirror.service.js';
import { authRoutes } from './routes/auth.routes.js';
import { api42Routes } from './routes/api42.routes.js';
import { setupRoutes } from './routes/setup.routes.js';
import { simulationRoutes } from './routes/simulation.routes.js';
import { calendarRoutes } from './routes/calendar.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { requireConfigured } from './middlewares/setup.middleware.js';
import { initConfig, isConfigured, loadConfigIntoEnv, loadOrGenerateJwtSecret } from './db/configRepository.js';
import { rncpService } from './services/rncp.service.js';
import { initConsoleToken } from './services/adminAuth.service.js';

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
	// En production, seules l'instance elle-même et les origines explicitement
	// autorisées par l'owner peuvent appeler l'API depuis un autre domaine.
	// Sans ça, la liste blanche ne protégerait que la redirection de connexion.
	// En développement, on reste permissif (ports Vite, IP locale, tunnels).
	// La fonction NE doit pas être `async` : @fastify/cors valide le type de
	// l'option au chargement et rejette une fonction qui renvoie une promesse
	// (« Invalid CORS origin option »). Le travail asynchrone passe par le
	// callback, qui est justement là pour ça.
	origin: (origin, cb) => {
		// Pas d'en-tête Origin : same-origin, ou appel serveur à serveur.
		if (!origin) return cb(null, true);
		if (config.nodeEnv !== 'production') return cb(null, true);
		allowedOriginRepository
			.isAllowed(origin)
			.then((allowed) => cb(null, allowed))
			.catch(() => cb(null, false));
	},
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
// Derrière nginx, `request.ip` vaut l'IP DU PROXY pour tout l'internet : sans clé
// par client, un seul visiteur consomme le quota de tous — et peut verrouiller en
// permanence le login admin (console + passkey). nginx pose `X-Real-IP` à partir de
// la VRAIE IP client (bloc `real_ip` des confs de prod, qui résout X-Forwarded-For
// derrière Traefik) ; on retombe sur `request.ip` si l'en-tête est absent.
// Portée exacte de la garantie : sur le chemin PUBLIC (Internet → Traefik → nginx),
// Traefik écrase le X-Forwarded-For envoyé par le client, donc la clé n'est pas
// forgeable. Un appelant qui joint nginx en direct (port loopback de l'hôte — donc
// accès serveur déjà acquis) peut en revanche choisir sa clé : résiduel accepté.
// NB : `trustProxy: true` serait pire — la clé viendrait d'un en-tête client sans
// aucune normalisation en amont.
await fastify.register(rateLimit, {
	max: config.rateLimit.max,
	timeWindow: config.rateLimit.timeWindow,
	keyGenerator: (request) => {
		const realIp = request.headers['x-real-ip'];
		return (typeof realIp === 'string' && realIp.length > 0) ? realIp : request.ip;
	},
	// `statusCode` est indispensable : l'objet est *lancé* comme erreur et le
	// setErrorHandler retombe sur `error.statusCode || 500` — sans lui, un quota
	// dépassé répondait 500 au lieu de 429.
	errorResponseBuilder: () => ({
		statusCode: 429,
		code: 429,
		error: 'Too Many Requests',
		message: 'Rate limit exceeded, retry later',
	}),
});

// JWT
// On charge/génère le secret depuis la DB AVANT d'enregistrer le plugin afin
// d'utiliser un secret STATIQUE : la signature/vérification restent synchrones
// et correctement typées (un secret-fonction rendrait jwt.sign asynchrone).
// Gère aussi la promotion d'un éventuel Next Secret expiré (rotation).
await initConfig();
await loadOrGenerateJwtSecret();

await fastify.register(jwt, {
	secret: process.env.JWT_SECRET!,
	sign: {
		expiresIn: config.jwt.expiresIn,
	},
});

// ===== GLOBAL MIDDLEWARE =====
// Bloque toutes les routes sauf /api/setup/* si l'application n'est pas configurée
fastify.addHook('onRequest', requireConfigured);

// MODE MIROIR : si une API distante est configurée, cette instance ne sert plus
// ses propres données et relaie tout (sauf /admin et /setup, qui doivent rester
// locaux — sinon on ne pourrait plus désactiver le mode). Le corps est déjà
// parsé à ce stade, d'où le hook `preHandler` plutôt que `onRequest`.
fastify.addHook('preHandler', async (request, reply) => {
	const mirror = await getMirrorApiUrl();
	if (!mirror) return;
	try {
		if (await proxyToMirror(request, reply, mirror)) return reply;
	} catch (error) {
		request.log.error({ err: error }, '[Miroir] Relais impossible');
		return reply.code(502).send({
			error: 'Bad Gateway',
			message: "L'instance principale est injoignable.",
		});
	}
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

// Routes de setup - accessibles même si non configuré (le middleware global les laisse passer)
await fastify.register(setupRoutes);

// Routes admin (auth autonome, découplée d'OAuth 42) - accessibles même si non
// configuré : le bootstrap owner par token console doit fonctionner sur une instance vierge.
await fastify.register(adminRoutes);

// Routes protégées - nécessitent que l'application soit configurée (vérifié par le middleware global)
await fastify.register(authRoutes);
await fastify.register(api42Routes);
await fastify.register(simulationRoutes);
await fastify.register(calendarRoutes);

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

	// Rate limit : @fastify/rate-limit *lance* l'objet de errorResponseBuilder ; sans
	// cette branche, le corps était réécrit en « Internal Server Error » et l'admin
	// verrouillé ne comprenait pas pourquoi il était refusé.
	if (error.statusCode === 429) {
		return reply.code(429).send({
			error: 'Too Many Requests',
			message: 'Trop de tentatives — réessayez dans un instant.',
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
		// initConfig() + loadOrGenerateJwtSecret() ont déjà été exécutés avant
		// l'enregistrement du plugin JWT (voir plus haut). On charge ici les
		// credentials 42 déchiffrés dans l'environnement.
		await loadConfigIntoEnv();

		const configured = await isConfigured();
		const requireConfiguredDb = process.env.REQUIRE_CONFIGURED_DB === 'true';

		if (!configured && requireConfiguredDb) {
			throw new Error('Database is not configured. Refusing to start because REQUIRE_CONFIGURED_DB=true.');
		}

		if (!configured) {
			console.log('⚠️  APPLICATION NOT CONFIGURED');
			console.log('📝 Ouvrez /admin/login et authentifiez-vous avec le token console ci-dessous');
		}

		// Token console (bootstrap + recovery de l'auth admin autonome) : régénéré à
		// CHAQUE démarrage, affiché ici une seule fois. Prouve l'accès au serveur
		// (lire ces logs = contrôler la machine) → permet de créer la première passkey
		// admin, ou de récupérer l'accès si toutes les méthodes sont perdues.
		const consoleToken = initConsoleToken();
		console.log('🔐 Admin console token (this boot only — bootstrap & recovery):');
		console.log(`   ${consoleToken}`);

		await fastify.listen({
			port: config.port,
			host: '0.0.0.0'
		});

		// Préchauffage du catalogue du cursus, en tâche de fond : le référentiel
		// RNCP et le Holy Graph en dépendent. Depuis le cache en base c'est
		// instantané ; sinon ça évite au premier visiteur d'attendre la
		// pagination de l'API 42 devant un écran de chargement.
		if (await isConfigured()) rncpService.ensureCatalog();

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
