import { prisma } from '../db/connection.js';
import { LEGACY_PROJECT_IDS, REMOVED_PROJECT_IDS } from '../data/legacyProjectIds.js';

/**
 * Bascule les simulations des utilisateurs vers les identifiants 42.
 *
 * Le référentiel désignait les projets par des chaînes écrites à la main
 * (`zappy`) tandis que le Holy Graph et « Mes projets » les désignaient par
 * l'identifiant de 42 (`42-1463`). Le même projet portait deux noms selon
 * l'écran, et retirer un projet du référentiel rendait son identifiant invalide
 * — ce qui faisait disparaître les simulations sans explication.
 *
 * ─── POURQUOI AU DÉMARRAGE, ET PAS DANS UN SCRIPT ────────────────────────────
 *
 * Un script à lancer « après le déploiement » ne pouvait pas fonctionner :
 * l'image de production ne contient ni `scripts/`, ni `src/`, ni `tsx` (une
 * dépendance de développement). La migration n'aurait tout simplement pas eu
 * lieu. Et même exécutable, elle aurait laissé une fenêtre entre le déploiement
 * et son lancement pendant laquelle une sauvegarde ordinaire migrait la ligne
 * par suppression/recréation — perdant au passage `hasTeam`, `teamSize` et
 * `createdAt`, qui vivent côté serveur et que le client ne renvoie pas.
 *
 * Elle tourne donc AVANT que le serveur accepte la moindre requête. Idempotente
 * et rapide (≈ 1 s pour 300 lignes), elle ne coûte rien aux démarrages suivants.
 */

/** Un identifiant déjà migré, ou venant du Holy Graph. */
const DEJA_MIGRE = /^42-\d+$/;

/** Projets personnalisés : hors référentiel, hors migration. */
const PERSONNALISE = /^custom-/;

interface Bilan {
	projetsTraduits: number;
	projetsIntacts: number;
	piscinesTraduites: number;
	modulesTraduits: number;
	/** Identifiants rencontrés dont on ne sait rien faire. */
	inconnus: Map<string, number>;
	/** Projets volontairement retirés du référentiel : signalés, pas bloquants. */
	supprimes: Map<string, number>;
	/** Migrations qui heurteraient la contrainte d'unicité (userId42, projectId). */
	collisions: string[];
}

function traduire(id: string): string | null {
	if (DEJA_MIGRE.test(id) || PERSONNALISE.test(id)) return null; // rien à faire
	// `Object.hasOwn` : sur un littéral d'objet, `['toString']` rend une fonction
	// héritée du prototype, pas `undefined`. Sans ce garde, un identifiant hostile
	// se retrouvait dans les écritures avec une fonction en guise de valeur.
	return Object.hasOwn(LEGACY_PROJECT_IDS, id) ? LEGACY_PROJECT_IDS[id]! : null;
}

export async function migrateProjectIds(appliquer: boolean): Promise<void> {

	const bilan: Bilan = {
		projetsTraduits: 0,
		projetsIntacts: 0,
		piscinesTraduites: 0,
		modulesTraduits: 0,
		inconnus: new Map(),
		supprimes: new Map(),
		collisions: [],
	};

	// ─── Table relationnelle ───────────────────────────────────────────────────
	const lignes = await prisma.simulatedProject.findMany({
		select: { id: true, userId42: true, projectId: true },
	});

	// Ce que chaque utilisateur possédera après migration, pour repérer AVANT
	// d'écrire les cas où deux anciens identifiants convergeraient vers le même
	// projet 42 : la contrainte d'unicité ferait échouer la transaction.
	const cible = new Map<string, Set<string>>();
	const aEcrire: { id: number; projectId: string }[] = [];

	// Les places DÉJÀ occupées, semées AVANT de traduire quoi que ce soit.
	//
	// Cette boucle venait après : elle signalait bien la collision entre une ligne
	// à traduire et une ligne déjà en `42-…`, mais l'entrée fautive avait déjà été
	// poussée dans `aEcrire`. La transaction levait alors sur la contrainte
	// d'unicité et ANNULAIT TOUT LE LOT — y compris les lignes d'utilisateurs
	// parfaitement sains, à chaque démarrage, indéfiniment. C'est le mode de
	// défaillance que la moitié « identifiants inconnus » de ce fichier déclare
	// justement avoir supprimé ; la moitié « collisions » ne l'avait pas été.
	//
	// Semée d'abord, la garde `deja.has(nouveau)` plus bas fait son travail : la
	// ligne en conflit est signalée et laissée telle quelle, les autres passent.
	for (const ligne of lignes) {
		if (!DEJA_MIGRE.test(ligne.projectId)) continue;
		const clef = String(ligne.userId42);
		if (!cible.has(clef)) cible.set(clef, new Set());
		cible.get(clef)!.add(ligne.projectId);
	}

	for (const ligne of lignes) {
		const nouveau = traduire(ligne.projectId);
		if (nouveau === null) {
			if (DEJA_MIGRE.test(ligne.projectId) || PERSONNALISE.test(ligne.projectId)) {
				bilan.projetsIntacts++;
			} else if (REMOVED_PROJECT_IDS.has(ligne.projectId)) {
				// Projet retiré du référentiel en connaissance de cause : sa ligne
				// reste en base et cesse simplement de compter. S'arrêter dessus
				// bloquerait la migration de TOUS les utilisateurs pour une seule
				// ligne d'un seul d'entre eux.
				bilan.supprimes.set(ligne.projectId, (bilan.supprimes.get(ligne.projectId) ?? 0) + 1);
			} else {
				bilan.inconnus.set(ligne.projectId, (bilan.inconnus.get(ligne.projectId) ?? 0) + 1);
			}
			continue;
		}

		const clef = String(ligne.userId42);
		if (!cible.has(clef)) cible.set(clef, new Set());
		const deja = cible.get(clef)!;
		if (deja.has(nouveau)) {
			bilan.collisions.push(`${ligne.userId42} → ${ligne.projectId} et un autre vers ${nouveau}`);
			continue;
		}
		deja.add(nouveau);
		aEcrire.push({ id: ligne.id, projectId: nouveau });
		bilan.projetsTraduits++;
	}
	// ─── Blobs de sous-projets ─────────────────────────────────────────────────
	const utilisateurs = await prisma.userSimulation.findMany({
		select: { userId42: true, simulatedSubProjects: true },
	});
	const blobsAEcrire: { userId42: number; valeur: Record<string, string[]> }[] = [];

	for (const utilisateur of utilisateurs) {
		const brut = utilisateur.simulatedSubProjects as Record<string, unknown> | null;
		if (!brut || typeof brut !== 'object') continue;

		// `Object.create(null)` : la clé vient du blob stocké, qu'un client peut
		// remplir — `sanitizeSimulationData` conserve délibérément les clés qu'il
		// ne reconnaît pas. Sur `toString`, `nouveauBlob[clef]` rendait une fonction
		// héritée du prototype, `??` ne se déclenchait pas et le spread levait AU
		// DÉMARRAGE : une seule requête d'un seul utilisateur bloquait alors la
		// migration de toute l'instance, définitivement.
		const nouveauBlob: Record<string, string[]> = Object.create(null);
		let change = false;
		for (const [piscine, modules] of Object.entries(brut)) {
			const nouvellePiscine = traduire(piscine);
			if (nouvellePiscine) {
				bilan.piscinesTraduites++;
				change = true;
			} else if (REMOVED_PROJECT_IDS.has(piscine)) {
				bilan.supprimes.set(piscine, (bilan.supprimes.get(piscine) ?? 0) + 1);
			} else if (!DEJA_MIGRE.test(piscine) && !PERSONNALISE.test(piscine)) {
				bilan.inconnus.set(piscine, (bilan.inconnus.get(piscine) ?? 0) + 1);
			}

			const liste = Array.isArray(modules) ? modules : [];
			const nouveauxModules: string[] = [];
			for (const module of liste) {
				if (typeof module !== 'string') continue;
				const nouveauModule = traduire(module);
				if (nouveauModule) {
					bilan.modulesTraduits++;
					change = true;
					nouveauxModules.push(nouveauModule);
				} else {
					if (REMOVED_PROJECT_IDS.has(module)) {
						bilan.supprimes.set(module, (bilan.supprimes.get(module) ?? 0) + 1);
					} else if (!DEJA_MIGRE.test(module) && !PERSONNALISE.test(module)) {
						bilan.inconnus.set(module, (bilan.inconnus.get(module) ?? 0) + 1);
					}
					nouveauxModules.push(module);
				}
			}
			// FUSION, pas affectation : deux clés peuvent converger après traduction
			// (`piscine-django` et `42-2189` désignent la même piscine). Écraser
			// détruisait les modules de la première, en silence — le défaut même que
			// `simulationRepository` vient de corriger, laissé ici par oubli.
			const clef = nouvellePiscine ?? piscine;
			nouveauBlob[clef] = [...new Set([...(nouveauBlob[clef] ?? []), ...nouveauxModules])];
		}
		if (change) blobsAEcrire.push({ userId42: utilisateur.userId42, valeur: nouveauBlob });
	}

	// ─── Bilan ─────────────────────────────────────────────────────────────────
	// Silence quand il n'y a rien à faire : c'est le cas de TOUS les démarrages
	// après le premier, et un journal qui crie à chaque fois finit ignoré.
	const rienAFaire =
		aEcrire.length === 0 &&
		blobsAEcrire.length === 0 &&
		bilan.inconnus.size === 0 &&
		bilan.collisions.length === 0;
	if (rienAFaire && appliquer) return;


	console.log(appliquer ? '=== MIGRATION DES IDENTIFIANTS ===' : '=== SIMULATION (aucune écriture) ===');
	console.log(`${Object.keys(LEGACY_PROJECT_IDS).length} correspondances connues`);
	console.log(`simulated_project : ${lignes.length} lignes`);
	console.log(`   à traduire     : ${bilan.projetsTraduits}`);
	console.log(`   déjà bonnes    : ${bilan.projetsIntacts}`);
	console.log(`blobs             : ${blobsAEcrire.length} utilisateurs à mettre à jour`);
	console.log(`   piscines       : ${bilan.piscinesTraduites}`);
	console.log(`   modules        : ${bilan.modulesTraduits}`);

	if (bilan.inconnus.size > 0) {
		console.log(`\n⚠ ${bilan.inconnus.size} identifiant(s) sans correspondance :`);
		for (const [id, n] of bilan.inconnus) console.log(`     ${id} (${n} fois)`);
	}
	if (bilan.supprimes.size > 0) {
		console.log(`   retirés du référentiel (laissés en base) : ${[...bilan.supprimes.keys()].join(', ')}`);
	}
	if (bilan.collisions.length > 0) {
		console.log(`\n⚠ ${bilan.collisions.length} collision(s) :`);
		for (const c of bilan.collisions) console.log(`     ${c}`);
	}

	// On migre ce qui est migrable, même si quelques lignes résistent.
	//
	// Abandonner tout le lot faisait qu'UNE ligne à identifiant inconnu, chez UN
	// utilisateur, bloquait la migration des 62 autres — et définitivement, la
	// migration tournant à chaque démarrage. Les lignes non traduites gardent leur
	// ancien identifiant : la traduction à la sauvegarde les rattrape, et le
	// journal dit lesquelles regarder.
	if (bilan.inconnus.size > 0 || bilan.collisions.length > 0) {
		console.error(
			`[Migration] ${bilan.inconnus.size} identifiant(s) sans correspondance et ` +
				`${bilan.collisions.length} collision(s) : ces lignes-là gardent leur ancien ` +
				'identifiant, les autres sont migrées.'
		);
	}

	if (!appliquer) {
		console.log('\nSimulation terminée, aucune écriture.');
		return;
	}

	if (aEcrire.length === 0 && blobsAEcrire.length === 0) {
		// Cas nominal de tous les démarrages après le premier : on se tait.
		return;
	}

	// Une seule transaction : la migration est un tout. Un `updateMany` par ligne
	// serait plus lent mais reste largement suffisant à cette échelle (quelques
	// centaines de lignes), et évite d'écrire du SQL brut.
	await prisma.$transaction([
		...aEcrire.map((l) =>
			prisma.simulatedProject.update({ where: { id: l.id }, data: { projectId: l.projectId } })
		),
		...blobsAEcrire.map((b) =>
			prisma.userSimulation.update({
				where: { userId42: b.userId42 },
				data: { simulatedSubProjects: b.valeur },
			})
		),
	]);

	console.log(`\n✓ ${aEcrire.length} ligne(s) et ${blobsAEcrire.length} blob(s) migrés.`);
}
