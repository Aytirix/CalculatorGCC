import { backendAuthService } from './backend-auth.service';
import { config } from '@/config/config';

const BACKEND_URL = config.backendUrl;

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

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
	const jwtToken = backendAuthService.getToken();

	if (!jwtToken) {
		throw new Error('No authentication token available. Please login first.');
	}

	const response = await fetch(`${BACKEND_URL}${endpoint}`, {
		...options,
		headers: {
			Authorization: `Bearer ${jwtToken}`,
			'Content-Type': 'application/json',
			...options?.headers,
		},
	});

	if (!response.ok) {
		if (response.status === 401) {
			await backendAuthService.logout();
			window.location.href = '/';
			throw new Error('Session expired. Please login again.');
		}
		const errorData = await response.json().catch(() => ({}));
		throw new Error(errorData.error || errorData.message || response.statusText);
	}

	return response.json();
}

export const simulationService = {
	/**
	 * Charge la simulation depuis le backend
	 */
	async load(): Promise<SimulationData> {
		return request<SimulationData>('/simulation');
	},

	/**
	 * Sauvegarde la simulation vers le backend
	 */
	async save(data: SimulationData): Promise<SimulationData> {
		return request<SimulationData>('/simulation', {
			method: 'PUT',
			body: JSON.stringify(data),
		});
	},

	/**
	 * Récupère les utilisateurs qui ont simulé un projet donné
	 */
	async getProjectUsers(projectId: string): Promise<{ login: string; userId42: number; imageUrl: string | null }[]> {
		return request<{ login: string; userId42: number; imageUrl: string | null }[]>(`/simulation/project-users/${encodeURIComponent(projectId)}`);
	},
};
