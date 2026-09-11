/**
 * « L'origine d'où l'on m'interroge est-elle reconnue ici ? »
 *
 * Isolé du contrôleur pour être testable sans base. Trois réponses, et non deux :
 * `true`, `false`, et **`null` pour « je ne sais pas »**.
 *
 * Ce `null` est le cœur de la fonction. La version précédente écrasait
 * l'incertitude en `true`, et le démarrage d'un miroir affichait alors « Origine
 * reconnue par l'instance principale » alors que personne n'avait rien vérifié —
 * exactement le mensonge silencieux que ce garde-fou existe pour supprimer. Une
 * non-réponse ne doit pas s'écrire comme un accord.
 *
 * Deux situations où cette instance ne peut PAS trancher :
 *  - `APP_DOMAIN` absent : `config.frontendUrl` retombe sur le nom d'hôte du
 *    conteneur, et la comparaison « est-ce moi ? » ne veut plus rien dire ;
 *  - instance en **miroir applicatif** : elle relaie `/auth/42` vers une autre
 *    instance, qui décide seule du retour — mais `/setup/status` reste servi
 *    localement (`LOCAL_PREFIXES` dans `mirror.service.ts`). Répondre depuis sa
 *    propre liste blanche reviendrait à se valider en se regardant soi-même, et
 *    c'est précisément ce qu'elle faisait : un feu vert sur la panne à corriger.
 */

/** Vérificateur de liste blanche, injecté pour rester testable. */
export type EstAutorisee = (origine: string) => Promise<boolean>;

export async function origineAutorisee(
	origin: unknown,
	normaliser: (brut: string) => string | null,
	estAutorisee: EstAutorisee,
	/**
	 * Cette instance fait-elle autorité sur la question ? Voir l'en-tête : faux
	 * quand elle ignore son propre domaine, ou quand une autre instance décidera
	 * réellement du retour de connexion.
	 */
	faitAutorite = true
): Promise<boolean | null> {
	// Paramètre absent : l'appelant ne pose pas la question, il n'y a rien à
	// bloquer. C'est le cas de toute sonde et de tout frontend antérieur à ce
	// contrôle — y compris celui de l'instance principale elle-même.
	if (origin === undefined) return true;

	// Présent mais pas une chaîne : `?origin=a&origin=b` arrive en tableau. C'est
	// une question MALFORMÉE, pas une absence de question — la traiter comme un
	// silence donnait un contournement d'un seul caractère. Le dépôt a déjà
	// tranché dans ce sens pour la même entrée (`admin.controller.ts` répond 400),
	// et `initiateOAuth` lève sur un tableau : on ne va pas déclarer « autorisée »
	// une valeur que le décideur ne sait même pas lire.
	if (typeof origin !== 'string') return false;

	// Illisible : même traitement. Une question MALFORMÉE se reconnaît sans aucune
	// autorité — c'est un constat sur l'entrée, pas un verdict sur l'origine. La
	// répondre `null` laisserait l'appelant croire qu'il a posé une vraie question
	// restée sans réponse, alors qu'il a envoyé n'importe quoi.
	const normalisee = normaliser(origin);
	if (normalisee === null) return false;

	// La question est bien formée, mais ce n'est pas à nous d'y répondre.
	if (!faitAutorite) return null;

	return estAutorisee(normalisee);
}

/**
 * Cette instance fait-elle autorité sur la question de l'origine ?
 *
 * Extrait du contrôleur pour être testable : c'est le point de CÂBLAGE, et un
 * audit par mutation a montré que ces points-là échappaient entièrement aux
 * tests — on pouvait forcer la valeur à `true` ou à `false` sans un seul rouge,
 * ce qui neutralise le contrôle dans un sens et rend la panne dans l'autre.
 *
 * Deux conditions, et la première est plus subtile qu'un simple « la variable
 * est-elle posée » : un `APP_DOMAIN` sans schéma est ILLISIBLE comme origine, et
 * l'instance ne se reconnaît alors même plus elle-même — elle se déclarerait
 * « non autorisée » à son propre frontend, en désignant la mauvaise cause. Or
 * c'est précisément la forme que documentaient README.md et coolify-init-app.md.
 */
export function instanceFaitAutorite(
	appDomain: string | undefined,
	normaliser: (brut: string) => string | null,
	enMiroirApplicatif: boolean
): boolean {
	if (enMiroirApplicatif) return false;
	if (!appDomain) return false;
	return normaliser(appDomain) !== null;
}
