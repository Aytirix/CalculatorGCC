import { prisma } from '../db/connection.js';
import {
	RNCP_REFERENTIAL,
	type RncpReferentialEntry,
	type RncpReferentialProject,
} from '../data/rncpReferential.js';

/**
 * Le référentiel RNCP courant, et son historique.
 *
 * Il vivait uniquement dans `rncpReferential.ts`, compilé dans l'image : le
 * panneau admin ne pouvait rien appliquer, et corriger une catégorie exigeait un
 * commit et un déploiement. La base fait désormais foi à l'exécution ; le
 * fichier TS reste la GRAINE, insérée en version 1 au premier démarrage sur une
 * base vide, et le repli si la base est injoignable.
 *
 * ─── POURQUOI UN CACHE EN MÉMOIRE ─────────────────────────────────────────────
 *
 * `validProjects.ts` dérive du référentiel les identifiants acceptés à la
 * sauvegarde, et il est appelé SYNCHRONEMENT sur le chemin d'enregistrement de
 * tous les utilisateurs. Le rendre asynchrone aurait contaminé toute cette
 * chaîne pour une donnée qui change deux fois par an. Le référentiel est donc
 * chargé une fois au démarrage et remplacé à chaque écriture : la lecture reste
 * un simple accès mémoire.
 *
 * Conséquence à connaître : une instance qui n'a pas rechargé sert l'ancienne
 * version. Attention, « instance unique » ne suffit PAS à écarter les problèmes
 * de concurrence : deux requêtes en vol dans le même processus s'entrelacent sur
 * les `await`. D'où le contrôle de version optimiste de `applyOperations`.
 */

/** Une écriture refusée parce que l'état de départ n'est plus celui qu'on croyait. */
export class ReferentialConflict extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ReferentialConflict';
	}
}

/** Le référentiel servi à tout le monde. `null` tant que `load()` n'a pas tourné. */
let current: RncpReferentialEntry[] | null = null;
let currentVersion = 0;

/**
 * Une modification demandée par le panneau admin.
 *
 * Le panneau n'envoie JAMAIS un référentiel complet : il envoie des opérations
 * ciblées, que le serveur vérifie une par une. Accepter un payload entier
 * reviendrait à laisser une requête HTTP réécrire ce qui valide les diplômes de
 * tout le monde, sans qu'aucune règle ne puisse s'y opposer.
 */
export type ReferentialOperation =
	| { kind: 'add'; rncpId: string; categoryId: string; projectId: string; slug42: string | null }
	| { kind: 'retire'; rncpId: string; categoryId: string; projectId: string }
	| { kind: 'unretire'; rncpId: string; categoryId: string; projectId: string }
	| { kind: 'remove'; rncpId: string; categoryId: string; projectId: string };

export interface ApplyResult {
	version: number;
	applied: string[];
	/** Opérations refusées, avec la raison. Les autres sont tout de même appliquées. */
	refused: { operation: ReferentialOperation; reason: string }[];
}

export interface VersionInfo {
	version: number;
	createdBy: string;
	summary: string;
	createdAt: Date;
}

/**
 * Ce qu'une version a changé, sous une forme exploitable.
 *
 * `summary` contenait une phrase française par opération, mises bout à bout :
 * douze modifications donnaient un pavé de six lignes que personne ne lisait, et
 * la troncature à 2000 caractères coupait la fin d'un gros lot en plein milieu.
 * On stocke donc du JSON — l'interface le regroupe par catégorie, et il reste
 * lisible tel quel dans la base.
 */
export interface VersionSummary {
	/** Opérations, groupées par nature puis par catégorie. */
	added?: string[];
	retired?: string[];
	unretired?: string[];
	removed?: string[];
	/** Amorçage, retour arrière… : une version qui n'est pas un lot d'opérations. */
	note?: string;
	/** Nombre d'opérations réellement appliquées, même si les listes sont écourtées. */
	total?: number;
}

/**
 * Le payload a-t-il la forme attendue ? Contrôle volontairement superficiel : il
 * vérifie ce que les consommateurs PARCOURENT — les tableaux imbriqués — car
 * c'est leur absence qui fait lever, pas un champ optionnel manquant.
 */
function isWellFormed(payload: unknown): payload is RncpReferentialEntry[] {
	if (!Array.isArray(payload) || payload.length === 0) return false;
	return payload.every(
		(entry: RncpReferentialEntry) =>
			entry &&
			typeof entry === 'object' &&
			typeof entry.id === 'string' &&
			Array.isArray(entry.categories) &&
			entry.categories.every(
				(category) =>
					category &&
					typeof category.id === 'string' &&
					Array.isArray(category.projects) &&
					category.projects.every(
						(project) =>
							project &&
							typeof project.id === 'string' &&
							// `subProjects` est PARCOURU par `validProjects` et par
							// `projectIds` : un non-tableau y lève, donc 500 sur toutes les
							// sauvegardes, sans que le repli ne se déclenche jamais.
							(project.subProjects === undefined || Array.isArray(project.subProjects))
					)
			)
	);
}

/** Copie en profondeur, pour qu'aucun appelant ne puisse muter le référentiel servi. */
function clone(entries: RncpReferentialEntry[]): RncpReferentialEntry[] {
	return JSON.parse(JSON.stringify(entries)) as RncpReferentialEntry[];
}

/**
 * Charge le référentiel courant, et l'amorce depuis le fichier TS si la base est
 * vide. À appeler UNE FOIS au démarrage, avant d'accepter la moindre requête :
 * `validProjects` lit en mémoire et refuserait tout si rien n'était chargé.
 */
export async function loadReferential(): Promise<void> {
	try {
		const row = await prisma.rncpReferentialVersion.findFirst({
			orderBy: { version: 'desc' },
		});

		if (row) {
			// Contrôle de FORME avant de servir : `getReferential()` est appelé sur le
			// chemin de sauvegarde de tous les utilisateurs. Un payload biscornu —
			// écriture directe en base, évolution de schéma — y ferait lever
			// `isValidProjectId`, donc partir en 500 TOUTES les sauvegardes, sans que
			// le repli prévu juste en dessous ne se déclenche jamais.
			const payload = row.payload as unknown;
			if (!isWellFormed(payload)) {
				throw new Error(`version ${row.version} : structure de référentiel invalide`);
			}
			current = payload;
			currentVersion = row.version;
			console.log(`[Référentiel] version ${currentVersion} chargée depuis la base`);
			return;
		}

		const seeded = await prisma.rncpReferentialVersion.create({
			data: {
				payload: RNCP_REFERENTIAL as unknown as object,
				createdBy: 'graine',
				summary: JSON.stringify({ note: 'Amorçage depuis le fichier du dépôt' } satisfies VersionSummary),
			},
		});
		current = clone(RNCP_REFERENTIAL);
		currentVersion = seeded.version;
		console.log(`[Référentiel] base vide : amorcée depuis le fichier (version ${currentVersion})`);
	} catch (error) {
		// Repli sur le fichier plutôt que de démarrer sans référentiel : sans lui,
		// `validProjects` rejetterait tous les identifiants et personne ne pourrait
		// plus rien enregistrer. Une version périmée vaut mieux qu'aucune.
		//
		// PORTÉE RÉELLE de ce repli : base JOIGNABLE mais table illisible — migration
		// pas encore passée, client Prisma non régénéré, droits manquants. Il ne
		// protège PAS d'une base absente : `initConfig()` lève bien avant, au niveau
		// module, et le conteneur ne démarre alors pas du tout. C'est l'attente de la
		// base dans l'entrypoint qui couvre ce cas-là, pas ce `catch`.
		//
		// `currentVersion = 0` marque « je n'ai pas lu la base » et INTERDIT toute
		// écriture : sans ce marqueur, une modification appliquée après un repli
		// repartirait de la graine et annulerait silencieusement toutes les versions
		// intermédiaires.
		current = clone(RNCP_REFERENTIAL);
		currentVersion = 0;
		const detail = error instanceof Error
			// Les messages Prisma commencent par un saut de ligne : `split('\n')[0]`
			// rendait une chaîne vide, et l'opérateur lisait « base illisible () »
			// au moment précis où il a besoin de savoir pourquoi.
			? (error.message.split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? error.name)
			: 'erreur inconnue';
		console.error(
			`[Référentiel] base illisible (${detail}) : repli sur le fichier embarqué. ` +
				`Les modifications faites depuis le panneau ne sont PAS visibles, et toute ` +
				`nouvelle modification sera refusée jusqu'au prochain chargement réussi.`
		);
	}
}

/**
 * Le référentiel courant. Synchrone à dessein : appelé sur le chemin de
 * sauvegarde. Retombe sur le fichier si `loadReferential` n'a pas encore tourné
 * — cas des scripts et des tests, jamais du serveur.
 */
export function getReferential(): RncpReferentialEntry[] {
	return current ?? RNCP_REFERENTIAL;
}

export function getReferentialVersion(): number {
	return currentVersion;
}

/** Retrouve une catégorie, ou explique ce qui manque. */
function locate(
	entries: RncpReferentialEntry[],
	rncpId: string,
	categoryId: string
): { projects: RncpReferentialProject[] } | string {
	const rncp = entries.find((e) => e.id === rncpId);
	if (!rncp) return `RNCP « ${rncpId} » inconnu`;
	const category = rncp.categories.find((c) => c.id === categoryId);
	if (!category) return `catégorie « ${categoryId} » inconnue dans ${rncpId}`;
	return category;
}

/**
 * Applique des opérations et enregistre une nouvelle version.
 *
 * `simulationCounts` dit combien de personnes ont simulé chaque projet : une
 * SUPPRESSION franche est refusée au-dessus de zéro. Retirer l'identifiant d'un
 * projet encore simulé fait cesser de compter ce projet sans qu'aucun écran ne
 * l'explique — c'est exactement ce que `retired` sert à éviter, et le panneau ne
 * doit pas permettre de contourner la règle par mégarde.
 */
export async function applyOperations(
	operations: ReferentialOperation[],
	actor: string,
	simulationCounts: Map<string, number>,
	/**
	 * Nom et XP des projets tels que l'application les affiche aujourd'hui.
	 *
	 * Sert à poser un `fallback` en même temps qu'un `retired`. Sans lui, marquer
	 * un projet que 42 a sorti de son catalogue le fait DISPARAÎTRE de l'écran
	 * (`rncp.service` ne peut plus le construire) au lieu d'afficher le badge —
	 * soit l'inverse exact de l'intention, dans le cas d'usage numéro un du
	 * drapeau. Les valeurs viennent du serveur, jamais du client.
	 */
	displayed: Map<string, { name: string; xp: number }> = new Map()
): Promise<ApplyResult> {
	// La version de DÉPART, capturée au moment du clonage. C'est elle qui doit être
	// confrontée à la base au moment d'écrire : lire `currentVersion` plus tard
	// donnerait la version que la requête PRÉCÉDENTE vient d'écrire, le contrôle
	// passerait, et le référentiel de départ — déjà périmé — écraserait son travail.
	const base = currentVersion;
	const next = clone(getReferential());
	const applied: string[] = [];
	const refused: { operation: ReferentialOperation; reason: string }[] = [];

	/**
	 * Le résumé est rempli AU MOMENT où l'opération réussit.
	 *
	 * Le reconstruire après coup en rapprochant les opérations des lignes de
	 * `applied` obligeait à comparer des phrases : un `add` refusé se retrouvait
	 * compté parce qu'un `retire` d'un autre projet mentionnait le même
	 * identifiant. Ici, aucun rapprochement — donc aucune erreur possible.
	 *
	 * Les listes sont écourtées à 40 entrées, `total` gardant le compte exact :
	 * au-delà, la colonne déborde et le détail n'aide plus personne.
	 */
	const MAX_LISTED = 40;
	const summary: VersionSummary = { total: 0 };
	const record = (kind: keyof VersionSummary & ('added' | 'retired' | 'unretired' | 'removed'), op: ReferentialOperation) => {
		summary.total = (summary.total ?? 0) + 1;
		const list = (summary[kind] ??= []);
		// « rncp / catégorie · projet » : le RNCP est nécessaire pour regrouper
		// l'historique comme le reste du panneau. Le séparateur « · » ne peut pas
		// être confondu avec les tirets des identifiants.
		if (list.length < MAX_LISTED) list.push(`${op.rncpId} / ${op.categoryId} · ${op.projectId}`);
	};

	for (const operation of operations) {
		const category = locate(next, operation.rncpId, operation.categoryId);
		if (typeof category === 'string') {
			refused.push({ operation, reason: category });
			continue;
		}

		const index = category.projects.findIndex((p) => p.id === operation.projectId);

		if (operation.kind === 'add') {
			if (index !== -1) {
				refused.push({ operation, reason: 'déjà présent dans cette catégorie' });
				continue;
			}
			// Un même projet vit dans plusieurs catégories et doit y porter le MÊME
			// slug : deux écritures différentes donneraient une correspondance avec
			// l'API 42 incohérente d'un RNCP à l'autre.
			const known = findKnownSlug(next, operation.projectId);
			if (known !== undefined && known !== operation.slug42) {
				refused.push({
					operation,
					reason: `« ${operation.projectId} » existe ailleurs avec slug42 ${known === null ? 'null' : `« ${known} »`}`,
				});
				continue;
			}
			category.projects.push({ id: operation.projectId, slug42: operation.slug42 });
			record('added', operation);
			applied.push(`ajout de ${operation.projectId} à ${operation.rncpId}/${operation.categoryId}`);
			continue;
		}

		if (index === -1) {
			refused.push({ operation, reason: 'absent de cette catégorie' });
			continue;
		}

		if (operation.kind === 'retire') {
			const project = category.projects[index]!;
			project.retired = true;
			// Filet indispensable : un projet sans `fallback` dont le slug a quitté le
			// catalogue 42 n'est plus constructible, donc plus affiché — et le badge
			// « hors référentiel » que ce drapeau existe pour montrer n'apparaît
			// jamais. On fige donc son nom et son XP au moment du marquage.
			const known = displayed.get(operation.projectId);
			if (!project.fallback && known) {
				project.fallback = { name: known.name, xp: known.xp };
			}
			record('retired', operation);
			applied.push(`${operation.projectId} marqué hors référentiel dans ${operation.categoryId}`);
		} else if (operation.kind === 'unretire') {
			delete category.projects[index]!.retired;
			record('unretired', operation);
			applied.push(`${operation.projectId} remis au référentiel dans ${operation.categoryId}`);
		} else {
			const simulatedBy = simulationCounts.get(operation.projectId) ?? 0;
			if (simulatedBy > 0) {
				refused.push({
					operation,
					reason: `simulé par ${simulatedBy} utilisateur(s) : marquer « hors référentiel » plutôt que supprimer`,
				});
				continue;
			}
			category.projects.splice(index, 1);
			record('removed', operation);
			applied.push(`suppression de ${operation.projectId} dans ${operation.categoryId}`);
		}
	}

	if (applied.length === 0) {
		return { version: currentVersion, applied, refused };
	}

	const row = await commit(next, actor, JSON.stringify(summary), base);
	return { version: row, applied, refused };
}

/**
 * Écrit une nouvelle version, en refusant si l'état de départ n'est plus celui
 * qu'on croyait.
 *
 * Sans ce contrôle, deux applications concurrentes — deux onglets, deux
 * délégués, un double-clic, un renvoi réseau — clonent le MÊME référentiel,
 * écrivent chacune leur ligne, et répondent toutes deux « appliqué, 0 refus »
 * alors qu'une seule survit. La perte est totalement silencieuse, et le
 * référentiel change encore une fois tout seul au redémarrage suivant, quand la
 * version maximale reprend la main sur la mémoire.
 *
 * Le `FOR UPDATE` est nécessaire : en REPEATABLE READ, deux transactions
 * liraient la même version maximale et inséreraient toutes les deux. Il
 * sérialise les candidates sur la dernière ligne.
 */
async function commit(
	next: RncpReferentialEntry[],
	actor: string,
	summary: string,
	base = currentVersion
): Promise<number> {
	// En repli, `currentVersion` vaut 0 et `current` est la GRAINE, pas l'état
	// réel : écrire reviendrait à republier le fichier embarqué et à annuler en
	// silence toutes les versions faites depuis le panneau.
	if (currentVersion === 0) {
		// Une seconde chance : la base était peut-être illisible au démarrage
		// seulement. Si elle répond maintenant, on repart de l'état réel.
		await loadReferential();
		if (currentVersion === 0) {
			throw new ReferentialConflict(
				"Le référentiel n'a pas pu être lu en base : aucune modification ne peut être enregistrée " +
					'tant que ce problème dure. Voir les journaux du serveur.'
			);
		}
		throw new ReferentialConflict(
			`Le référentiel vient d'être rechargé (version ${currentVersion}). Relance la comparaison ` +
				'et vérifie tes modifications avant de les appliquer.'
		);
	}

	// Sérialisation DANS le processus. Deux requêtes concurrentes s'entrelacent sur
	// les `await` : sans file d'attente, elles lisent la même version de départ.
	// Le contrôle de version ci-dessous reste indispensable — il couvre les
	// écritures venues d'ailleurs (script, autre instance) — mais il ne peut pas,
	// à lui seul, départager deux candidates du même processus sans provoquer des
	// verrous d'écart InnoDB qui remontent en erreur illisible.
	const version = await (writeQueue = writeQueue.then(
		() => writeVersion(next, actor, summary, base),
		() => writeVersion(next, actor, summary, base)
	));

	current = next;
	currentVersion = version;
	return version;
}

/** Une seule écriture à la fois : les suivantes attendent leur tour. */
let writeQueue: Promise<unknown> = Promise.resolve();

async function writeVersion(
	next: RncpReferentialEntry[],
	actor: string,
	summary: string,
	expected: number
): Promise<number> {
	try {
		return await prisma.$transaction(async (tx) => {
			// Contrôle de version optimiste : quelqu'un a-t-il écrit depuis qu'on a
			// lu ? Si oui, on refuse plutôt que d'écraser son travail en silence.
			// `FOR UPDATE` : sans lui, le contrôle ne tient QUE dans ce processus. Deux
			// processus (script d'exploitation, seconde instance) lisent la même
			// version maximale et insèrent tous les deux — vérifié. Le verrou les
			// sérialise ; la perdante remonte un conflit d'écriture, que le `catch`
			// ci-dessous traduit dans le bon message.
			const rows = await tx.$queryRaw<{ version: number }[]>`
				SELECT version FROM rncp_referential_version ORDER BY version DESC LIMIT 1 FOR UPDATE
			`;
			const latest = Number(rows[0]?.version ?? 0);
			if (latest !== expected) {
				throw new ReferentialConflict(
					`Le référentiel a changé entre-temps (version ${latest}, tu partais de ${expected}). ` +
						'Rien n\'a été enregistré : relance la comparaison et réapplique tes modifications.'
				);
			}
			const created = await tx.rncpReferentialVersion.create({
				data: {
					payload: next as unknown as object,
					createdBy: actor.slice(0, 128),
					summary: summary.slice(0, 2000),
				},
			});
			return created.version;
		});
	} catch (error) {
		if (error instanceof ReferentialConflict) throw error;
		// Ce `catch` est volontairement large — interblocage, attente de verrou
		// dépassée, transaction avortée veulent tous dire « quelqu'un écrivait en
		// même temps ». Mais il attrape aussi les vraies pannes (base pleine,
		// connexion coupée, contrainte violée), qui diraient alors à l'admin de
		// réessayer indéfiniment. D'où la trace : le message est rassurant, le
		// journal doit rester exact.
		console.error('[Référentiel] écriture en échec :', error);
		throw new ReferentialConflict(
			"L'enregistrement a échoué, probablement parce qu'une autre modification était en cours. " +
				"Rien n'a été enregistré : réessaie."
		);
	}
}

/** Le slug déjà utilisé pour cet identifiant ailleurs, ou `undefined` s'il est neuf. */
function findKnownSlug(entries: RncpReferentialEntry[], projectId: string): string | null | undefined {
	for (const rncp of entries) {
		for (const category of rncp.categories) {
			// Les SOUS-projets comptent aussi : sans eux, ajouter un projet portant
			// l'identifiant d'un module de piscine passait la garde, et le même
			// identifiant pointait alors sur deux projets 42 différents selon la
			// catégorie — nom et XP compris.
			for (const project of category.projects) {
				if (project.id === projectId) return project.slug42;
				const sub = project.subProjects?.find((s) => s.id === projectId);
				if (sub) return sub.slug42;
			}
		}
	}
	return undefined;
}

/** Historique, du plus récent au plus ancien. */
export async function listVersions(limit = 20): Promise<VersionInfo[]> {
	const rows = await prisma.rncpReferentialVersion.findMany({
		orderBy: { version: 'desc' },
		take: limit,
		select: { version: true, createdBy: true, summary: true, createdAt: true },
	});
	return rows;
}

/**
 * Rétablit une version antérieure — en en créant une NOUVELLE qui la recopie,
 * jamais en supprimant ce qui suit. L'historique doit rester lisible, y compris
 * les erreurs qu'on annule.
 */
export async function revertTo(
	version: number,
	actor: string,
	simulationCounts: (projectIds: string[]) => Promise<Map<string, number>>
): Promise<number> {
	const row = await prisma.rncpReferentialVersion.findUnique({ where: { version } });
	if (!row) throw new Error(`Version ${version} introuvable.`);

	const target = row.payload as unknown as RncpReferentialEntry[];

	// Le garde-fou anti-suppression ne vivait que dans `applyOperations` : revenir
	// à une version où un projet encore simulé n'existait pas produisait EXACTEMENT
	// la suppression qu'on refuse par la porte principale, sans aucune
	// vérification. Un retour arrière est une suppression de masse en puissance.
	const disappearing = [...projectIds(getReferential())].filter((id) => !projectIds(target).has(id));
	if (disappearing.length > 0) {
		const counts = await simulationCounts(disappearing);
		const simulated = disappearing.filter((id) => (counts.get(id) ?? 0) > 0);
		if (simulated.length > 0) {
			throw new ReferentialConflict(
				`Ce retour arrière ferait disparaître ${simulated.length} projet(s) encore simulé(s) : ` +
					`${simulated.slice(0, 10).join(', ')}${simulated.length > 10 ? '…' : ''}. ` +
					'Ils cesseraient de compter sans qu\'aucun écran ne l\'explique aux personnes concernées.'
			);
		}
	}

	const created = await commit(
		target,
		actor,
		JSON.stringify({ note: `Retour à la version ${version}` } satisfies VersionSummary)
	);
	return created;
}

/** Tous les identifiants d'un référentiel, projets et sous-projets confondus. */
function projectIds(entries: RncpReferentialEntry[]): Set<string> {
	const ids = new Set<string>();
	for (const rncp of entries) {
		for (const category of rncp.categories) {
			for (const project of category.projects) {
				ids.add(project.id);
				for (const sub of project.subProjects ?? []) ids.add(sub.id);
			}
		}
	}
	return ids;
}

/**
 * Le référentiel courant réécrit en TypeScript, à recopier dans
 * `src/data/rncpReferential.ts`.
 *
 * La graine n'est PAS mise à jour automatiquement : la base fait foi à
 * l'exécution, et une installation neuve qui repart d'un fichier périmé se
 * rattrape avec une comparaison GCC. Cet export existe pour que le dépôt reste
 * honnête quand on le souhaite, pas pour transformer chaque case cochée en
 * corvée de commit.
 */
export function exportAsTypeScript(): string {
	const entries = getReferential();
	const lines: string[] = [];

	lines.push(`// Référentiel exporté depuis la base — version ${currentVersion}.`);
	lines.push(`// Généré le ${new Date().toISOString()}. Recopier le tableau ci-dessous`);
	lines.push(`// dans src/data/rncpReferential.ts pour remettre la graine à jour.`);
	lines.push('export const RNCP_REFERENTIAL: RncpReferentialEntry[] = [');

	/**
	 * Un littéral de chaîne TypeScript valide.
	 *
	 * N'échapper que les apostrophes ne suffit pas : un antislash final mangeait
	 * l'apostrophe fermante et cassait la compilation du fichier recopié, et un
	 * saut de ligne coupait la chaîne en deux. L'antislash se traite EN PREMIER,
	 * sinon on ré-échapperait celui qu'on vient d'ajouter.
	 */
	const str = (value: string | null | undefined): string => {
		if (value === null || value === undefined) return 'null';
		const escaped = value
			.replace(/\\/g, '\\\\')
			.replace(/'/g, "\\'")
			.replace(/\r/g, '\\r')
			.replace(/\n/g, '\\n')
			.replace(/\t/g, '\\t')
			// eslint-disable-next-line no-control-regex
			.replace(/[\u0000-\u001f\u007f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
		return `'${escaped}'`;
	};

	for (const rncp of entries) {
		lines.push('\t{');
		lines.push(`\t\tid: ${str(rncp.id)},`);
		lines.push(`\t\tname: ${str(rncp.name)},`);
		lines.push(`\t\tlevel: ${rncp.level},`);
		lines.push(`\t\trequiredEvents: ${rncp.requiredEvents},`);
		lines.push(`\t\trequiredProfessionalExperience: ${rncp.requiredProfessionalExperience},`);
		lines.push('\t\tcategories: [');
		for (const category of rncp.categories) {
			lines.push('\t\t\t{');
			lines.push(`\t\t\t\tid: ${str(category.id)},`);
			lines.push(`\t\t\t\tname: ${str(category.name)},`);
			lines.push(`\t\t\t\trequiredCount: ${category.requiredCount},`);
			lines.push(`\t\t\t\trequiredXP: ${category.requiredXP},`);
			lines.push('\t\t\t\tprojects: [');
			for (const project of category.projects) {
				const parts = [`id: ${str(project.id)}`, `slug42: ${str(project.slug42)}`];
				if (project.maxPercentage !== undefined) parts.push(`maxPercentage: ${project.maxPercentage}`);
				if (project.retired) parts.push('retired: true');
				if (project.fallback) {
					parts.push(`fallback: { name: ${str(project.fallback.name)}, xp: ${project.fallback.xp} }`);
				}
				if (project.subProjects && project.subProjects.length > 0) {
					lines.push(`\t\t\t\t\t{ ${parts.join(', ')}, subProjects: [`);
					for (const sub of project.subProjects) {
						const subParts = [`id: ${str(sub.id)}`, `slug42: ${str(sub.slug42)}`];
						if (sub.retired) subParts.push('retired: true');
						if (sub.fallback) {
							subParts.push(`fallback: { name: ${str(sub.fallback.name)}, xp: ${sub.fallback.xp} }`);
						}
						lines.push(`\t\t\t\t\t\t{ ${subParts.join(', ')} },`);
					}
					lines.push('\t\t\t\t\t] },');
				} else {
					lines.push(`\t\t\t\t\t{ ${parts.join(', ')} },`);
				}
			}
			lines.push('\t\t\t\t],');
			lines.push('\t\t\t},');
		}
		lines.push('\t\t],');
		lines.push('\t},');
	}

	lines.push('];');
	return lines.join('\n');
}
