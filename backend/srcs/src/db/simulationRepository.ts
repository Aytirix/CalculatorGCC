import { prisma } from './connection.js';
import type { Prisma } from '@prisma/client';
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
	hasSeenTour: boolean;
}

function coerceBooleanFlag(value: unknown): boolean {
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value !== 0;
	if (typeof value === 'bigint') return value !== 0n;
	if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true';
	return false;
}

async function getTourSeenFlag(userId42: number): Promise<boolean> {
	const rows = await prisma.$queryRaw<Array<{ hasSeenTour: unknown }>>`
		SELECT hasSeenTour
		FROM user_simulation
		WHERE userId42 = ${userId42}
		LIMIT 1
	`;

	return coerceBooleanFlag(rows[0]?.hasSeenTour);
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

export interface UserSearchResult {
	userId42: number;
	login: string;
	firstName: string | null;
	lastName: string | null;
	imageUrl: string | null;
	isPublic: boolean;
}

export const simulationRepository = {
	/**
	 * Recherche des utilisateurs par login, prénom ou nom
	 */
	async searchUsers(query: string): Promise<UserSearchResult[]> {
		const q = `%${query}%`;
		const rows = await prisma.$queryRaw<UserSearchResult[]>`
			SELECT userId42, login, firstName, lastName, imageUrl, isPublic
			FROM user_simulation
			WHERE login LIKE ${q}
			   OR firstName LIKE ${q}
			   OR lastName LIKE ${q}
			ORDER BY login ASC
			LIMIT 20
		`;
		return rows.map((r) => ({ ...r, isPublic: Boolean(r.isPublic) }));
	},

	/**
	 * Met à jour le statut public/privé d'un utilisateur
	 */
	async updatePrivacy(userId42: number, isPublic: boolean): Promise<boolean> {
		await prisma.$executeRaw`
			UPDATE user_simulation
			SET isPublic = ${isPublic ? 1 : 0}
			WHERE userId42 = ${userId42}
		`;
		return isPublic;
	},

	/**
	 * Vérifie si un utilisateur est public
	 */
	async isPublic(userId42: number): Promise<boolean> {
		const rows = await prisma.$queryRaw<Array<{ isPublic: unknown }>>`
			SELECT isPublic FROM user_simulation WHERE userId42 = ${userId42} LIMIT 1
		`;
		if (!rows[0]) return false;
		return coerceBooleanFlag(rows[0].isPublic);
	},

	/**
	 * Retourne les utilisateurs qui ont simulé un projet donné
	 */
	async getProjectUsers(projectId: string): Promise<{ login: string; userId42: number; imageUrl: string | null }[]> {
		const rows = await prisma.simulatedProject.findMany({
			where: { projectId },
			include: { userSimulation: { select: { login: true, userId42: true, imageUrl: true } } },
		});
		return rows.map((r) => ({ login: r.userSimulation.login, userId42: r.userSimulation.userId42, imageUrl: r.userSimulation.imageUrl }));
	},

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
			hasSeenTour: await getTourSeenFlag(userId42),
		};
	},

	/**
	 * Sauvegarde la simulation d'un utilisateur (upsert)
	 */
	async save(userId42: number, login: string, imageUrl: string | null, data: SimulationData, firstName?: string | null, lastName?: string | null): Promise<SimulationData> {
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
				imageUrl,
				firstName: firstName ?? null,
				lastName: lastName ?? null,
				simulatedSubProjects: data.simulatedSubProjects as Prisma.InputJsonValue,
				customProjects: data.customProjects as Prisma.InputJsonValue,
				manualExperiences: data.manualExperiences as Prisma.InputJsonValue,
				apiExpPercentages: data.apiExpPercentages as Prisma.InputJsonValue,
			},
			update: {
				login,
				imageUrl,
				...(firstName !== undefined && { firstName }),
				...(lastName !== undefined && { lastName }),
				simulatedSubProjects: data.simulatedSubProjects as Prisma.InputJsonValue,
				customProjects: data.customProjects as Prisma.InputJsonValue,
				manualExperiences: data.manualExperiences as Prisma.InputJsonValue,
				apiExpPercentages: data.apiExpPercentages as Prisma.InputJsonValue,
			},
		});

		await prisma.$executeRaw`
			UPDATE user_simulation
			SET hasSeenTour = ${data.hasSeenTour ? 1 : 0}
			WHERE userId42 = ${userId42}
		`;

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

	/**
	 * Met à jour uniquement l'état "guide vu" de l'utilisateur.
	 */
	async saveTourSeen(userId42: number, login: string, imageUrl: string | null, hasSeenTour: boolean, firstName?: string | null, lastName?: string | null): Promise<boolean> {
		await prisma.userSimulation.upsert({
			where: { userId42 },
			create: {
				userId42,
				login,
				imageUrl,
				firstName: firstName ?? null,
				lastName: lastName ?? null,
			},
			update: {
				login,
				imageUrl,
				...(firstName !== undefined && { firstName }),
				...(lastName !== undefined && { lastName }),
			},
		});

		await prisma.$executeRaw`
			UPDATE user_simulation
			SET hasSeenTour = ${hasSeenTour ? 1 : 0}
			WHERE userId42 = ${userId42}
		`;

		return hasSeenTour;
	},
};
