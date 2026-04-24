import { backendAuthService } from './backend-auth.service';
import { config } from '@/config/config';

const BACKEND_URL = config.backendUrl;

// ID de l'utilisateur consulté (mode lecture seule), null = profil propre
let _viewSimUserId: number | null = null;

export function setSimulationViewUserId(id: number | null) {
  _viewSimUserId = id;
}

export function isReadOnlyMode(): boolean {
  return _viewSimUserId !== null;
}

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

export interface UserSearchResult {
	userId42: number;
	login: string;
	firstName: string | null;
	lastName: string | null;
	imageUrl: string | null;
	isPublic: boolean;
}

export const simulationService = {
	/**
	 * Charge la simulation depuis le backend (redirige vers l'user consulté si en mode lecture)
	 */
	async load(): Promise<SimulationData> {
		if (_viewSimUserId !== null) {
			return request<SimulationData>(`/simulation/user/${_viewSimUserId}`);
		}
		return request<SimulationData>('/simulation');
	},

	/**
	 * Charge la simulation d'un autre utilisateur (public seulement)
	 */
	async loadUser(userId42: number): Promise<SimulationData> {
		return request<SimulationData>(`/simulation/user/${userId42}`);
	},

	/**
	 * Recherche des utilisateurs par login/prénom/nom
	 */
	async searchUsers(query: string): Promise<UserSearchResult[]> {
		return request<UserSearchResult[]>(`/simulation/search?q=${encodeURIComponent(query)}`);
	},

	/**
	 * Met à jour le statut public/privé du profil
	 */
	async updatePrivacy(isPublic: boolean): Promise<{ isPublic: boolean }> {
		return request<{ isPublic: boolean }>('/simulation/privacy', {
			method: 'PUT',
			body: JSON.stringify({ isPublic }),
		});
	},

	/**
	 * Sauvegarde la simulation vers le backend (bloqué en mode lecture seule)
	 */
	async save(data: SimulationData): Promise<SimulationData> {
		if (_viewSimUserId !== null) {
			// Ne jamais modifier les données d'un autre utilisateur
			return data;
		}
		return request<SimulationData>('/simulation', {
			method: 'PUT',
			body: JSON.stringify(data),
		});
	},

	/**
	 * Sauvegarde uniquement l'état "guide vu"
	 */
	async saveTourSeen(hasSeenTour: boolean): Promise<{ hasSeenTour: boolean }> {
		return request<{ hasSeenTour: boolean }>('/simulation/tour-seen', {
			method: 'PUT',
			body: JSON.stringify({ hasSeenTour }),
		});
	},

	/**
	 * Récupère les utilisateurs qui ont simulé un projet donné
	 */
	async getProjectUsers(projectId: string): Promise<{ login: string; userId42: number; imageUrl: string | null }[]> {
		return request<{ login: string; userId42: number; imageUrl: string | null }[]>(`/simulation/project-users/${encodeURIComponent(projectId)}`);
	},
};
