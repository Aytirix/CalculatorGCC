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
