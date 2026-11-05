import { backendAuthService } from './backend-auth.service';
import { config } from '@/config/config';
// `import type` : effacé à la compilation, donc aucun cycle à l'exécution même si
// la page importe ce service en retour.
import type { ProfessionalExperience } from '@/types/professionalExperience.types';

const BACKEND_URL = config.backendUrl;

// ID de l'utilisateur consulté (mode lecture seule), null = profil propre
let _viewSimUserId: number | null = null;

// Enregistrements en attente à envoyer AVANT de passer sur le profil d'un autre :
// une fois en consultation, `save()` n'écrit plus rien — une modification faite
// juste avant Ctrl+K était perdue.
const beforeViewSwitch = new Set<() => void>();

/** Appelé juste avant de changer de profil consulté. Renvoie de quoi se désinscrire. */
export function onBeforeViewSwitch(fn: () => void): () => void {
  beforeViewSwitch.add(fn);
  return () => { beforeViewSwitch.delete(fn); };
}

export function setSimulationViewUserId(id: number | null) {
  if (id !== _viewSimUserId) {
    for (const fn of [...beforeViewSwitch]) fn();
  }
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
	/**
	 * Facultatif : les expériences ont leur propre route (`saveManualExperiences`).
	 * Les omettre ici est le comportement NORMAL depuis qu'un second écrivain sur
	 * le même champ effaçait les écritures de l'autre. Le serveur laisse alors la
	 * colonne intacte. Toujours renvoyé par `load()`.
	 */
	manualExperiences?: unknown[];
	/** Absent à l'enregistrement : le serveur garde sa valeur. */
	apiExpPercentages?: Record<string, number>;
	/** Absent à l'enregistrement : le serveur garde sa valeur. */
	hasSeenTour?: boolean;
	/**
	 * Étapes du guide déjà vues. Renvoyé par le serveur au chargement ; la
	 * sauvegarde générale ne le porte pas (il a son propre point d'entrée).
	 */
	seenTourSteps?: string[];
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

/** Une personne ayant simulé un projet (recherche de teammates). */
export interface SimulatedProjectUser {
	login: string;
	userId42: number;
	imageUrl: string | null;
	/** Date à laquelle elle a ajouté le projet à sa simulation (ISO). */
	simulatedAt: string;
	/** Elle a déjà une équipe (complète ou non). */
	hasTeam: boolean;
	/** Nombre de personnes déjà dans son groupe (null si non renseigné). */
	teamSize: number | null;
}

export interface UserSearchResult {
	userId42: number;
	login: string;
	firstName: string | null;
	lastName: string | null;
	imageUrl: string | null;
	isPublic: boolean | null;
}

// Dernier enregistrement envoyé : une lecture de SA simulation l'attend. Sans
// ça, quitter Mes projets juste après une modification (l'enregistrement part
// à la fermeture) puis ouvrir le Dashboard lisait la base AVANT l'écriture —
// et le Dashboard renvoyait ensuite cette version périmée : modification perdue.
let pendingSave: Promise<unknown> = Promise.resolve();
export const PENDING_SAVE_MAX_WAIT_MS = 4000;

export const simulationService = {
	/**
	 * Charge la simulation depuis le backend (redirige vers l'user consulté si en mode lecture)
	 */
	async load(): Promise<SimulationData> {
		if (_viewSimUserId !== null) {
			return request<SimulationData>(`/simulation/user/${_viewSimUserId}`);
		}
		// Attente bornée : un enregistrement bloqué ne doit pas figer la page. Un
		// enregistrement sain prend moins d'une seconde.
		let timer: ReturnType<typeof setTimeout> | undefined;
		await Promise.race([
			pendingSave,
			new Promise(resolve => { timer = setTimeout(resolve, PENDING_SAVE_MAX_WAIT_MS); }),
		]);
		clearTimeout(timer);
		return request<SimulationData>('/simulation');
	},

	/**
	 * Charge la simulation d'un autre utilisateur (public seulement)
	 */
	async loadUser(userId42: number): Promise<SimulationData> {
		return request<SimulationData>(`/simulation/user/${userId42}`);
	},

	/**
	 * Logins des délégués 42 à contacter au sujet du référentiel. Vide si
	 * personne n'est déclaré dans le panneau d'administration.
	 */
	async getReferentialContacts(): Promise<string[]> {
		const { contacts } = await request<{ contacts: string[] }>('/simulation/referential-contacts');
		return contacts;
	},

	/**
	 * Recherche des utilisateurs par login/prénom/nom
	 */
	async searchUsers(query: string): Promise<UserSearchResult[]> {
		return request<UserSearchResult[]>(`/simulation/search?q=${encodeURIComponent(query)}`);
	},

	/**
	 * Récupère le statut privacy de l'utilisateur connecté (null = pas encore choisi)
	 */
	async getMyPrivacy(): Promise<{ isPublic: boolean | null }> {
		return request<{ isPublic: boolean | null }>('/simulation/me/privacy');
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
		const saving = request<SimulationData>('/simulation', {
			method: 'PUT',
			body: JSON.stringify(data),
		});
		// Une erreur d'enregistrement ne doit pas bloquer les lectures suivantes.
		pendingSave = saving.catch(() => undefined);
		return saving;
	},

	/**
	 * Sauvegarde UNIQUEMENT les expériences professionnelles saisies à la main.
	 *
	 * Route dédiée, et surtout pas `save()` : celle-ci remplace la simulation
	 * entière et vide tout champ absent. La page « Expérience professionnelle » ne
	 * connaît ni les projets simulés ni les pourcentages — l'appeler d'ici aurait
	 * effacé tout le reste.
	 *
	 * Même garde que `save()` : on n'écrit jamais en consultant le profil d'un
	 * autre. Sans elle, éditer une expérience en lecture seule écrirait dans SES
	 * données.
	 */
	async saveManualExperiences(
		manualExperiences: ProfessionalExperience[]
	): Promise<ProfessionalExperience[]> {
		if (_viewSimUserId !== null) return manualExperiences;
		const reponse = await request<{ manualExperiences: ProfessionalExperience[] }>(
			'/simulation/manual-experiences',
			{ method: 'PUT', body: JSON.stringify({ manualExperiences }) }
		);
		return reponse.manualExperiences;
	},

	/**
	 * Sauvegarde uniquement l'état "guide vu"
	 */
	/**
	 * `seenSteps` : identifiants des étapes du guide déjà vues. Les mémoriser
	 * permet de ne proposer que celles ajoutées depuis le dernier passage, au
	 * lieu de tout rejouer ou de ne plus rien montrer.
	 */
	async saveTourSeen(
		hasSeenTour: boolean,
		seenSteps?: string[]
	): Promise<{ hasSeenTour: boolean }> {
		return request<{ hasSeenTour: boolean }>('/simulation/tour-seen', {
			method: 'PUT',
			body: JSON.stringify({ hasSeenTour, ...(seenSteps ? { seenSteps } : {}) }),
		});
	},

	/**
	 * Récupère les utilisateurs qui ont simulé un projet donné
	 */
	async getProjectUsers(projectId: string): Promise<SimulatedProjectUser[]> {
		return request<SimulatedProjectUser[]>(`/simulation/project-users/${encodeURIComponent(projectId)}`);
	},

	/**
	 * Déclare l'état de son équipe sur un projet simulé : « j'ai ma team », et
	 * combien de personnes en font déjà partie.
	 * Renvoie false si le projet n'est pas dans MA simulation (409 côté serveur).
	 */
	async setProjectTeam(projectId: string, hasTeam: boolean, teamSize: number | null): Promise<boolean> {
		try {
			await request<{ projectId: string; hasTeam: boolean; teamSize: number | null }>(
				`/simulation/project-team/${encodeURIComponent(projectId)}`,
				{ method: 'PUT', body: JSON.stringify({ hasTeam, teamSize }) }
			);
			return true;
		} catch {
			return false;
		}
	},

	/**
	 * Version du dernier changelog acquitté par l'utilisateur (null = jamais vu).
	 */
	async getChangelogSeen(): Promise<{ lastSeenChangelog: string | null }> {
		return request<{ lastSeenChangelog: string | null }>('/simulation/changelog-seen');
	},

	/**
	 * Marque une version de changelog comme vue (stocké côté serveur, cross-device).
	 */
	async saveChangelogSeen(version: string): Promise<{ lastSeenChangelog: string | null }> {
		return request<{ lastSeenChangelog: string | null }>('/simulation/changelog-seen', {
			method: 'PUT',
			body: JSON.stringify({ version }),
		});
	},

	/**
	 * « Ne plus me le rappeler » sur le bandeau d'installation de l'application
	 * (stocké côté serveur : vaut pour tous les appareils du compte).
	 */
	async getInstallPromptDismissed(): Promise<{ dismissed: boolean }> {
		return request<{ dismissed: boolean }>('/simulation/install-prompt');
	},

	async saveInstallPromptDismissed(dismissed: boolean): Promise<{ dismissed: boolean }> {
		return request<{ dismissed: boolean }>('/simulation/install-prompt', {
			method: 'PUT',
			body: JSON.stringify({ dismissed }),
		});
	},
};
