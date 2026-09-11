import type { SetupStatus } from './setup.service';

/**
 * Ce que le frontend retient de `/setup/status`.
 *
 * Extrait du hook pour être **exécutable** en test : `vitest.config.ts` tourne en
 * `environment: 'node'`, un hook ne peut pas y être monté. Un audit par mutation
 * l'a montré crûment — la décision vivant dans le hook, les seuls tests possibles
 * étaient des expressions régulières sur le texte source, et onze mutants qui
 * préservaient ce texte ont tous survécu, dont ceux qui rendaient la branche de
 * refus inatteignable. Ici, chaque cas se vérifie par son résultat.
 */

export interface VerdictSetup {
	/** `null` = on ne sait pas. Seul un `false` explicite du serveur fait foi. */
	configured: boolean | null;
	/** `null` = on ne sait pas. Seul un `false` explicite justifie d'avertir. */
	originAllowed: boolean | null;
}

/** Une erreur d'appel, telle qu'axios la présente. */
interface ErreurAppel {
	response?: { data?: { setupRequired?: unknown; configured?: unknown } };
}

export async function lireVerdictSetup(
	getStatus: () => Promise<SetupStatus>
): Promise<VerdictSetup> {
	try {
		const status = await getStatus();
		return {
			configured: status.configured,
			// Champ absent = instance antérieure à ce contrôle ; `null` = elle ne
			// fait pas autorité (miroir applicatif, ou domaine propre inconnu). Les
			// deux valent « on ne sait pas » : bloquer là-dessus ferait tomber un
			// miroir pointé sur une principale pas encore à jour.
			originAllowed: typeof status.origin_allowed === 'boolean' ? status.origin_allowed : null,
		};
	} catch (error) {
		// « Le serveur DIT qu'il n'est pas configuré » et « le serveur ne répond
		// pas » sont deux choses différentes, et on les confondait en `false`.
		// Depuis qu'un écran affirme « Ce site n'a pas encore reçu ses identifiants »,
		// cette confusion fait mentir l'application à chaque hoquet du backend.
		const data = (error as ErreurAppel)?.response?.data;
		const refusExplicite = Boolean(data?.setupRequired) || data?.configured === false;
		// L'origine, elle, n'est JAMAIS conclue depuis une erreur : on repart à
		// l'inconnu. Sans cela, un `false` obtenu plus tôt restait affiché alors
		// qu'on ne savait plus rien — un avertissement qu'aucune réponse ne soutient.
		return { configured: refusExplicite ? false : null, originAllowed: null };
	}
}
