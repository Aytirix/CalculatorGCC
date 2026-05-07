import { FastifyRequest, FastifyReply } from 'fastify';
import { simulationRepository } from '../db/simulationRepository.js';
import { prisma } from '../db/connection.js';

export const SimulationController = {
	/**
	 * GET /simulation - Récupère la simulation de l'utilisateur connecté
	 */
	async get(request: FastifyRequest, reply: FastifyReply) {
		const { user_id_42 } = request.user;

		const simulation = await simulationRepository.get(user_id_42);

		if (!simulation) {
			return reply.code(200).send({
				simulatedProjects: [],
				simulatedSubProjects: {},
				customProjects: [],
				manualExperiences: [],
				apiExpPercentages: {},
				hasSeenTour: false,
			});
		}

		return reply.send(simulation);
	},

	/**
	 * GET /simulation/project-users/:projectId - Utilisateurs qui ont ce projet simulé
	 */
	async getProjectUsers(request: FastifyRequest, reply: FastifyReply) {
		const { projectId } = request.params as { projectId: string };
		const users = await simulationRepository.getProjectUsers(projectId);
		return reply.send(users);
	},

	/**
	 * GET /simulation/search?q=xxx - Recherche d'utilisateurs
	 */
	async searchUsers(request: FastifyRequest, reply: FastifyReply) {
		const { q } = request.query as { q?: string };
		if (!q || q.trim().length < 1) {
			return reply.send([]);
		}
		const users = await simulationRepository.searchUsers(q.trim());
		return reply.send(users);
	},

	/**
	 * GET /simulation/user/:userId42 - Simulation d'un autre utilisateur (public seulement)
	 */
	async getUserPublic(request: FastifyRequest, reply: FastifyReply) {
		const { userId42 } = request.params as { userId42: string };
		const targetId = parseInt(userId42, 10);

		if (isNaN(targetId)) {
			return reply.code(400).send({ error: 'Invalid userId42' });
		}

		const pub = await simulationRepository.isPublic(targetId);
		if (!pub) {
			return reply.code(403).send({ error: 'This profile is private' });
		}

		const simulation = await simulationRepository.get(targetId);
		if (!simulation) {
			return reply.code(200).send({
				simulatedProjects: [],
				simulatedSubProjects: {},
				customProjects: [],
				manualExperiences: [],
				apiExpPercentages: {},
				hasSeenTour: false,
			});
		}

		return reply.send(simulation);
	},

	/**
	 * GET /simulation/me/privacy - Statut privacy de l'utilisateur connecté
	 * Retourne null si l'utilisateur n'a pas encore choisi.
	 */
	async getMyPrivacy(request: FastifyRequest, reply: FastifyReply) {
		const { user_id_42, login, image_url, first_name, last_name } = request.user;

		// S'assurer que la ligne existe pour pouvoir distinguer "pas encore choisi"
		await prisma.userSimulation.upsert({
			where: { userId42: user_id_42 },
			create: {
				userId42: user_id_42,
				login,
				imageUrl: image_url ?? null,
				firstName: first_name ?? null,
				lastName: last_name ?? null,
			},
			update: {},
		});

		const isPublic = await simulationRepository.getPrivacyStatus(user_id_42);
		return reply.send({ isPublic });
	},

	/**
	 * PUT /simulation/privacy - Met à jour le statut public/privé
	 */
	async updatePrivacy(request: FastifyRequest, reply: FastifyReply) {
		const { user_id_42, login, image_url } = request.user;
		const body = request.body as { isPublic?: unknown } | undefined;

		if (!body || typeof body.isPublic !== 'boolean') {
			return reply.code(400).send({ error: 'isPublic must be a boolean' });
		}

		// S'assurer que l'entrée existe avant de modifier la privacy
		await prisma.userSimulation.upsert({
			where: { userId42: user_id_42 },
			create: { userId42: user_id_42, login, imageUrl: image_url ?? null },
			update: {},
		});

		const isPublic = await simulationRepository.updatePrivacy(user_id_42, body.isPublic);
		return reply.send({ isPublic });
	},

	/**
	 * PUT /simulation - Sauvegarde la simulation de l'utilisateur connecté
	 */
	async save(request: FastifyRequest, reply: FastifyReply) {
		const { user_id_42, login, image_url, first_name, last_name } = request.user;
		const body = request.body as any;

		if (!body || typeof body !== 'object') {
			return reply.code(400).send({ error: 'Invalid request body' });
		}

		const data = {
			simulatedProjects: Array.isArray(body.simulatedProjects) ? body.simulatedProjects : [],
			simulatedSubProjects: body.simulatedSubProjects ?? {},
			customProjects: Array.isArray(body.customProjects) ? body.customProjects : [],
			manualExperiences: Array.isArray(body.manualExperiences) ? body.manualExperiences : [],
			apiExpPercentages: body.apiExpPercentages ?? {},
			hasSeenTour: body.hasSeenTour === true,
		};

		try {
			const saved = await simulationRepository.save(user_id_42, login, image_url ?? null, data, first_name, last_name);
			return reply.send(saved);
		} catch (err: any) {
			if (err.message?.startsWith('Validation failed')) {
				return reply.code(400).send({ error: err.message });
			}
			throw err;
		}
	},

	/**
	 * PUT /simulation/tour-seen - Sauvegarde uniquement l'état du guide
	 */
	async saveTourSeen(request: FastifyRequest, reply: FastifyReply) {
		const { user_id_42, login, image_url, first_name, last_name } = request.user;
		const body = request.body as { hasSeenTour?: unknown } | undefined;

		if (!body || typeof body.hasSeenTour !== 'boolean') {
			return reply.code(400).send({ error: 'hasSeenTour must be a boolean' });
		}

		const hasSeenTour = await simulationRepository.saveTourSeen(
			user_id_42,
			login,
			image_url ?? null,
			body.hasSeenTour,
			first_name,
			last_name
		);

		return reply.send({ hasSeenTour });
	},
};
