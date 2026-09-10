import { migrateProjectIds } from '../src/services/projectIdMigration.service.js';
import { prisma } from '../src/db/connection.js';

/**
 * Inspecte ce que la migration des identifiants FERAIT, sans rien écrire.
 *
 * La migration elle-même tourne au DÉMARRAGE du serveur : l'image de production
 * ne contient ni `scripts/`, ni `src/`, ni `tsx`, donc un script à lancer à la
 * main n'aurait jamais pu s'exécuter là où il fallait. Ce fichier ne sert qu'à
 * regarder avant, en développement :
 *
 *   npx tsx scripts/migrateProjectIds.ts
 */
migrateProjectIds(false)
	.catch((erreur) => {
		console.error(erreur instanceof Error ? erreur.message : erreur);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
