/**
 * « L'origine d'où l'on m'interroge est-elle reconnue ici ? »
 *
 * Isolé du contrôleur pour être testable sans base : la logique tient en trois
 * cas, mais deux d'entre eux ont des conséquences opposées et l'un d'eux bloque
 * l'application entière s'il est mal tranché.
 *
 * Le cas qui compte est l'ABSENCE de paramètre. Elle vaut `true` — « rien à
 * bloquer » — et non `false` : tout frontend qui ne pose pas la question (sonde
 * de supervision, version antérieure à ce contrôle) doit continuer de
 * fonctionner. Répondre `false` par défaut ferait tomber l'instance principale
 * elle-même, dont le frontend interrogeait cette route sans rien demander.
 */

/** Vérificateur de liste blanche, injecté pour rester testable. */
export type EstAutorisee = (origine: string) => Promise<boolean>;

export async function origineAutorisee(
	origin: unknown,
	normaliser: (brut: string) => string | null,
	estAutorisee: EstAutorisee,
	/**
	 * L'instance sait-elle sous quel domaine elle est servie ?
	 *
	 * Faux quand `APP_DOMAIN` n'est pas renseigné : `frontendUrl` retombe alors
	 * sur le nom d'hôte du conteneur, et la comparaison « est-ce moi ? » ne veut
	 * plus rien dire. On répond `true` plutôt que de bloquer — sans cette garde,
	 * une instance PRINCIPALE mal configurée se déclarait « non reconnue » à
	 * elle-même et n'affichait plus rien, là où seule sa connexion 42 était
	 * cassée. On ne répond pas à une question qu'on ne sait pas trancher.
	 */
	identiteEtablie = true
): Promise<boolean> {
	if (!identiteEtablie) return true;

	// Paramètre absent, ou d'un type inattendu (`?origin=a&origin=b` donne un
	// tableau) : on ne bloque pas ce qu'on n'a pas su lire comme une question.
	if (typeof origin !== 'string') return true;

	// Chaîne vide : c'est une question, posée avec une réponse impossible. Elle
	// ne peut pas valoir « pas de question » — sinon `?origin=` suffirait à
	// contourner le contrôle.
	const normalisee = normaliser(origin);
	if (normalisee === null) return false;

	return estAutorisee(normalisee);
}
