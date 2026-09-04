import { prisma } from '../db/connection.js';
import { api42CacheRepository } from '../db/api42CacheRepository.js';
import { rncpService } from './rncp.service.js';
import { API42Service, refreshJobManager } from './api42.service.js';

/**
 * Refresh GLOBAL, déclenché manuellement par l'admin.
 *
 * Renouvelle les données de référence partagées (layout officiel du Holy Graph
 * et catalogues de cursus) puis remet en file l'instantané 42 de CHAQUE
 * utilisateur. Tout passe par la file existante (`refreshJobManager`) et par le
 * rate limiter : les requêtes partent au compte-gouttes, dans le respect des
 * limites de l'API 42, même si l'opération met longtemps.
 *
 * Un seul refresh global à la fois : l'état est en base pour que l'interface
 * puisse désactiver le bouton et afficher la dernière exécution.
 */

const STATE_ID = 1;

export interface GlobalRefreshState {
	running: boolean;
	startedAt: string | null;
	finishedAt: string | null;
	startedBy: string | null;
	usersTotal: number;
	usersDone: number;
	lastError: string | null;
	/** Dates de remplissage du cache de référence, pour l'affichage. */
	cacheEntries: { key: string; fetchedAt: string }[];
}

async function readRow() {
	return prisma.globalRefresh.upsert({
		where: { id: STATE_ID },
		create: { id: STATE_ID },
		update: {},
	});
}

export const globalRefreshService = {
	async getState(): Promise<GlobalRefreshState> {
		const row = await readRow();
		const entries = await api42CacheRepository.listEntries();
		return {
			running: row.startedAt != null && row.finishedAt == null,
			startedAt: row.startedAt?.toISOString() ?? null,
			finishedAt: row.finishedAt?.toISOString() ?? null,
			startedBy: row.startedBy,
			usersTotal: row.usersTotal,
			usersDone: row.usersDone,
			lastError: row.lastError,
			cacheEntries: entries.map((e) => ({ key: e.key, fetchedAt: e.fetchedAt.toISOString() })),
		};
	},

	/**
	 * Lance le refresh global. Renvoie `false` si un est déjà en cours (le
	 * bouton doit rester désactivé tant que celui-là n'est pas terminé).
	 */
	async start(actor: string): Promise<boolean> {
		const row = await readRow();
		if (row.startedAt != null && row.finishedAt == null) return false;

		await prisma.globalRefresh.update({
			where: { id: STATE_ID },
			data: {
				startedAt: new Date(),
				finishedAt: null,
				startedBy: actor,
				usersDone: 0,
				usersTotal: 0,
				lastError: null,
			},
		});

		void this.run();
		return true;
	},

	/** Déroulé du refresh, en tâche de fond (jamais attendu par la requête HTTP). */
	async run(): Promise<void> {
		try {
			// 1) Données de référence : on vide le cache (mémoire + base) puis on
			//    relance leur récupération, qui repasse par le rate limiter.
			await api42CacheRepository.invalidateAll();
			rncpService.clearCache();
			API42Service.clearReferenceCaches();
			API42Service.ensureProjectDataFetching();

			// 1 bis) Rattrapage du campus pour les comptes qui ne se sont pas
			//        reconnectés depuis que l'information est relevée à la connexion.
			await API42Service.backfillMissingCampuses();

			// 2) Chaque utilisateur connu est remis en file. `refreshJobManager`
			//    traite un utilisateur à la fois : aucun pic de requêtes.
			const users = await prisma.userData42.findMany({ select: { userId42: true } });
			await prisma.globalRefresh.update({
				where: { id: STATE_ID },
				data: { usersTotal: users.length },
			});

			for (const { userId42 } of users) {
				refreshJobManager.enqueue(userId42);
			}

			// 3) On suit l'avancement de la file pour renseigner la progression.
			await this.waitForQueue(users.map((u) => u.userId42));

			await prisma.globalRefresh.update({
				where: { id: STATE_ID },
				data: { finishedAt: new Date(), usersDone: users.length },
			});
			console.log(`[GlobalRefresh] Terminé : ${users.length} utilisateurs rafraîchis`);
		} catch (error: any) {
			console.error('[GlobalRefresh] Échec :', error?.message || error);
			await prisma.globalRefresh.update({
				where: { id: STATE_ID },
				data: { finishedAt: new Date(), lastError: String(error?.message || error).slice(0, 500) },
			});
		}
	},

	/** Attend que la file ait traité tous les utilisateurs enfilés. */
	async waitForQueue(userIds: number[]): Promise<void> {
		const POLL_MS = 2_000;
		// Garde-fou : une file bloquée ne doit pas laisser l'état « en cours »
		// éternellement (le bouton resterait désactivé pour toujours).
		const DEADLINE = Date.now() + 6 * 60 * 60 * 1000;

		while (Date.now() < DEADLINE) {
			const remaining = userIds.filter((id) => refreshJobManager.has(id)).length;
			const done = userIds.length - remaining;
			await prisma.globalRefresh.update({ where: { id: STATE_ID }, data: { usersDone: done } });
			if (remaining === 0) return;
			await new Promise((r) => setTimeout(r, POLL_MS));
		}

		throw new Error('File de refresh toujours occupée après 6h — abandon du suivi');
	},
};
