/**
 * Anciens identifiants de projet, et leur équivalent en identifiant 42.
 *
 * Le référentiel désignait les projets par des chaînes écrites à la main
 * (`zappy`, `corewar`) alors que le Holy Graph et « Mes projets » les
 * désignaient par l'identifiant de 42 (`42-1385`). Le même projet portait donc
 * deux noms selon l'écran, et retirer un projet du référentiel rendait son
 * identifiant invalide — ce qui faisait disparaître les simulations des gens.
 * Tout est passé à l'identifiant 42.
 *
 * ─── POURQUOI CETTE TABLE EXISTE ─────────────────────────────────────────────
 *
 * La sauvegarde est un REMPLACEMENT : le client envoie sa liste complète, et le
 * serveur supprime ce qui n'y figure pas. Un onglet resté ouvert pendant la
 * migration garde les anciens identifiants en mémoire ; sans traduction, son
 * prochain enregistrement effacerait TOUTE la simulation migrée — vérifié : 3
 * lignes sur 3 perdues, avec un 200 en réponse. Un redéploiement ne recharge
 * pas les onglets déjà ouverts, il ne protège donc de rien.
 *
 * ─── QUAND LA SUPPRIMER ──────────────────────────────────────────────────────
 *
 * PAS « au bout de quelques semaines ». Le Dashboard conserve la simulation
 * dans le `localStorage` du navigateur et y retombe dès que le backend est
 * indisponible — une source d'anciens identifiants qui survit aux redémarrages
 * du navigateur, donc indéfiniment. Supprimer cette table sur un simple délai
 * rejouerait exactement le scénario décrit plus haut.
 *
 * Le bon critère est mesurable : plus aucun ancien identifiant écarté dans les
 * journaux (`[Simulation] entrées non retenues`) sur une période longue. Alors
 * seulement, supprimer ce fichier et son appel dans `simulationRepository`.
 */
export const LEGACY_PROJECT_IDS: Record<string, string> = {
	'42sh': '42-1854',
	'accessible-directory': '42-2523',
	'active-connect': '42-2395',
	'active-discovery': '42-2520',
	'active-tech-tales': '42-2529',
	'administrative-directory': '42-2522',
	'automatic-directory': '42-2521',
	'avaj-launcher': '42-1435',
	'bgp-at-doors': '42-2071',
	'bomberman': '42-1389',
	'boot2root': '42-1446',
	'camagru': '42-1396',
	'cloud-1': '42-1414',
	'corewar': '42-1475',
	'cybersecurity-vaccine-web': '42-2345',
	'darkly': '42-1405',
	'data-science-0': '42-2306',
	'data-science-1': '42-2318',
	'data-science-2': '42-2311',
	'data-science-3': '42-2316',
	'data-science-4': '42-2317',
	'death': '42-1445',
	'django-0-initiation': '42-2190',
	'django-0-oob': '42-2192',
	'django-0-starting': '42-2191',
	'django-1-base': '42-2194',
	'django-1-lib': '42-2193',
	'django-2-sql': '42-2195',
	'django-3-advanced': '42-2197',
	'django-3-final': '42-2198',
	'django-3-sessions': '42-2196',
	'doom-nukem': '42-1458',
	'dslr': '42-1453',
	'expert-system': '42-1384',
	'famine': '42-1430',
	'filesystem': '42-1423',
	'fix-me': '42-1437',
	'freddie-mercury': '42-1883',
	'ft-ality': '42-1407',
	'ft-hangouts': '42-1379',
	'ft-kalman': '42-2098',
	'ft-linear-regression': '42-1391',
	'ft-linux': '42-1415',
	'ft-malcolm': '42-1840',
	'ft-minecraft': '42-2126',
	'ft-newton': '42-1962',
	'ft-nmap': '42-1400',
	'ft-ping': '42-1397',
	'ft-script': '42-1466',
	'ft-select': '42-1469',
	'ft-shield': '42-1447',
	'ft-ssl-md5': '42-1451',
	'ft-traceroute': '42-1399',
	'ft-turing': '42-1403',
	'ft-vox': '42-1449',
	'gomoku': '42-1383',
	'guimp': '42-1455',
	'h42n42': '42-1429',
	'humangl': '42-1394',
	'hypertube': '42-1402',
	'inception-of-things': '42-2064',
	'kfs-1': '42-1425',
	'kfs-2': '42-1424',
	'kfs-3': '42-1426',
	'kfs-4': '42-1431',
	'kfs-5': '42-1432',
	'kfs-6': '42-1438',
	'kfs-7': '42-1439',
	'kfs-8': '42-1440',
	'kfs-9': '42-1441',
	'kfs-x': '42-1442',
	'krpsim': '42-1392',
	'leaffliction': '42-2372',
	'learn2slither': '42-2551',
	'lem-in': '42-1470',
	'lem-ipc': '42-1464',
	'libasm': '42-1330',
	'little-penguin-1': '42-1416',
	'malloc': '42-1468',
	'matcha': '42-1401',
	'matrix': '42-2077',
	'matt-daemon': '42-1420',
	'micro-forensx': '42-2527',
	'mobile-0': '42-2354',
	'mobile-1': '42-2356',
	'mobile-2': '42-2357',
	'mobile-3': '42-2358',
	'mobile-4': '42-2359',
	'mobile-5': '42-2360',
	'mod1': '42-1462',
	'multilayer-perceptron': '42-1457',
	'music-room': '42-1427',
	'n-puzzle': '42-1385',
	'nibbler': '42-1386',
	'nm': '42-1467',
	'object-module-00': '42-2365',
	'object-module-01': '42-2366',
	'object-module-02': '42-2367',
	'object-module-03': '42-2368',
	'object-module-04': '42-2369',
	'object-module-05': '42-2370',
	'open-project': '42-1635',
	'override': '42-1448',
	'peace-break': '42-2552',
	'pestilence': '42-1443',
	'piscine-data-science': '42-2295',
	'piscine-django': '42-2189',
	'piscine-mobile': '42-2355',
	'piscine-object': '42-2364',
	'piscine-ror': '42-2179',
	'piscine-symfony': '42-2199',
	'python-0-starting': '42-2268',
	'python-1-array': '42-2269',
	'python-2-datatable': '42-2270',
	'python-3-oop': '42-2271',
	'python-4-dod': '42-2272',
	'python-for-data-science': '42-2267',
	'rainfall': '42-1417',
	'ready-set-boole': '42-2076',
	'red-tetris': '42-1428',
	'ror-0-initiation': '42-2180',
	'ror-0-oob': '42-2182',
	'ror-0-starting': '42-2181',
	'ror-1-base-rails': '42-2184',
	'ror-1-gems': '42-2183',
	'ror-2-sql': '42-2185',
	'ror-3-advanced': '42-2187',
	'ror-3-final': '42-2188',
	'ror-3-sessions': '42-2186',
	'rt': '42-1855',
	'rubik': '42-1393',
	'shaderpixel': '42-1454',
	'snow-crash': '42-1404',
	'strace': '42-1388',
	'swifty-companion': '42-1395',
	'swifty-proteins': '42-1406',
	'swingy': '42-1436',
	'symfony-0-initiation': '42-2200',
	'symfony-0-oob': '42-2202',
	'symfony-0-starting': '42-2201',
	'symfony-1-base': '42-2204',
	'symfony-1-composer': '42-2203',
	'symfony-2-sql': '42-2205',
	'symfony-3-advanced': '42-2207',
	'symfony-3-final': '42-2208',
	'symfony-3-sessions': '42-2206',
	'taskmaster': '42-1381',
	'tinky-winkey': '42-2097',
	'tokenize-art': '42-2600',
	'tokenizer': '42-2485',
	'total-perspective-vortex': '42-1460',
	'unleash-the-box': '42-2393',
	'userspace-digressions': '42-1456',
	'war': '42-1444',
	'woody-woodpacker': '42-1419',
	'xv': '42-1408',
	'zappy': '42-1463',
};

/**
 * Projets retirés du référentiel lors de la bascule, sans équivalent 42.
 *
 * `gbmu` a quitté le catalogue de 42 : aucun identifiant 42 ne lui correspond,
 * il ne peut donc pas être traduit. Vérifié en production avant de le retirer —
 * personne ne le simulait, ni en projet ni en module de piscine. Il est listé
 * ici pour que la migration le RECONNAISSE au lieu de s'arrêter sur un
 * identifiant qu'elle ne sait pas traduire.
 */
export const REMOVED_PROJECT_IDS = new Set(['gbmu']);

/**
 * L'identifiant courant d'un projet : traduit s'il est ancien, rendu tel quel
 * sinon. Un identifiant déjà en `42-…` traverse sans être touché.
 *
 * `Object.hasOwn` et non `LEGACY_PROJECT_IDS[id] ?? id` : sur un littéral
 * d'objet, `['toString']` rend une FONCTION héritée d'`Object.prototype`, pas
 * `undefined`. Le `??` ne se déclenchait donc pas, et un client envoyant
 * `toString` comme identifiant faisait lever `id.startsWith is not a function`
 * — 500, et toute la sauvegarde perdue. C'était une régression : avant la
 * traduction, cette chaîne était proprement écartée.
 */
export function toCurrentProjectId(id: string): string {
	return Object.hasOwn(LEGACY_PROJECT_IDS, id) ? LEGACY_PROJECT_IDS[id]! : id;
}
