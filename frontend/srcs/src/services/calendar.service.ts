import { backendAuthService } from './backend-auth.service';
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

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
	const jwtToken = backendAuthService.getToken();
	if (!jwtToken) throw new Error('Not authenticated');

	const response = await fetch(`${BACKEND_URL}${endpoint}`, {
		...options,
		headers: {
			Authorization: `Bearer ${jwtToken}`,
			'Content-Type': 'application/json',
			...options?.headers,
		},
	});

	if (response.status === 204) return null as T;

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}));
		throw new Error(errorData.error || response.statusText);
	}

	return response.json();
}

export const calendarService = {
	async load(): Promise<CalendarData | null> {
		return request<CalendarData | null>('/calendar');
	},

	async save(data: CalendarData): Promise<void> {
		await request<CalendarData>('/calendar', {
			method: 'PUT',
			body: JSON.stringify(data),
		});
	},
};
