import { prisma } from './connection.js';
import type { Prisma } from '@prisma/client';
import { isValidProjectId, isValidSubProjectId } from '../data/validProjects.js';
import { toCurrentProjectId } from '../data/legacyProjectIds.js';

export interface SimulatedProjectData {
	projectId: string;
	percentage: number;
	coalitionBoost: boolean;
	note?: string;
}

/** Une personne ayant simulé un projet, telle qu'affichée dans la recherche de teammates. */
export interface SimulatedProjectUser {
	login: string;
	userId42: number;
	imageUrl: string | null;
	simulatedAt: string;
	hasTeam: boolean;
	/** Nombre de personnes déjà dans le groupe (null si non renseigné). */
	teamSize: number | null;
}

export interface SimulationData {
	simulatedProjects: SimulatedProjectData[];
	simulatedSubProjects: Record<string, string[]>;
	customProjects: unknown[];
	/**
	 * `undefined` = « ne touche pas à cette colonne ».
	 *
	 * Elle valait toujours un tableau, et la remettre à `[]` quand le client ne
	 * l'envoyait pas effaçait les expériences. Depuis qu'elles ont leur route
	 * dédiée, le Dashboard ne les transporte plus ici — sans cette distinction,
	 * chaque sauvegarde générale les aurait supprimées.
	 */
	manualExperiences?: unknown[];
	apiExpPercentages: Record<string, number>;
	hasSeenTour: boolean;
	/**
	 * Étapes du guide déjà vues (permet de ne proposer que les nouvelles).
	 * Optionnel : la sauvegarde générale de la simulation ne le porte pas, il a
	 * son propre point d'entrée.
	 */
	seenTourSteps?: string[];
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

/** Bornes d'un pourcentage de validation, identiques à celles du front. */
const MIN_PERCENTAGE = 0;
const MAX_PERCENTAGE = 125;

/** Au-delà, le journal ne sert plus à diagnostiquer, il sert à noyer. */
const MAX_LOGGED_ISSUES = 20;

/**
 * Rend un identifiant sûr à journaliser : tronqué, et privé de sauts de ligne.
 * Il vient du client, donc il peut fabriquer de fausses lignes de journal.
 */
function forLog(value: string): string {
	return value.replace(/[\r\n]+/g, '\u23ce').slice(0, 64);
}

/**
 * Ce que `save` rend à l'appelant.
 *
 * `dropped` n'est pas décoratif : sans lui, une entrée refusée disparaissait de
 * la réponse sans le moindre signal, et l'utilisateur croyait avoir enregistré
 * quelque chose qui n'existait nulle part. Le contrôleur le fait remonter.
 */
export interface SaveResult {
	saved: SimulationData;
	dropped: string[];
}

export interface SanitizeResult {
	clean: SimulationData;
	/**
	 * Identifiants de projets présents dans l'entrée mais écartés. Ils doivent
	 * survivre à la mise à jour différentielle : voir `save`.
	 */
	rejectedProjectIds: Set<string>;
	/**
	 * Sous-projets écartés, tels que reçus. Même raison : `simulatedSubProjects`
	 * est un blob JSON réécrit en entier, donc tout ce qui n'y figure pas est
	 * DÉTRUIT. Protéger la table relationnelle sans protéger le blob ne tiendrait
	 * la promesse qu'à moitié.
	 */
	rejectedSubProjects: Record<string, string[]>;
	/** Entrées refusées, pour le journal et pour la réponse au client. */
	dropped: string[];
	/** Valeurs corrigées sans refus — distinctes des refus, elles sont conservées. */
	adjusted: string[];
}

/**
 * Nettoie les données de simulation avant sauvegarde, sans jamais tout refuser.
 *
 * L'ancienne version levait une exception dès qu'une seule entrée clochait, ce
 * qui faisait perdre la sauvegarde ENTIÈRE : un identifiant devenu inconnu — un
 * projet sorti du référentiel, par exemple — bloquait définitivement toutes les
 * sauvegardes de ceux qui l'avaient simulé, y compris leurs autres
 * modifications. C'est déjà arrivé avec `ft-ssl-md5`.
 *
 * On écarte donc l'entrée fautive et on garde le reste. « Écarter » veut dire
 * NE PAS LA TRAITER — surtout pas l'effacer : `rejectedProjectIds` existe pour
 * que `save` protège de la suppression la ligne correspondante en base. Une
 * donnée qu'on ne sait pas relire n'est pas une donnée à détruire.
 */
function sanitizeSimulationData(data: SimulationData): SanitizeResult {
	const dropped: string[] = [];
	const adjusted: string[] = [];
	const rejectedProjectIds = new Set<string>();

	const simulatedProjects: SimulatedProjectData[] = [];
	/**
	 * Un projet ne peut apparaître qu'une fois. La traduction peut faire
	 * converger deux entrées : un onglet à moitié rafraîchi envoie `zappy` ET
	 * `42-1463`, qui désignent le même projet. Sans ce garde, `createMany` levait
	 * sur la contrainte d'unicité APRÈS que `deleteMany` ait déjà commité — trois
	 * projets détruits pour un doublon, avec un 500 en réponse.
	 */
	const vus = new Map<string, number>();
	for (const raw of data.simulatedProjects) {
		// Un onglet resté ouvert depuis avant la bascule vers les identifiants 42
		// envoie encore les anciens. Sans cette traduction, ses projets seraient
		// écartés ET les lignes migrées supprimées — la sauvegarde étant un
		// remplacement, ce que le client n'envoie pas est effacé.
		const p = { ...raw, projectId: toCurrentProjectId(raw.projectId) };
		if (!isValidProjectId(p.projectId)) {
			dropped.push(`projet inconnu ${forLog(p.projectId)}`);
			rejectedProjectIds.add(p.projectId);
			continue;
		}
		if (typeof p.percentage !== 'number' || !Number.isFinite(p.percentage)) {
			dropped.push(`pourcentage non numerique pour ${forLog(p.projectId)}`);
			rejectedProjectIds.add(p.projectId);
			continue;
		}

		// Un pourcentage hors bornes est ramene dans les bornes plutot qu'ecarte :
		// l'intention (avoir simule ce projet) reste lisible, et ce sont exactement
		// les bornes que le front applique deja.
		const percentage = Math.min(MAX_PERCENTAGE, Math.max(MIN_PERCENTAGE, p.percentage));
		if (percentage !== p.percentage) {
			adjusted.push(`pourcentage ${p.percentage} ramene a ${percentage} pour ${forLog(p.projectId)}`);
		}
		// La DERNIÈRE gagne. Les deux entrées portent des pourcentages, notes et
		// boosts différents : celle que l'utilisateur voit à l'écran est celle du
		// nouvel identifiant, envoyée après l'ancienne. Garder la première lui
		// rendait silencieusement une valeur qu'il ne voyait plus nulle part.
		const dejaVu = vus.get(p.projectId);
		if (dejaVu !== undefined) {
			dropped.push(`doublon apres traduction : ${forLog(p.projectId)}`);
			simulatedProjects[dejaVu] = { ...p, percentage };
			continue;
		}
		vus.set(p.projectId, simulatedProjects.length);

		// Copie plutot que mutation : `filter` aurait garde les references de
		// l'appelant, et corriger un pourcentage aurait modifie SON objet.
		simulatedProjects.push({ ...p, percentage });
	}

	// `Object.create(null)` sur les deux : leurs clés viennent du client. Le
	// premier n'accepte que des piscines valides, mais le second reçoit justement
	// celles qu'on n'a pas reconnues — `toString` comprise.
	const simulatedSubProjects: Record<string, string[]> = Object.create(null);
	const rejectedSubProjects: Record<string, string[]> = Object.create(null);
	for (const [rawParentId, subIds] of Object.entries(data.simulatedSubProjects)) {
		// Même traduction sur les piscines et, plus bas, sur leurs modules.
		const parentId = toCurrentProjectId(rawParentId);
		if (!isValidProjectId(parentId)) {
			dropped.push(`piscine inconnue ${forLog(parentId)}`);
			// Conservée telle quelle : une piscine sortie du référentiel ne doit pas
			// emporter les modules que l'utilisateur y avait cochés.
			if (Array.isArray(subIds)) rejectedSubProjects[parentId] = subIds;
			continue;
		}
		// Un client forge ou un stockage local corrompu peut envoyer autre chose
		// qu'un tableau : sans cette garde, `.filter` leve et la requete part en 500.
		if (!Array.isArray(subIds)) {
			dropped.push(`sous-projets non listes pour ${forLog(parentId)}`);
			continue;
		}
		const kept: string[] = [];
		const rejected: string[] = [];
		for (const rawSubId of subIds) {
			const subId = typeof rawSubId === 'string' ? toCurrentProjectId(rawSubId) : rawSubId;
			if (typeof subId === 'string' && isValidSubProjectId(subId)) kept.push(subId);
			else {
				dropped.push(`sous-projet inconnu ${forLog(String(subId))}`);
				if (typeof subId === 'string') rejected.push(subId);
			}
		}
		// FUSION, pas affectation : deux clés brutes peuvent converger après
		// traduction (`piscine-django` et `42-2189`). Une affectation écrasait la
		// première et ses modules disparaissaient sans un mot.
		simulatedSubProjects[parentId] = [
			...new Set([...(simulatedSubProjects[parentId] ?? []), ...kept]),
		];
		if (rejected.length > 0) {
			rejectedSubProjects[parentId] = [
				...new Set([...(rejectedSubProjects[parentId] ?? []), ...rejected]),
			];
		}
	}

	return {
		clean: { ...data, simulatedProjects, simulatedSubProjects },
		rejectedProjectIds,
		rejectedSubProjects,
		dropped,
		adjusted,
	};
}

export interface UserSearchResult {
	userId42: number;
	login: string;
	firstName: string | null;
	lastName: string | null;
	imageUrl: string | null;
	isPublic: boolean | null;
}

export const simulationRepository = {
	/**
	 * Recherche des utilisateurs par login, prénom ou nom
	 */
	async searchUsers(query: string): Promise<UserSearchResult[]> {
		const q = `%${query}%`;
		const rows = await prisma.$queryRaw<Array<Omit<UserSearchResult, 'isPublic'> & { isPublic: unknown }>>`
			SELECT userId42, login, firstName, lastName, imageUrl, isPublic
			FROM user_simulation
			WHERE login LIKE ${q}
			   OR firstName LIKE ${q}
			   OR lastName LIKE ${q}
			ORDER BY login ASC
			LIMIT 20
		`;
		return rows.map((r) => ({
			...r,
			isPublic: r.isPublic === null || r.isPublic === undefined ? null : coerceBooleanFlag(r.isPublic),
		}));
	},

	/**
	 * Récupère le statut privacy brut (null = pas encore choisi)
	 */
	async getPrivacyStatus(userId42: number): Promise<boolean | null> {
		const rows = await prisma.$queryRaw<Array<{ isPublic: unknown }>>`
			SELECT isPublic FROM user_simulation WHERE userId42 = ${userId42} LIMIT 1
		`;
		if (!rows[0]) return null;
		const raw = rows[0].isPublic;
		if (raw === null || raw === undefined) return null;
		return coerceBooleanFlag(raw);
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
	async getProjectUsers(projectId: string): Promise<SimulatedProjectUser[]> {
		const rows = await prisma.simulatedProject.findMany({
			where: { projectId },
			include: { userSimulation: { select: { login: true, userId42: true, imageUrl: true } } },
			orderBy: { createdAt: 'desc' },
		});
		return rows.map((r) => ({
			login: r.userSimulation.login,
			userId42: r.userSimulation.userId42,
			imageUrl: r.userSimulation.imageUrl,
			// Date de simulation : permet de trier et de repérer les projets
			// « simulés il y a un an » que la personne ne fera sans doute jamais.
			simulatedAt: r.createdAt.toISOString(),
			hasTeam: r.hasTeam,
			teamSize: r.teamSize,
		}));
	},

	/**
	 * Met à jour l'état d'équipe d'un projet simulé : « j'ai ma team », et le
	 * nombre de personnes déjà dedans.
	 *
	 * Renvoie `false` si l'utilisateur n'a pas ce projet en simulation : l'état
	 * n'a de sens que pour quelqu'un qui apparaît dans la liste.
	 */
	async setProjectTeamFlag(
		userId42: number,
		projectId: string,
		hasTeam: boolean,
		teamSize: number | null
	): Promise<boolean> {
		const result = await prisma.simulatedProject.updateMany({
			where: { userId42, projectId },
			// Sans équipe, la taille n'a plus de sens : on la remet à zéro pour ne
			// pas laisser un « 3/4 » traîner après un décochage.
			data: { hasTeam, teamSize: hasTeam ? teamSize : null },
		});
		return result.count > 0;
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
			seenTourSteps: await simulationRepository.getSeenTourSteps(userId42),
		};
	},

	/**
	 * Sauvegarde la simulation d'un utilisateur (upsert)
	 */
	async save(userId42: number, login: string, imageUrl: string | null, input: SimulationData, firstName?: string | null, lastName?: string | null): Promise<SaveResult> {
		// Les projets et sous-projets qui suivent ne doivent JAMAIS voir les données
		// brutes : d'où le paramètre renommé `input`. Les trois autres champs
		// (`customProjects`, `manualExperiences`, `apiExpPercentages`) traversent en
		// revanche `sanitize` sans contrôle — la garantie ne porte pas sur eux.
		const { clean: data, rejectedProjectIds, rejectedSubProjects, dropped, adjusted } =
			sanitizeSimulationData(input);

		// Le blob JSON est réécrit EN ENTIER à chaque sauvegarde : ce qu'on n'y
		// remet pas est détruit. On y refusionne donc les entrées écartées, telles
		// que reçues — même raison que `rejectedProjectIds` pour la table
		// relationnelle. Une donnée qu'on ne sait pas relire n'est pas une donnée
		// à détruire, et ça vaut pour les deux moitiés du stockage.
		// `Object.create(null)` : sur un littéral d'objet, `['toString']` rend une
		// fonction héritée du prototype, et le spread qui suit levait —
		// 500, sauvegarde entière perdue, pour une clé qu'un client peut envoyer.
		const subProjectsToStore: Record<string, string[]> = Object.assign(
			Object.create(null) as Record<string, string[]>,
			data.simulatedSubProjects
		);
		for (const [parentId, subIds] of Object.entries(rejectedSubProjects)) {
			subProjectsToStore[parentId] = [...(subProjectsToStore[parentId] ?? []), ...subIds];
		}
		if (dropped.length > 0 || adjusted.length > 0) {
			// Tronqué : un client peut envoyer des milliers d'entrées fautives dans
			// une seule requête, et une ligne de journal de 600 Ko ne diagnostique
			// plus rien. Journalisé sans identifier la personne : c'est le
			// référentiel ou le client qu'on surveille, pas l'utilisateur.
			const issues = [...dropped, ...adjusted];
			const shown = issues.slice(0, MAX_LOGGED_ISSUES).join(', ');
			const rest = issues.length > MAX_LOGGED_ISSUES ? ` (+${issues.length - MAX_LOGGED_ISSUES} autres)` : '';
			console.warn(`[Simulation] entrées non retenues telles quelles : ${shown}${rest}`);
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
				simulatedSubProjects: subProjectsToStore as Prisma.InputJsonValue,
				customProjects: data.customProjects as Prisma.InputJsonValue,
				...(data.manualExperiences !== undefined && {
					manualExperiences: data.manualExperiences as Prisma.InputJsonValue,
				}),
				apiExpPercentages: data.apiExpPercentages as Prisma.InputJsonValue,
			},
			update: {
				login,
				imageUrl,
				...(firstName !== undefined && { firstName }),
				...(lastName !== undefined && { lastName }),
				simulatedSubProjects: subProjectsToStore as Prisma.InputJsonValue,
				customProjects: data.customProjects as Prisma.InputJsonValue,
				...(data.manualExperiences !== undefined && {
					manualExperiences: data.manualExperiences as Prisma.InputJsonValue,
				}),
				apiExpPercentages: data.apiExpPercentages as Prisma.InputJsonValue,
			},
		});

		await prisma.$executeRaw`
			UPDATE user_simulation
			SET hasSeenTour = ${data.hasSeenTour ? 1 : 0}
			WHERE userId42 = ${userId42}
		`;

		// Mise à jour DIFFÉRENTIELLE des projets simulés.
		//
		// Tout supprimer puis tout recréer (ce qu'on faisait avant) remettait à
		// zéro `createdAt` et `hasTeam` à chaque sauvegarde automatique — or la
		// recherche de teammates affiche justement depuis quand la personne a
		// simulé le projet et si elle a déjà une équipe. Seules les lignes
		// réellement retirées disparaissent.
		const existing = await prisma.simulatedProject.findMany({
			where: { userId42 },
			select: { projectId: true, percentage: true, coalitionBoost: true, note: true },
		});
		const existingById = new Map(existing.map((row) => [row.projectId, row]));
		// Les identifiants ÉCARTÉS comptent parmi les voulus.
		//
		// Sans eux, `removed` supprimerait de la base les lignes correspondantes :
		// une entrée qu'on refuse de relire serait donc DÉTRUITE au lieu d'être
		// laissée tranquille — exactement l'inverse du but. Le cas nominal est un
		// projet sorti du référentiel : son identifiant devient inconnu, et
		// l'utilisateur perdrait sa ligne sans rien voir, sans recours.
		const wanted = new Set([
			...data.simulatedProjects.map((p) => p.projectId),
			...rejectedProjectIds,
		]);

		const removed = existing.filter((row) => !wanted.has(row.projectId)).map((row) => row.projectId);
		const added = data.simulatedProjects.filter((p) => !existingById.has(p.projectId));

		// Suppression et création dans UNE transaction. Séparées, un `createMany`
		// qui lève — doublon, contrainte, connexion coupée — laissait le
		// `deleteMany` déjà commité : l'utilisateur perdait des projets qu'il
		// n'avait pas décochés, et recevait une erreur. Reproduit : trois projets
		// réduits à un.
		if (removed.length > 0 || added.length > 0) {
			await prisma.$transaction([
				...(removed.length > 0
					? [prisma.simulatedProject.deleteMany({ where: { userId42, projectId: { in: removed } } })]
					: []),
				...(added.length > 0
					? [
							prisma.simulatedProject.createMany({
								data: added.map((p) => ({
									userId42,
									projectId: p.projectId,
									percentage: p.percentage,
									coalitionBoost: p.coalitionBoost,
									note: p.note ?? null,
								})),
							}),
						]
					: []),
			]);
		}

		for (const p of data.simulatedProjects) {
			const row = existingById.get(p.projectId);
			if (!row) continue;
			const note = p.note ?? null;
			if (row.percentage === p.percentage && row.coalitionBoost === p.coalitionBoost && row.note === note) {
				continue;
			}
			await prisma.simulatedProject.update({
				where: { userId42_projectId: { userId42, projectId: p.projectId } },
				data: { percentage: p.percentage, coalitionBoost: p.coalitionBoost, note },
			});
		}

		// Tronqué comme le journal : le client n'a pas besoin de dix mille lignes
		// pour comprendre que sa sauvegarde n'a pas tout retenu.
		return { saved: data, dropped: dropped.slice(0, MAX_LOGGED_ISSUES) };
	},

	/**
	 * Met à jour uniquement l'état "guide vu" de l'utilisateur.
	 */
	/**
	 * Écrit UNIQUEMENT les expériences professionnelles manuelles.
	 *
	 * Sauvegarde partielle, sur le modèle de `saveTourSeen`, et non `save()` :
	 * celle-ci remplace la simulation ENTIÈRE et remet à vide tout champ absent du
	 * corps. Appelée depuis la page « Expérience professionnelle », qui ne connaît
	 * ni les projets simulés ni les pourcentages, elle aurait effacé tout le reste.
	 *
	 * Le besoin vient d'un bug : cette page n'écrivait que dans le localStorage,
	 * et le Dashboard, qui recharge la simulation depuis la base à chaque visite,
	 * réécrasait l'édition par la copie serveur. Toute modification était donc
	 * perdue au rafraîchissement — un stage remis à 115 %, une alternance à 120 %.
	 */
	async saveManualExperiences(
		userId42: number,
		login: string,
		imageUrl: string | null,
		experiences: unknown[],
		firstName?: string | null,
		lastName?: string | null
	): Promise<unknown[]> {
		await prisma.userSimulation.upsert({
			where: { userId42 },
			create: {
				userId42,
				login,
				imageUrl,
				firstName: firstName ?? null,
				lastName: lastName ?? null,
				manualExperiences: experiences as Prisma.InputJsonValue,
			},
			update: {
				login,
				imageUrl,
				...(firstName !== undefined && { firstName }),
				...(lastName !== undefined && { lastName }),
				manualExperiences: experiences as Prisma.InputJsonValue,
			},
		});

		return experiences;
	},

	async saveTourSeen(userId42: number, login: string, imageUrl: string | null, hasSeenTour: boolean, firstName?: string | null, lastName?: string | null, seenSteps?: string[]): Promise<boolean> {
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
			SET hasSeenTour = ${hasSeenTour ? 1 : 0},
			    seenTourSteps = ${seenSteps === undefined ? null : seenSteps.join(',')}
			WHERE userId42 = ${userId42}
		`;

		return hasSeenTour;
	},

	/**
	 * Étapes du guide déjà vues par l'utilisateur.
	 *
	 * Permet de ne proposer QUE les étapes ajoutées depuis son dernier passage,
	 * au lieu de rejouer tout le parcours ou de ne rien montrer du tout.
	 */
	async getSeenTourSteps(userId42: number): Promise<string[]> {
		const rows = await prisma.$queryRaw<Array<{ seenTourSteps: string | null }>>`
			SELECT seenTourSteps
			FROM user_simulation
			WHERE userId42 = ${userId42}
			LIMIT 1
		`;
		const raw = rows[0]?.seenTourSteps;
		return raw ? raw.split(',').filter(Boolean) : [];
	},

	/** Version du dernier changelog acquitté par l'utilisateur (null = jamais vu). */
	async getLastSeenChangelog(userId42: number): Promise<string | null> {
		const rows = await prisma.$queryRaw<Array<{ lastSeenChangelog: string | null }>>`
			SELECT lastSeenChangelog
			FROM user_simulation
			WHERE userId42 = ${userId42}
			LIMIT 1
		`;
		return rows[0]?.lastSeenChangelog ?? null;
	},

	/** Enregistre la version du changelog vue par l'utilisateur (upsert la ligne au besoin). */
	async saveLastSeenChangelog(userId42: number, login: string, imageUrl: string | null, version: string, firstName?: string | null, lastName?: string | null): Promise<string> {
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
			SET lastSeenChangelog = ${version}
			WHERE userId42 = ${userId42}
		`;

		return version;
	},

	/**
	 * Combien d'utilisateurs ont simulé chacun de ces projets.
	 *
	 * Sert au rapport de comparaison avec GCC, avant de retirer une ligne du
	 * référentiel. Depuis `sanitizeSimulationData`, supprimer un projet encore
	 * simulé ne bloque plus personne : l'identifiant devenu inconnu est écarté,
	 * la ligne en base est préservée, et le reste de la sauvegarde passe. Mais
	 * ces personnes voient leur projet cesser de compter dans le RNCP sans
	 * qu'aucun écran ne l'explique — c'est précisément ce que le drapeau
	 * `retired` sert à éviter. Ce compte dit donc combien de personnes méritent
	 * un `retired: true` plutôt qu'une suppression sèche.
	 *
	 * Un projet absent du résultat n'est simulé par personne : sa ligne peut
	 * être supprimée pour de bon.
	 */
	async countByProjectIds(projectIds: string[]): Promise<Map<string, number>> {
		if (projectIds.length === 0) return new Map();

		// Les SOUS-projets simulés ne vivent pas dans `simulated_project` mais dans un
		// blob JSON de `user_simulation` : `{ identifiant de piscine: [modules] }`.
		// Compter la seule table relationnelle laissait supprimer une piscine dont
		// des modules sont cochés, ou un module lui-même — le garde-fou renvoyait
		// zéro pendant que des gens perdaient leur cochage à la sauvegarde suivante.
		//
		// Les CLÉS (piscines) et les VALEURS (modules) comptent toutes les deux :
		// `revertTo` soumet les deux sortes d'identifiants.
		const wanted = new Set(projectIds);
		const blobs = await prisma.userSimulation.findMany({
			select: { userId42: true, simulatedSubProjects: true },
		});
		// On compte des UTILISATEURS, pas des lignes : quelqu'un qui a la piscine en
		// table ET ses modules dans le blob ne vaut qu'une personne. Sans ce
		// dédoublonnage, le chiffre affiché dans le panneau — « simulé par N
		// utilisateurs » — mentait, et il sert à décider d'une suppression.
		const seen = new Map<string, Set<number>>();
		const relational = await prisma.simulatedProject.findMany({
			where: { projectId: { in: projectIds } },
			select: { projectId: true, userId42: true },
		});
		for (const row of relational) {
			if (!seen.has(row.projectId)) seen.set(row.projectId, new Set());
			seen.get(row.projectId)!.add(row.userId42);
		}
		for (const row of blobs) {
			const subs = row.simulatedSubProjects as Record<string, unknown> | null;
			if (!subs || typeof subs !== 'object') continue;
			for (const [parentId, subIds] of Object.entries(subs)) {
				if (!Array.isArray(subIds)) continue;
				for (const id of wanted.has(parentId) ? [parentId, ...subIds] : subIds) {
					if (typeof id !== 'string' || !wanted.has(id)) continue;
					if (!seen.has(id)) seen.set(id, new Set());
					seen.get(id)!.add(row.userId42);
				}
			}
		}

		return new Map([...seen].map(([projectId, users]) => [projectId, users.size]));
	},
};
