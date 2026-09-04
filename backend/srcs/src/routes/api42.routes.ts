import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middlewares/auth.middleware.js';
import { API42Controller } from '../controllers/api42.controller.js';

/**
 * Routes pour l'API 42
 */
export async function api42Routes(fastify: FastifyInstance) {
	// Récupérer TOUS les projets de l'utilisateur (avec pagination)
	fastify.get('/api42/projects', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return API42Controller.getAllProjects(request, reply, fastify);
	});

	// Récupérer les cursus de l'utilisateur
	fastify.get('/api42/cursus', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return API42Controller.getCursus(request, reply, fastify);
	});

	// Récupérer les événements de l'utilisateur
	fastify.get('/api42/events', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return API42Controller.getEvents(request, reply, fastify);
	});

	// Récupérer toutes les données utilisateur (instantané en base, aucun appel 42)
	fastify.get('/api42/user-data', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return API42Controller.getUserData(request, reply, fastify);
	});

	// Déclencher un refresh (mise en file d'attente, soi uniquement)
	fastify.post('/api42/refresh', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return API42Controller.refreshUserData(request, reply, fastify);
	});

	// État du refresh en cours (position / ETA / cooldown)
	fastify.get('/api42/refresh/status', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return API42Controller.getRefreshStatus(request, reply, fastify);
	});

	// Usage courant de l'API 42 (page Conso API) — lecture mémoire, aucun appel 42
	fastify.get('/api42/usage', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return API42Controller.getUsage(request, reply, fastify);
	});

	// Récupérer les infos complètes de l'utilisateur depuis l'API 42
	fastify.get('/api42/me', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return API42Controller.getMe(request, reply, fastify);
	});

	// Holy Graph : catalogue des projets de chaque cursus + statut personnel
	fastify.get('/api42/holy-graph', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return API42Controller.getHolyGraph(request, reply, fastify);
	});

	// Taille d'équipe de chaque projet du cursus (solo / groupe)
	fastify.get('/api42/project-teams', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return API42Controller.getProjectTeams(request, reply, fastify);
	});

	// Personnes inscrites sur un projet côté intra 42 (cache 24 h)
	fastify.get('/api42/project-registrations/:projectId', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return API42Controller.getProjectRegistrations(request, reply, fastify);
	});

	// Détail d'un projet du Holy Graph (description, durée, groupe, prérequis)
	fastify.get('/api42/project-details/:projectId', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return API42Controller.getProjectDetails(request, reply, fastify);
	});

}
