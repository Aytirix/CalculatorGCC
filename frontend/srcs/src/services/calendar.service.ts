import { backendAuthService } from './backend-auth.service';
import { getViewUserId } from './backend-api42.service';
import { config } from '@/config/config';

const BACKEND_URL = config.backendUrl;

export interface PlacedProjectData {
	id: string;
	projectId: string;
	name: string;
	xp: number;
	startDate: string;
	endDate: string;
	row: number;
}

export interface CalendarData {
	placedProjects: PlacedProjectData[];
	dateRange: { start: string; end: string };
	alternanceDays: Record<string, string>;
}

// Une requête qui ne répond jamais (réseau mobile figé) ne doit rien bloquer :
// les enregistrements du calendrier passent par une file, un envoi pendu
// empêchait tous les suivants de partir.
const REQUEST_TIMEOUT_MS = 15_000;

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
	const jwtToken = backendAuthService.getToken();
	if (!jwtToken) throw new Error('Not authenticated');

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	const response = await fetch(`${BACKEND_URL}${endpoint}`, {
		signal: controller.signal,
		...options,
		headers: {
			Authorization: `Bearer ${jwtToken}`,
			'Content-Type': 'application/json',
			...options?.headers,
		},
	});

	clearTimeout(timer);
	if (response.status === 204) return null as T;

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}));
		throw new Error(errorData.error || response.statusText);
	}

	return response.json();
}

export const calendarService = {
	async load(): Promise<CalendarData | null> {
		const viewId = getViewUserId();
		const endpoint = viewId !== null ? `/calendar?view_user_id=${viewId}` : '/calendar';
		return request<CalendarData | null>(endpoint);
	},

	async save(data: CalendarData): Promise<void> {
		// Jamais sauvegarder quand on consulte un autre profil
		if (getViewUserId() !== null) return;
		await calendarService.saveOwn(data);
	},

	/**
	 * Enregistre le calendrier du COMPTE CONNECTÉ (le backend écrit toujours sur
	 * le compte du JWT), sans relire l'utilisateur consulté. Réservé à la page
	 * Calendrier ouverte en propriétaire : son dernier enregistrement part au
	 * démontage, or quand on ouvre le profil d'un autre, l'id consulté est déjà
	 * posé à ce moment-là — `save()` l'ignorait et la modification était perdue.
	 */
	async saveOwn(data: CalendarData): Promise<void> {
		await request<CalendarData>('/calendar', {
			method: 'PUT',
			body: JSON.stringify(data),
		});
	},
};
