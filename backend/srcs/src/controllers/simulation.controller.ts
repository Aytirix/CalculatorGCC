import { FastifyRequest, FastifyReply } from 'fastify';
import { simulationRepository } from '../db/simulationRepository.js';

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
	 * PUT /simulation - Sauvegarde la simulation de l'utilisateur connecté
	 */
	async save(request: FastifyRequest, reply: FastifyReply) {
		const { user_id_42, login } = request.user;
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
		};

		try {
			const saved = await simulationRepository.save(user_id_42, login, data);
			return reply.send(saved);
		} catch (err: any) {
			if (err.message?.startsWith('Validation failed')) {
				return reply.code(400).send({ error: err.message });
			}
			throw err;
		}
	},
};
