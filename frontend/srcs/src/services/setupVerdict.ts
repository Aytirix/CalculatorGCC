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

/**
 * Prochaine valeur du drapeau « instance configurée ».
 *
 * MONOTONE : une fois connue configurée, elle ne redevient jamais « non
 * configurée ». Extrait du hook pour être testable — c'est un point de câblage,
 * et l'audit a montré que ceux-là échappaient aux tests.
 *
 * Le besoin est né d'une régression. Avant que le contrôle d'origine n'existe, un
 * porteur de jeton n'interrogeait jamais `/setup/status` ; en levant ce
 * court-circuit, on a exposé tout le monde à un `configured: false` explicite, qui
 * remplace l'application entière par « non configurée » en pleine session. Deux
 * chemins le renvoient pour de bon : une instance en miroir applicatif, qui n'a
 * par conception aucun credential 42, et une instance dont les credentials ne
 * déchiffrent plus.
 */
export function prochainConfigured(
	precedent: boolean | null,
	verdict: boolean | null
): boolean | null {
	// Inconnu : on ne touche à rien. Un hoquet réseau n'est pas une information.
	if (verdict === null) return precedent;
	// Déjà connue configurée : plus de retour en arrière.
	if (precedent === true) return true;
	return verdict;
}

/**
 * Faut-il réinterroger `/setup/status` maintenant ?
 *
 * Extrait du hook, comme tout ce qui décide : un audit par mutation a montré que
 * la politique de rafraîchissement — la seule chose qui reste dans `useSetupCheck`
 * — n'était gardée par aucun test, alors que chacun de ses réglages corrige un
 * bug vécu.
 *
 * L'équilibre à tenir est étroit. La version d'origine n'interrogeait qu'UNE fois
 * par onglet, et jamais quand un jeton était présent : une origine révoquée
 * n'était donc jamais vue. Interroger à chaque clic ferait payer une requête par
 * navigation à tout le monde. D'où un plafond, et non un sondage.
 */
export const INTERVALLE_MIN_MS = 30_000;

export function doitInterroger(
	maintenant: number,
	dernierInstant: number,
	forcer = false
): boolean {
	if (forcer) return true;
	return maintenant - dernierInstant >= INTERVALLE_MIN_MS;
}
