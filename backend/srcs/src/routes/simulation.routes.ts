import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middlewares/auth.middleware.js';
import { SimulationController } from '../controllers/simulation.controller.js';

export async function simulationRoutes(fastify: FastifyInstance) {
	// Récupérer la simulation de l'utilisateur
	fastify.get('/simulation', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return SimulationController.get(request, reply);
	});

	// Rechercher des utilisateurs (par login/prénom/nom)
	fastify.get('/simulation/search', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return SimulationController.searchUsers(request, reply);
	});

	// Simulation d'un autre utilisateur (public seulement)
	fastify.get('/simulation/user/:userId42', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return SimulationController.getUserPublic(request, reply);
	});

	// Utilisateurs qui ont simulé un projet spécifique (pour team matching)
	fastify.get('/simulation/project-users/:projectId', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return SimulationController.getProjectUsers(request, reply);
	});

	// Sauvegarder la simulation de l'utilisateur
	fastify.put('/simulation', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return SimulationController.save(request, reply);
	});

	// Sauvegarder uniquement l'état du guide interactif
	fastify.put('/simulation/tour-seen', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return SimulationController.saveTourSeen(request, reply);
	});

	// Récupérer le statut privacy de l'utilisateur connecté (null = non choisi)
	fastify.get('/simulation/me/privacy', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return SimulationController.getMyPrivacy(request, reply);
	});

	// Mettre à jour le statut public/privé
	fastify.put('/simulation/privacy', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return SimulationController.updatePrivacy(request, reply);
	});
}
