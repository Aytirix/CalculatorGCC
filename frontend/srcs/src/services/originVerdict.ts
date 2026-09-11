/**
 * « Faut-il avertir, et faut-il désactiver la connexion ? »
 *
 * Une ligne, mais sortie du JSX à dessein. Un audit par mutation l'a montré trois
 * fois de suite : toute décision laissée dans un composant n'est vérifiable que
 * par une expression régulière sur le texte source, et une régex ne détecte que
 * l'édition des caractères qu'elle épingle. Insérer `false &&` DEVANT la
 * condition la laissait passer — la garde devenait inatteignable, le bandeau ne
 * s'affichait plus jamais, et la suite restait verte.
 *
 * `false` STRICT. `null` signifie « on ne sait pas » : réseau muet, instance
 * antérieure à ce contrôle, ou instance qui ne fait pas autorité (miroir
 * applicatif, domaine propre illisible). Avertir sur une incertitude, ce serait
 * refaire la faute qu'on corrige — affirmer sans avoir vérifié.
 */
export function origineRefusee(originAllowed: boolean | null): boolean {
	return originAllowed === false;
}

/**
 * L'adresse du site principal, déduite de l'API que le miroir relaie.
 *
 * `/api/health` d'un miroir porte `target` — l'URL de l'API relayée, chemin
 * compris (`https://exemple.fr/api`). `new URL(x).origin` en retire le chemin :
 * on obtient le site, pas l'API, et c'est ce qu'on met sous les yeux du visiteur.
 *
 * `null` sur tout ce qui n'est pas une URL exploitable : mieux vaut ne rien
 * proposer qu'un lien cassé, sur un bandeau qui existe pour éviter d'envoyer les
 * gens quelque part sans le dire.
 */
export function siteDepuisApi(target: unknown): string | null {
	if (typeof target !== 'string' || target.trim() === '') return null;
	try {
		const url = new URL(target.trim());
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
		return url.origin;
	} catch {
		return null;
	}
}
