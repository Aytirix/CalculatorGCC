import { prisma } from './connection.js';
import { isValidProjectId, isValidSubProjectId } from '../data/validProjects.js';

export interface SimulatedProjectData {
	projectId: string;
	percentage: number;
	coalitionBoost: boolean;
	note?: string;
}

export interface SimulationData {
	simulatedProjects: SimulatedProjectData[];
	simulatedSubProjects: Record<string, string[]>;
	customProjects: unknown[];
	manualExperiences: unknown[];
	apiExpPercentages: Record<string, number>;
}

/**
 * Valide les données de simulation avant sauvegarde
 */
function validateSimulationData(data: SimulationData): string[] {
	const errors: string[] = [];

	// Valider les projets simulés
	for (const p of data.simulatedProjects) {
		if (!isValidProjectId(p.projectId)) {
			errors.push(`Invalid project ID: ${p.projectId}`);
		}
		if (typeof p.percentage !== 'number' || p.percentage < 0 || p.percentage > 125) {
			errors.push(`Invalid percentage for ${p.projectId}: ${p.percentage}`);
		}
	}

	// Valider les sous-projets simulés
	for (const [parentId, subIds] of Object.entries(data.simulatedSubProjects)) {
		if (!isValidProjectId(parentId)) {
			errors.push(`Invalid parent project ID in subProjects: ${parentId}`);
		}
		for (const subId of subIds) {
			if (!isValidSubProjectId(subId)) {
				errors.push(`Invalid sub-project ID: ${subId}`);
			}
		}
	}

	return errors;
}

export const simulationRepository = {
	/**
	 * Récupère la simulation d'un utilisateur
	 */
	async get(userId42: number): Promise<SimulationData | null> {
		const userSim = await prisma.userSimulation.findUnique({
			where: { userId42 },
			include: { simulatedProjects: true },
		});

		if (!userSim) return null;

		return {
			simulatedProjects: userSim.simulatedProjects.map((p) => ({
				projectId: p.projectId,
				percentage: p.percentage,
				coalitionBoost: p.coalitionBoost,
				note: p.note ?? undefined,
			})),
			simulatedSubProjects: (userSim.simulatedSubProjects as Record<string, string[]>) ?? {},
			customProjects: (userSim.customProjects as unknown[]) ?? [],
			manualExperiences: (userSim.manualExperiences as unknown[]) ?? [],
			apiExpPercentages: (userSim.apiExpPercentages as Record<string, number>) ?? {},
		};
	},

	/**
	 * Sauvegarde la simulation d'un utilisateur (upsert)
	 */
	async save(userId42: number, login: string, data: SimulationData): Promise<SimulationData> {
		const errors = validateSimulationData(data);
		if (errors.length > 0) {
			throw new Error(`Validation failed: ${errors.join(', ')}`);
		}

		// Upsert user_simulation
		await prisma.userSimulation.upsert({
			where: { userId42 },
			create: {
				userId42,
				login,
				simulatedSubProjects: data.simulatedSubProjects,
				customProjects: data.customProjects,
				manualExperiences: data.manualExperiences,
				apiExpPercentages: data.apiExpPercentages,
			},
			update: {
				login,
				simulatedSubProjects: data.simulatedSubProjects,
				customProjects: data.customProjects,
				manualExperiences: data.manualExperiences,
				apiExpPercentages: data.apiExpPercentages,
			},
		});

		// Supprimer les anciens projets simulés et insérer les nouveaux
		await prisma.simulatedProject.deleteMany({ where: { userId42 } });

		if (data.simulatedProjects.length > 0) {
			await prisma.simulatedProject.createMany({
				data: data.simulatedProjects.map((p) => ({
					userId42,
					projectId: p.projectId,
					percentage: p.percentage,
					coalitionBoost: p.coalitionBoost,
					note: p.note ?? null,
				})),
			});
		}

		return data;
	},
};
