import { prisma } from './connection.js';

/**
 * Instantané des données 42 d'un utilisateur, tel qu'affiché en usage normal.
 * Alimenté uniquement par un refresh explicite (jamais à chaque navigation).
 */
export interface UserData42Snapshot {
	level: number;
	projects: string[]; // noms des projets validés
	eventsCount: number;
	allProjects: any[];
	allCursus: any[];
	allEvents: any[];
}

export const userData42Repository = {
	/** Retourne l'instantané + la date du dernier fetch, ou null si jamais synchronisé. */
	async get(userId42: number): Promise<{ data: UserData42Snapshot; fetchedAt: Date } | null> {
		const row = await prisma.userData42.findUnique({ where: { userId42 } });
		if (!row) return null;
		return {
			data: {
				level: row.level,
				eventsCount: row.eventsCount,
				projects: (row.projects as string[] | null) ?? [],
				allProjects: (row.allProjects as any[] | null) ?? [],
				allCursus: (row.allCursus as any[] | null) ?? [],
				allEvents: (row.allEvents as any[] | null) ?? [],
			},
			fetchedAt: row.fetchedAt,
		};
	},

	/** Date du dernier fetch réussi (base du cooldown), ou null si jamais synchronisé. */
	async getFetchedAt(userId42: number): Promise<Date | null> {
		const row = await prisma.userData42.findUnique({
			where: { userId42 },
			select: { fetchedAt: true },
		});
		return row?.fetchedAt ?? null;
	},

	/** Écrit/écrase l'instantané et remet `fetchedAt` à maintenant. */
	async upsert(userId42: number, data: UserData42Snapshot): Promise<void> {
		const now = new Date();
		const payload = {
			level: data.level,
			eventsCount: data.eventsCount,
			projects: data.projects as any,
			allProjects: data.allProjects as any,
			allCursus: data.allCursus as any,
			allEvents: data.allEvents as any,
			fetchedAt: now,
		};
		await prisma.userData42.upsert({
			where: { userId42 },
			create: { userId42, ...payload },
			update: payload,
		});
	},
};
