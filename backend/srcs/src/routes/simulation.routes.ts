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

	/**
	 * Qui contacter à propos du référentiel RNCP.
	 *
	 * Ce sont les délégués déclarés dans le panneau d'administration. Un projet
	 * marqué « hors référentiel » affiche leurs logins pour qu'un étudiant qui
	 * pense à une erreur sache à qui s'adresser — sans eux, la mention n'a aucun
	 * destinataire et n'est donc pas affichée du tout.
	 *
	 * On ne renvoie QUE les logins : ni date d'ajout, ni rien d'autre. Ce sont des
	 * logins 42, publics sur l'intra, mais la route reste authentifiée.
	 */
	fastify.get('/simulation/referential-contacts', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return SimulationController.getReferentialContacts(request, reply);
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

	// « J'ai déjà ma team » sur un projet simulé
	fastify.put('/simulation/project-team/:projectId', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return SimulationController.setProjectTeam(request, reply);
	});

	// Sauvegarder la simulation de l'utilisateur
	fastify.put('/simulation', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return SimulationController.save(request, reply);
	});

	// Sauvegarder UNIQUEMENT les expériences professionnelles manuelles.
	// Route dédiée : `PUT /simulation` remplace toute la simulation, et la page
	// qui appelle ici n'en connaît qu'une partie.
	fastify.put('/simulation/manual-experiences', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return SimulationController.saveManualExperiences(request, reply);
	});

	// Sauvegarder uniquement l'état du guide interactif
	fastify.put('/simulation/tour-seen', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return SimulationController.saveTourSeen(request, reply);
	});

	// Récupérer la version du dernier changelog vu par l'utilisateur
	fastify.get('/simulation/changelog-seen', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return SimulationController.getChangelogSeen(request, reply);
	});

	// Marquer une version de changelog comme vue
	fastify.put('/simulation/changelog-seen', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return SimulationController.saveChangelogSeen(request, reply);
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
