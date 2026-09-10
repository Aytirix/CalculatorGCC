/**
 * RÉFÉRENTIEL RNCP — la seule chose qu'on décide nous-mêmes.
 *
 * Ce fichier ne contient QUE la structure : quel RNCP exige quels projets, dans
 * quelle catégorie, avec quels seuils. Tout le reste (nom affiché, XP, slug) est
 * lu sur l'API 42 au moment de construire le référentiel complet — c'est elle qui
 * fait autorité, et nos données ne peuvent plus dériver de la réalité.
 *
 * Chaque projet porte :
 *  - `id`      : NOTRE identifiant, stable. Il est stocké en base dans les
 *                simulations des utilisateurs : ne jamais le renommer.
 *  - `slug42`  : le slug du projet côté 42, qui sert à retrouver nom et XP.
 *  - `maxPercentage` (optionnel) : plafond de validation propre au projet, une
 *                règle métier qui ne se déduit pas de l'API.
 *  - `fallback` (optionnel) : nom et XP de secours, UNIQUEMENT pour les projets
 *                que l'API 42 ne connaît plus (retirés du catalogue). C'est le
 *                seul endroit où un XP est encore écrit en dur.
 */

/**
 * `retired` : l'école ne compte plus ce projet dans cette catégorie.
 *
 * On garde la ligne au lieu de la supprimer, et ce n'est pas de la timidité :
 * `validProjects.ts` dérive de ce fichier les identifiants acceptés à la
 * sauvegarde. Retirer la ligne d'un projet que quelqu'un a simulé ferait
 * disparaître son identifiant du référentiel, et l'entrée serait alors écartée
 * de sa simulation sans qu'il comprenne pourquoi. Marqué `retired`, le projet
 * reste valide, reste visible — grisé — mais ne compte plus ni dans les projets
 * requis ni dans l'XP de la catégorie. La ligne ne se supprime pour de bon que
 * lorsque plus personne ne l'a en simulation.
 *
 * DEUX PRÉCAUTIONS en le posant :
 *
 * 1. Si 42 a aussi sorti le projet de son catalogue, AJOUTER un `fallback` en
 *    même temps. Sans lui, `rncp.service.ts` ne peut plus construire le projet
 *    et renvoie `null` : il disparaît de l'écran, la progression baisse, et le
 *    badge que ce drapeau existe pour afficher n'est jamais vu. Or « 42 l'a
 *    sorti du catalogue » est justement la raison n°1 de marquer `retired`.
 *
 * 2. Un même projet est déclaré dans PLUSIEURS catégories — `darkly` six fois.
 *    Le marquer ici ne le marque QUE dans cette catégorie. Retirer d'une seule
 *    catégorie est légitime, mais si l'intention est de le retirer partout, il
 *    faut le faire partout : `validProjects.ts` avertit au démarrage quand les
 *    déclarations d'un même identifiant divergent.
 */
export interface RncpReferentialSubProject {
	id: string;
	slug42: string | null;
	fallback?: { name: string; xp: number };
	retired?: boolean;
}

export interface RncpReferentialProject {
	id: string;
	slug42: string | null;
	maxPercentage?: number;
	fallback?: { name: string; xp: number };
	subProjects?: RncpReferentialSubProject[];
	retired?: boolean;
}

export interface RncpReferentialCategory {
	id: string;
	name: string;
	requiredCount: number;
	requiredXP: number;
	projects: RncpReferentialProject[];
}

export interface RncpReferentialEntry {
	id: string;
	name: string;
	level: number;
	requiredEvents: number;
	requiredProfessionalExperience: number;
	categories: RncpReferentialCategory[];
}

export const RNCP_REFERENTIAL: RncpReferentialEntry[] = [
	{
		id: 'rncp-global',
		name: 'Global',
		level: 0,
		requiredEvents: 0,
		requiredProfessionalExperience: 0,
		categories: [
			{
				id: 'group-projects',
				name: 'Projets de groupe',
				requiredCount: 2,
				requiredXP: 0,
				projects: [
					{ id: '42-2522', slug42: 'administrativedirectory' },
					{ id: '42-2521', slug42: 'automaticdirectory' },
					{ id: '42-2071', slug42: 'bgp-at-doors-of-autonomous-systems-is-simple', maxPercentage: 100 },
					{ id: '42-1389', slug42: '42cursus-bomberman' },
					{ id: '42-1446', slug42: '42cursus-boot2root' },
					{ id: '42-1414', slug42: '42cursus-cloud-1' },
					{ id: '42-1475', slug42: '42cursus-corewar' },
					{ id: '42-1405', slug42: '42cursus-darkly' },
					{ id: '42-1445', slug42: '42cursus-death' },
					{ id: '42-1458', slug42: '42cursus-doom-nukem' },
					{ id: '42-1453', slug42: '42cursus-dslr' },
					{ id: '42-1384', slug42: '42cursus-expert-system' },
					{ id: '42-1430', slug42: '42cursus-famine' },
					{ id: '42-1423', slug42: '42cursus-filesystem' },
					{ id: '42-1883', slug42: 'freddie-mercury' },
					{ id: '42-1407', slug42: '42cursus-ft_ality' },
					{ id: '42-2098', slug42: 'ft_kalman' },
					{ id: '42-2126', slug42: 'ft_minecraft' },
					{ id: '42-1962', slug42: 'ft_newton' },
					{ id: '42-1400', slug42: '42cursus-ft_nmap' },
					{ id: '42-1447', slug42: '42cursus-ft_shield' },
					{ id: '42-1403', slug42: '42cursus-ft_turing' },
					{ id: '42-1449', slug42: '42cursus-ft_vox' },
					{ id: '42-1383', slug42: '42cursus-gomoku' },
					{ id: '42-1455', slug42: '42cursus-guimp' },
					{ id: '42-1394', slug42: '42cursus-humangl' },
					{ id: '42-1402', slug42: '42cursus-hypertube' },
					{ id: '42-2064', slug42: 'inception-of-things' },
					{ id: '42-1425', slug42: '42cursus-kfs-1' },
					{ id: '42-1424', slug42: '42cursus-kfs-2' },
					{ id: '42-1426', slug42: '42cursus-kfs-3' },
					{ id: '42-1431', slug42: '42cursus-kfs-4' },
					{ id: '42-1432', slug42: '42cursus-kfs-5' },
					{ id: '42-1438', slug42: '42cursus-kfs-6' },
					{ id: '42-1439', slug42: '42cursus-kfs-7' },
					{ id: '42-1440', slug42: '42cursus-kfs-8' },
					{ id: '42-1441', slug42: '42cursus-kfs-9' },
					{ id: '42-1442', slug42: '42cursus-kfs-x' },
					{ id: '42-1392', slug42: '42cursus-krpsim' },
					{ id: '42-2372', slug42: 'leaffliction' },
					{ id: '42-1470', slug42: '42cursus-lem_in' },
					{ id: '42-1401', slug42: '42cursus-matcha' },
					{ id: '42-1420', slug42: '42cursus-matt-daemon' },
					{ id: '42-1462', slug42: '42cursus-mod1' },
					{ id: '42-1427', slug42: '42cursus-music-room' },
					{ id: '42-1385', slug42: '42cursus-n-puzzle' },
					{ id: '42-1386', slug42: '42cursus-nibbler' },
					{ id: '42-1635', slug42: 'open-project' },
					{ id: '42-1448', slug42: '42cursus-override' },
					{ id: '42-1443', slug42: '42cursus-pestilence' },
					{ id: '42-1417', slug42: '42cursus-rainfall' },
					{ id: '42-1428', slug42: '42cursus-red-tetris' },
					{ id: '42-1855', slug42: '42cursus-rt' },
					{ id: '42-1393', slug42: '42cursus-rubik' },
					{ id: '42-1454', slug42: '42cursus-shaderpixel' },
					{ id: '42-1404', slug42: '42cursus-snow-crash' },
					{ id: '42-1406', slug42: '42cursus-swifty-proteins' },
					{ id: '42-1381', slug42: '42cursus-taskmaster' },
					{ id: '42-2097', slug42: 'tinky-winkey' },
					{ id: '42-1456', slug42: '42cursus-userspace_digressions' },
					{ id: '42-1444', slug42: '42cursus-war' },
					{ id: '42-1419', slug42: '42cursus-woody-woodpacker' },
					{ id: '42-1408', slug42: '42cursus-xv' },
					{ id: '42-1463', slug42: '42cursus-zappy' },
				],
			},
			{
				id: 'suite-global',
				name: 'Suite',
				requiredCount: 1,
				requiredXP: 0,
				projects: [
					{ id: '42-1854', slug42: '42cursus-42sh' },
					{ id: '42-2071', slug42: 'bgp-at-doors-of-autonomous-systems-is-simple', maxPercentage: 100 },
					{ id: '42-1458', slug42: '42cursus-doom-nukem' },
					{ id: '42-1394', slug42: '42cursus-humangl' },
					{ id: '42-2064', slug42: 'inception-of-things' },
					{ id: '42-1424', slug42: '42cursus-kfs-2' },
					{ id: '42-1448', slug42: '42cursus-override' },
					{ id: '42-1443', slug42: '42cursus-pestilence' },
					{ id: '42-1855', slug42: '42cursus-rt' },
					{ id: '42-1460', slug42: '42cursus-total-perspective-vortex' },
				],
			},
		],
	},
	{
		id: 'rncp6-web-mobile',
		name: 'RNCP 6 - Développement Web et Mobile',
		level: 17,
		requiredEvents: 10,
		requiredProfessionalExperience: 2,
		categories: [
			{
				id: 'web',
				name: 'Web',
				requiredCount: 2,
				requiredXP: 15000,
				projects: [
					{ id: '42-1396', slug42: '42cursus-camagru' },
					{ id: '42-1405', slug42: '42cursus-darkly' },
					{ id: '42-1429', slug42: '42cursus-h42n42' },
					{ id: '42-1402', slug42: '42cursus-hypertube' },
					{ id: '42-1401', slug42: '42cursus-matcha' },
					{ id: '42-1427', slug42: '42cursus-music-room' },
					{ id: '42-1428', slug42: '42cursus-red-tetris' },
					{ id: '42-2600', slug42: 'tokenizeart' },
					{ id: '42-2485', slug42: 'tokenizer', maxPercentage: 120 },
					{ id: '42-2189', slug42: 'piscine-django', subProjects: [
						{ id: '42-2191', slug42: 'django-0-starting' },
						{ id: '42-2190', slug42: 'django-0-initiation' },
						{ id: '42-2192', slug42: 'django-0-oob' },
						{ id: '42-2193', slug42: 'django-1-lib' },
						{ id: '42-2194', slug42: 'django-1-base-django' },
						{ id: '42-2195', slug42: 'django-2-sql' },
						{ id: '42-2196', slug42: 'django-3-sessions' },
						{ id: '42-2197', slug42: 'django-3-advanced' },
						{ id: '42-2198', slug42: 'django-3-final' },
					] },
					{ id: '42-2179', slug42: 'piscine-ror', subProjects: [
						{ id: '42-2181', slug42: 'ror-0-starting' },
						{ id: '42-2180', slug42: 'ror-0-initiation' },
						{ id: '42-2182', slug42: 'ror-0-oob' },
						{ id: '42-2184', slug42: 'ror-1-base-rails' },
						{ id: '42-2183', slug42: 'ror-1-gems' },
						{ id: '42-2185', slug42: 'ror-2-sql' },
						{ id: '42-2186', slug42: 'ror-3-sessions' },
						{ id: '42-2187', slug42: 'ror-3-advanced' },
						{ id: '42-2188', slug42: 'ror-3-final' },
					] },
					{ id: '42-2199', slug42: 'piscine-symfony', subProjects: [
						{ id: '42-2201', slug42: 'symfony-0-starting' },
						{ id: '42-2200', slug42: 'symfony-0-initiation' },
						{ id: '42-2202', slug42: 'symfony-0-oob' },
						{ id: '42-2204', slug42: 'symfony-1-base-symfony' },
						{ id: '42-2203', slug42: 'symfony-1-composer' },
						{ id: '42-2205', slug42: 'symfony-2-sql' },
						{ id: '42-2206', slug42: 'symfony-3-sessions' },
						{ id: '42-2207', slug42: 'symfony-3-advanced' },
						{ id: '42-2208', slug42: 'symfony-3-final' },
					] },
				],
			},
			{
				id: 'mobile',
				name: 'Mobile',
				requiredCount: 2,
				requiredXP: 10000,
				projects: [
					{ id: '42-1379', slug42: '42cursus-ft_hangouts' },
					{ id: '42-1427', slug42: '42cursus-music-room' },
					{ id: '42-2552', slug42: 'peace_break' },
					{ id: '42-1395', slug42: '42cursus-swifty-companion' },
					{ id: '42-1406', slug42: '42cursus-swifty-proteins' },
					{ id: '42-2355', slug42: 'mobile', subProjects: [
						{ id: '42-2354', slug42: 'mobile-0-basic-of-the-mobile-application' },
						{ id: '42-2356', slug42: 'mobile-1-structure-and-logic' },
						{ id: '42-2357', slug42: 'mobile-2-api-and-data' },
						{ id: '42-2358', slug42: 'mobile-3-design' },
						{ id: '42-2359', slug42: 'mobile-4-auth-and-database' },
						{ id: '42-2360', slug42: 'mobile-5-manage-data-and-display' },
					] },
				],
			},
		],
	},
	{
		id: 'rncp6-applicatif',
		name: 'RNCP 6 - Développement Applicatif',
		level: 17,
		requiredEvents: 10,
		requiredProfessionalExperience: 2,
		categories: [
			{
				id: 'oop',
				name: 'Programmation orientée objet',
				requiredCount: 2,
				requiredXP: 10000,
				projects: [
					{ id: '42-1435', slug42: '42cursus-avaj-launcher' },
					{ id: '42-1389', slug42: '42cursus-bomberman' },
					{ id: '42-1396', slug42: '42cursus-camagru' },
					{ id: '42-1405', slug42: '42cursus-darkly' },
					{ id: '42-1437', slug42: '42cursus-fix-me' },
					{ id: '42-1379', slug42: '42cursus-ft_hangouts' },
					{ id: '42-1429', slug42: '42cursus-h42n42' },
					{ id: '42-1402', slug42: '42cursus-hypertube' },
					{ id: '42-1401', slug42: '42cursus-matcha' },
					{ id: '42-1386', slug42: '42cursus-nibbler' },
					{ id: '42-1428', slug42: '42cursus-red-tetris' },
					{ id: '42-1436', slug42: '42cursus-swingy' },
					{ id: '42-1395', slug42: '42cursus-swifty-companion' },
					{ id: '42-1406', slug42: '42cursus-swifty-proteins' },
					{ id: '42-2189', slug42: 'piscine-django', subProjects: [
						{ id: '42-2191', slug42: 'django-0-starting' },
						{ id: '42-2190', slug42: 'django-0-initiation' },
						{ id: '42-2192', slug42: 'django-0-oob' },
						{ id: '42-2193', slug42: 'django-1-lib' },
						{ id: '42-2194', slug42: 'django-1-base-django' },
						{ id: '42-2195', slug42: 'django-2-sql' },
						{ id: '42-2196', slug42: 'django-3-sessions' },
						{ id: '42-2197', slug42: 'django-3-advanced' },
						{ id: '42-2198', slug42: 'django-3-final' },
					] },
					{ id: '42-2355', slug42: 'mobile', subProjects: [
						{ id: '42-2354', slug42: 'mobile-0-basic-of-the-mobile-application' },
						{ id: '42-2356', slug42: 'mobile-1-structure-and-logic' },
						{ id: '42-2357', slug42: 'mobile-2-api-and-data' },
						{ id: '42-2358', slug42: 'mobile-3-design' },
						{ id: '42-2359', slug42: 'mobile-4-auth-and-database' },
						{ id: '42-2360', slug42: 'mobile-5-manage-data-and-display' },
					] },
					{ id: '42-2364', slug42: 'piscine-object', subProjects: [
						{ id: '42-2365', slug42: 'piscine-object-module-00-encapsulation' },
						{ id: '42-2366', slug42: 'piscine-object-module-01-relationship' },
						{ id: '42-2367', slug42: 'piscine-object-module-02-uml' },
						{ id: '42-2368', slug42: 'piscine-object-module-03-solid' },
						{ id: '42-2369', slug42: 'piscine-object-module-04-design-pattern' },
						{ id: '42-2370', slug42: 'piscine-object-module-05-practical-work' },
					] },
					{ id: '42-2179', slug42: 'piscine-ror', subProjects: [
						{ id: '42-2181', slug42: 'ror-0-starting' },
						{ id: '42-2180', slug42: 'ror-0-initiation' },
						{ id: '42-2182', slug42: 'ror-0-oob' },
						{ id: '42-2184', slug42: 'ror-1-base-rails' },
						{ id: '42-2183', slug42: 'ror-1-gems' },
						{ id: '42-2185', slug42: 'ror-2-sql' },
						{ id: '42-2186', slug42: 'ror-3-sessions' },
						{ id: '42-2187', slug42: 'ror-3-advanced' },
						{ id: '42-2188', slug42: 'ror-3-final' },
					] },
					{ id: '42-2199', slug42: 'piscine-symfony', subProjects: [
						{ id: '42-2201', slug42: 'symfony-0-starting' },
						{ id: '42-2200', slug42: 'symfony-0-initiation' },
						{ id: '42-2202', slug42: 'symfony-0-oob' },
						{ id: '42-2204', slug42: 'symfony-1-base-symfony' },
						{ id: '42-2203', slug42: 'symfony-1-composer' },
						{ id: '42-2205', slug42: 'symfony-2-sql' },
						{ id: '42-2206', slug42: 'symfony-3-sessions' },
						{ id: '42-2207', slug42: 'symfony-3-advanced' },
						{ id: '42-2208', slug42: 'symfony-3-final' },
					] },
				],
			},
			{
				id: 'functional',
				name: 'Programmation fonctionnelle',
				requiredCount: 2,
				requiredXP: 10000,
				projects: [
					{ id: '42-1407', slug42: '42cursus-ft_ality' },
					{ id: '42-1403', slug42: '42cursus-ft_turing' },
					{ id: '42-1429', slug42: '42cursus-h42n42' },
				],
			},
			{
				id: 'imperative',
				name: 'Programmation impérative',
				requiredCount: 2,
				requiredXP: 10000,
				projects: [
					{ id: '42-1854', slug42: '42cursus-42sh' },
					{ id: '42-1446', slug42: '42cursus-boot2root' },
					{ id: '42-1405', slug42: '42cursus-darkly' },
					{ id: '42-1430', slug42: '42cursus-famine' },
					{ id: '42-1415', slug42: '42cursus-ft_linux' },
					{ id: '42-1840', slug42: 'ft_malcolm' },
					{ id: '42-1400', slug42: '42cursus-ft_nmap' },
					{ id: '42-1466', slug42: '42cursus-ft_script' },
					{ id: '42-1469', slug42: '42cursus-ft_select' },
					{ id: '42-1447', slug42: '42cursus-ft_shield' },
					{ id: '42-1451', slug42: '42cursus-ft_ssl_md5' },
					{ id: '42-1425', slug42: '42cursus-kfs-1' },
					{ id: '42-1424', slug42: '42cursus-kfs-2' },
					{ id: '42-1464', slug42: '42cursus-lem-ipc' },
					{ id: '42-1330', slug42: 'libasm' },
					{ id: '42-1416', slug42: '42cursus-little-penguin-1' },
					{ id: '42-1468', slug42: '42cursus-malloc' },
					{ id: '42-1420', slug42: '42cursus-matt-daemon' },
					{ id: '42-1467', slug42: 'nm' },
					{ id: '42-1448', slug42: '42cursus-override' },
					{ id: '42-1443', slug42: '42cursus-pestilence' },
					{ id: '42-1417', slug42: '42cursus-rainfall' },
					{ id: '42-1404', slug42: '42cursus-snow-crash' },
					{ id: '42-1388', slug42: '42cursus-strace' },
					{ id: '42-1381', slug42: '42cursus-taskmaster' },
					{ id: '42-1419', slug42: '42cursus-woody-woodpacker' },
					{ id: '42-1463', slug42: '42cursus-zappy' },
				],
			},
		],
	},
	{
		id: 'rncp7-system-network',
		name: 'RNCP 7 - Système d\'information et réseaux',
		level: 21,
		requiredEvents: 15,
		requiredProfessionalExperience: 2,
		categories: [
			{
				id: 'unix-kernel',
				name: 'Unix/Kernel Projects',
				requiredCount: 2,
				requiredXP: 30000,
				projects: [
					{ id: '42-1415', slug42: '42cursus-ft_linux' },
					{ id: '42-1466', slug42: '42cursus-ft_script' },
					{ id: '42-1469', slug42: '42cursus-ft_select' },
					{ id: '42-1425', slug42: '42cursus-kfs-1' },
					{ id: '42-1424', slug42: '42cursus-kfs-2' },
					{ id: '42-1426', slug42: '42cursus-kfs-3' },
					{ id: '42-1431', slug42: '42cursus-kfs-4' },
					{ id: '42-1432', slug42: '42cursus-kfs-5' },
					{ id: '42-1438', slug42: '42cursus-kfs-6' },
					{ id: '42-1440', slug42: '42cursus-kfs-8' },
					{ id: '42-1441', slug42: '42cursus-kfs-9' },
					{ id: '42-1442', slug42: '42cursus-kfs-x' },
					{ id: '42-1464', slug42: '42cursus-lem-ipc' },
					{ id: '42-1330', slug42: 'libasm' },
					{ id: '42-1416', slug42: '42cursus-little-penguin-1' },
					{ id: '42-1468', slug42: '42cursus-malloc' },
					{ id: '42-1420', slug42: '42cursus-matt-daemon' },
					{ id: '42-1467', slug42: 'nm' },
					{ id: '42-1388', slug42: '42cursus-strace' },
					{ id: '42-1381', slug42: '42cursus-taskmaster' },
					{ id: '42-1463', slug42: '42cursus-zappy' },
				],
			},
			{
				id: 'system-admin',
				name: 'Projets d\'administration système',
				requiredCount: 3,
				requiredXP: 50000,
				projects: [
					{ id: '42-2523', slug42: 'accessibledirectory' },
					{ id: '42-2522', slug42: 'administrativedirectory' },
					{ id: '42-2520', slug42: 'activediscovery' },
					{ id: '42-2521', slug42: 'automaticdirectory' },
					{ id: '42-2071', slug42: 'bgp-at-doors-of-autonomous-systems-is-simple', maxPercentage: 100 },
					{ id: '42-1414', slug42: '42cursus-cloud-1' },
					{ id: '42-1400', slug42: '42cursus-ft_nmap' },
					{ id: '42-1397', slug42: '42cursus-ft_ping' },
					{ id: '42-1399', slug42: '42cursus-ft_traceroute' },
					{ id: '42-2064', slug42: 'inception-of-things' },
					{ id: '42-1381', slug42: '42cursus-taskmaster' },
				],
			},
			{
				id: 'security',
				name: 'Projets de sécurité',
				requiredCount: 3,
				requiredXP: 50000,
				projects: [
					{ id: '42-2395', slug42: 'activeconnect' },
					{ id: '42-2529', slug42: 'activetechtales' },
					{ id: '42-1446', slug42: '42cursus-boot2root' },
					{ id: '42-2345', slug42: 'cybersecurity-vaccine-web' },
					{ id: '42-1405', slug42: '42cursus-darkly' },
					{ id: '42-1430', slug42: '42cursus-famine' },
					{ id: '42-1840', slug42: 'ft_malcolm' },
					{ id: '42-1447', slug42: '42cursus-ft_shield' },
					{ id: '42-1451', slug42: '42cursus-ft_ssl_md5' },
					{ id: '42-2527', slug42: 'microforensx' },
					{ id: '42-1448', slug42: '42cursus-override' },
					{ id: '42-1443', slug42: '42cursus-pestilence' },
					{ id: '42-1417', slug42: '42cursus-rainfall' },
					{ id: '42-1404', slug42: '42cursus-snow-crash' },
					{ id: '42-2393', slug42: 'unleashthebox' },
					{ id: '42-1419', slug42: '42cursus-woody-woodpacker' },
				],
			},
		],
	},
	{
		id: 'rncp7-database-data',
		name: 'RNCP 7 - Architecture des bases de données et data',
		level: 21,
		requiredEvents: 15,
		requiredProfessionalExperience: 2,
		categories: [
			{
				id: 'web-database',
				name: 'Bases de données',
				requiredCount: 2,
				requiredXP: 50000,
				projects: [
					{ id: '42-1396', slug42: '42cursus-camagru' },
					{ id: '42-1405', slug42: '42cursus-darkly' },
					{ id: '42-1429', slug42: '42cursus-h42n42' },
					{ id: '42-1402', slug42: '42cursus-hypertube' },
					{ id: '42-1401', slug42: '42cursus-matcha' },
					{ id: '42-1427', slug42: '42cursus-music-room' },
					{ id: '42-1428', slug42: '42cursus-red-tetris' },
					{ id: '42-2600', slug42: 'tokenizeart' },
					{ id: '42-2485', slug42: 'tokenizer', maxPercentage: 120 },
					{ id: '42-2179', slug42: 'piscine-ror', subProjects: [
						{ id: '42-2181', slug42: 'ror-0-starting' },
						{ id: '42-2180', slug42: 'ror-0-initiation' },
						{ id: '42-2182', slug42: 'ror-0-oob' },
						{ id: '42-2184', slug42: 'ror-1-base-rails' },
						{ id: '42-2183', slug42: 'ror-1-gems' },
						{ id: '42-2185', slug42: 'ror-2-sql' },
						{ id: '42-2186', slug42: 'ror-3-sessions' },
						{ id: '42-2187', slug42: 'ror-3-advanced' },
						{ id: '42-2188', slug42: 'ror-3-final' },
					] },
					{ id: '42-2189', slug42: 'piscine-django', subProjects: [
						{ id: '42-2191', slug42: 'django-0-starting' },
						{ id: '42-2190', slug42: 'django-0-initiation' },
						{ id: '42-2192', slug42: 'django-0-oob' },
						{ id: '42-2193', slug42: 'django-1-lib' },
						{ id: '42-2194', slug42: 'django-1-base-django' },
						{ id: '42-2195', slug42: 'django-2-sql' },
						{ id: '42-2196', slug42: 'django-3-sessions' },
						{ id: '42-2197', slug42: 'django-3-advanced' },
						{ id: '42-2198', slug42: 'django-3-final' },
					] },
					{ id: '42-2199', slug42: 'piscine-symfony', subProjects: [
						{ id: '42-2201', slug42: 'symfony-0-starting' },
						{ id: '42-2200', slug42: 'symfony-0-initiation' },
						{ id: '42-2202', slug42: 'symfony-0-oob' },
						{ id: '42-2204', slug42: 'symfony-1-base-symfony' },
						{ id: '42-2203', slug42: 'symfony-1-composer' },
						{ id: '42-2205', slug42: 'symfony-2-sql' },
						{ id: '42-2206', slug42: 'symfony-3-sessions' },
						{ id: '42-2207', slug42: 'symfony-3-advanced' },
						{ id: '42-2208', slug42: 'symfony-3-final' },
					] },
				],
			},
			{
				id: 'artificial-intelligence',
				name: 'Projets d\'intelligence artificielle',
				requiredCount: 3,
				requiredXP: 70000,
				projects: [
					{ id: '42-1453', slug42: '42cursus-dslr' },
					{ id: '42-1384', slug42: '42cursus-expert-system' },
					{ id: '42-1391', slug42: '42cursus-ft_linear_regression' },
					{ id: '42-1383', slug42: '42cursus-gomoku' },
					{ id: '42-1392', slug42: '42cursus-krpsim' },
					{ id: '42-2372', slug42: 'leaffliction' },
					{ id: '42-2551', slug42: 'learn2slither' },
					{ id: '42-2077', slug42: 'matrix' },
					{ id: '42-1457', slug42: '42cursus-multilayer-perceptron' },
					{ id: '42-2076', slug42: 'ready-set-boole' },
					{ id: '42-1460', slug42: '42cursus-total-perspective-vortex' },
					{ id: '42-2295', slug42: 'piscine-data-science', subProjects: [
						{ id: '42-2306', slug42: 'data-science-0' },
						{ id: '42-2318', slug42: 'data-science-1' },
						{ id: '42-2311', slug42: 'data-science-2' },
						{ id: '42-2316', slug42: 'data-science-3' },
						{ id: '42-2317', slug42: 'data-science-4' },
					] },
					{ id: '42-2267', slug42: 'python-for-data-science', subProjects: [
						{ id: '42-2268', slug42: 'python-0-starting' },
						{ id: '42-2269', slug42: 'python-1-array' },
						{ id: '42-2270', slug42: 'python-2-datatable' },
						{ id: '42-2271', slug42: 'python-3-oop' },
						{ id: '42-2272', slug42: 'python-4-dod' },
					] },
				],
			},
		],
	},
];
