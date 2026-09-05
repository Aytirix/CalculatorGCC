import { prisma } from '../db/connection.js';
import { API42Service } from './api42.service.js';
import { rncpService } from './rncp.service.js';

/**
 * Statistiques d'usage de l'application, VOLONTAIREMENT anonymes.
 *
 * Rien de nominatif n'en sort : que des compteurs et des répartitions. Les
 * projets personnalisés sont exclus des classements, leur nom étant saisi par
 * l'utilisateur et potentiellement identifiant.
 *
 * Aucune requête vers l'API 42 : tout vient de notre base.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PeriodCounts {
	day: number;
	week: number;
	month: number;
	year: number;
}

export interface AppStats {
	users: {
		total: number;
		/** Ont au moins une synchro 42 réussie. */
		withData: number;
		/** Ont rendu leur profil public. */
		publicProfiles: number;
		/** Inscriptions sur la période. */
		joined: PeriodCounts;
		/** Passages dans l'application sur la période. */
		active: PeriodCounts;
	};
	simulation: {
		/** Personnes ayant au moins un projet simulé. */
		usersSimulating: number;
		/** Nombre total de projets simulés, toutes personnes confondues. */
		projectsSimulated: number;
		/** Personnes ayant déclaré avoir une équipe sur au moins un projet. */
		usersWithTeam: number;
		topProjects: { projectId: string; name: string; count: number }[];
	};
	/** Répartition des niveaux, par tranche — jamais un niveau individuel. */
	levels: { label: string; users: number }[];
	sync: {
		/** Instantanés 42 rafraîchis sur la période. */
		refreshed: PeriodCounts;
	};
	generatedAt: string;
}

/** Bornes des périodes, calculées une fois. */
function periodStarts(now: number) {
	return {
		day: new Date(now - DAY_MS),
		week: new Date(now - 7 * DAY_MS),
		month: new Date(now - 30 * DAY_MS),
		year: new Date(now - 365 * DAY_MS),
	};
}

async function countByPeriod(
	starts: ReturnType<typeof periodStarts>,
	count: (since: Date) => Promise<number>
): Promise<PeriodCounts> {
	const [day, week, month, year] = await Promise.all([
		count(starts.day),
		count(starts.week),
		count(starts.month),
		count(starts.year),
	]);
	return { day, week, month, year };
}

/** Tranches de niveau : assez larges pour ne désigner personne. */
const LEVEL_BUCKETS: { label: string; min: number; max: number }[] = [
	{ label: '0 – 5', min: 0, max: 5 },
	{ label: '5 – 10', min: 5, max: 10 },
	{ label: '10 – 15', min: 10, max: 15 },
	{ label: '15 – 20', min: 15, max: 20 },
	{ label: '20 et +', min: 20, max: Infinity },
];

export const statsService = {
	async build(): Promise<AppStats> {
		const now = Date.now();
		const starts = periodStarts(now);

		const [
			total,
			withData,
			publicProfiles,
			joined,
			active,
			refreshed,
			usersSimulating,
			projectsSimulated,
			usersWithTeam,
			topRaw,
			levels,
		] = await Promise.all([
			prisma.userSimulation.count(),
			prisma.userData42.count(),
			prisma.userSimulation.count({ where: { isPublic: true } }),
			countByPeriod(starts, (since) =>
				prisma.userSimulation.count({ where: { createdAt: { gte: since } } })
			),
			countByPeriod(starts, (since) =>
				prisma.userSimulation.count({ where: { lastSeenAt: { gte: since } } })
			),
			countByPeriod(starts, (since) =>
				prisma.userData42.count({ where: { fetchedAt: { gte: since } } })
			),
			prisma.simulatedProject
				.findMany({ select: { userId42: true }, distinct: ['userId42'] })
				.then((rows) => rows.length),
			prisma.simulatedProject.count(),
			prisma.simulatedProject
				.findMany({ where: { hasTeam: true }, select: { userId42: true }, distinct: ['userId42'] })
				.then((rows) => rows.length),
			prisma.simulatedProject.groupBy({
				by: ['projectId'],
				_count: { projectId: true },
				orderBy: { _count: { projectId: 'desc' } },
				take: 40,
			}),
			prisma.userData42.findMany({ select: { level: true } }),
		]);

		return {
			users: { total, withData, publicProfiles, joined, active },
			simulation: {
				usersSimulating,
				projectsSimulated,
				usersWithTeam,
				topProjects: await this.resolveTopProjects(topRaw),
			},
			levels: LEVEL_BUCKETS.map((bucket) => ({
				label: bucket.label,
				users: levels.filter((row) => row.level >= bucket.min && row.level < bucket.max).length,
			})),
			sync: { refreshed },
			generatedAt: new Date().toISOString(),
		};
	},

	/**
	 * Donne un nom lisible aux projets du classement.
	 *
	 * Les projets personnalisés (`custom-…`) sont écartés : leur nom est saisi
	 * par l'utilisateur, il n'a rien à faire dans une statistique publique.
	 */
	async resolveTopProjects(
		rows: { projectId: string; _count: { projectId: number } }[]
	): Promise<{ projectId: string; name: string; count: number }[]> {
		const rncp = await rncpService.build();
		const nameById = new Map<string, string>();
		for (const entry of rncp ?? []) {
			for (const category of entry.categories) {
				for (const project of category.projects) nameById.set(project.id, project.name);
			}
		}

		const catalog = API42Service.getCursusProjectsCached(21) ?? [];
		const nameBy42Id = new Map<number, string>(catalog.map((p) => [p.id, p.name.trim()]));

		const out: { projectId: string; name: string; count: number }[] = [];
		for (const row of rows) {
			if (row.projectId.startsWith('custom-')) continue;

			const graphMatch = /^42-(\d+)$/.exec(row.projectId);
			const name = graphMatch
				? nameBy42Id.get(Number(graphMatch[1]))
				: nameById.get(row.projectId);
			if (!name) continue;

			out.push({ projectId: row.projectId, name, count: row._count.projectId });
			if (out.length >= 12) break;
		}
		return out;
	},
};

// ---------------------------------------------------------------------------
// Présence : « cette personne est passée aujourd'hui »
//
// Écrire en base à chaque requête authentifiée serait absurde (plusieurs appels
// par page). On ne rafraîchit donc `lastSeenAt` qu'une fois par heure et par
// utilisateur, la fenêtre étant mémorisée en RAM.
// ---------------------------------------------------------------------------

const PRESENCE_THROTTLE_MS = 60 * 60 * 1000;
const lastTouched = new Map<number, number>();

export function touchPresence(userId42: number): void {
	const now = Date.now();
	const previous = lastTouched.get(userId42);
	if (previous !== undefined && now - previous < PRESENCE_THROTTLE_MS) return;
	lastTouched.set(userId42, now);

	// Jamais attendu par la requête en cours : une statistique ne doit pas
	// ralentir l'application, ni la faire échouer si l'écriture rate.
	prisma.userSimulation
		.updateMany({ where: { userId42 }, data: { lastSeenAt: new Date(now) } })
		.catch(() => {
			// L'utilisateur n'a peut-être pas encore de ligne : on réessaiera à
			// la prochaine fenêtre.
			lastTouched.delete(userId42);
		});
}
