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

/** Les trois setters du hook, injectés pour que la politique soit testable. */
export interface Setters {
	setIsChecking: (valeur: boolean) => void;
	setIsConfigured: (calcul: (precedent: boolean | null) => boolean | null) => void;
	setOriginAllowed: (valeur: boolean | null) => void;
}

/**
 * Un tour de rafraîchissement complet : décider s'il faut interroger, lire,
 * écarter une réponse périmée, puis poser les trois états.
 *
 * Tout est ici et non dans le hook — c'est la quatrième fois que cette boucle
 * d'audit applique le même remède, et la dernière place où la décision restait
 * intestable. Le mutant qui l'a imposé tient en un mot : `setOriginAllowed(null)`
 * au lieu du verdict laissait 137 tests verts tout en rétablissant la panne
 * d'origine — bandeau jamais affiché, bouton jamais désactivé, visiteur déposé
 * sur l'autre instance sans un mot.
 *
 * Rend `true` si l'appel a réellement eu lieu, pour que l'appelant sache s'il
 * doit mémoriser l'instant.
 */
export async function rafraichirStatut(params: {
	maintenant: number;
	dernierInstant: number;
	forcer: boolean;
	/**
	 * Appelé UNE SEULE fois, dès la décision d'interroger prise, AVANT la lecture :
	 * mémorise l'instant et rend le numéro d'ordre de cet appel.
	 *
	 * Le moment compte. Une version antérieure laissait l'appelant mémoriser
	 * l'instant APRÈS la lecture : le plafond ne couvrait donc pas la requête en
	 * vol, et deux navigations rapprochées émettaient deux appels — « une requête
	 * par navigation », précisément ce que le plafond existe pour éviter. Elle
	 * incrémentait aussi le numéro d'ordre avant la garde, si bien qu'un appel
	 * PLAFONNÉ, n'émettant rien, périmait quand même la réponse en vol : une
	 * révocation d'origine pouvait être perdue pour ce tour.
	 */
	commencer: () => number;
	lire: () => Promise<SetupStatus>;
	/** La réponse qui arrive est-elle celle d'un appel dépassé ? */
	estPerime: (numero: number) => boolean;
	setters: Setters;
}): Promise<boolean> {
	const { maintenant, dernierInstant, forcer, commencer, lire, estPerime, setters } = params;
	if (!doitInterroger(maintenant, dernierInstant, forcer)) return false;

	const numero = commencer();
	const verdict = await lireVerdictSetup(lire);

	// Relâché AVANT la garde d'ancienneté : sinon une réponse périmée sortait sans
	// jamais lever l'écran de chargement, et « Loading… » restait à vie.
	setters.setIsChecking(false);
	if (estPerime(numero)) return true;

	setters.setIsConfigured((precedent) => prochainConfigured(precedent, verdict.configured));
	setters.setOriginAllowed(verdict.originAllowed);
	return true;
}
