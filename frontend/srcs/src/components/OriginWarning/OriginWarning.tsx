import React, { useEffect, useState } from 'react';
import { setupService } from '../../services/setup.service';
import './OriginWarning.scss';

/**
 * L'adresse d'où l'on consulte le site n'est pas déclarée sur le serveur qui
 * traite la connexion 42.
 *
 * Conséquence concrète, et c'est la seule qui compte pour le visiteur : cliquer
 * « Se connecter » le déposerait sur l'AUTRE site, sans un mot. Le serveur ne
 * refuse pas — il retombe en silence sur son propre domaine.
 *
 * BANDEAU et non écran plein. L'écran plein a été livré puis retiré en audit : il
 * suffisait qu'un miroir soit servi sur un port ou un schéma différent de son
 * `APP_DOMAIN` — le cas par défaut de `docker-compose.mirror.yml`, qui publie un
 * port en clair — pour que tout le site s'éteigne alors que seule la connexion
 * était cassée. Le remède était pire que le mal, deux fois de suite. Ici
 * l'information passe, le site reste utilisable, et le bouton de connexion est
 * désactivé là où il mentirait.
 *
 * Le libellé évite « miroir » : la même réponse survient sur une instance
 * principale dont l'`APP_DOMAIN` ne correspond pas au domaine réellement servi, et
 * parler de miroir y serait faux.
 */
/**
 * La phrase qui donne l'issue au visiteur, quand on connaît le site principal.
 *
 * Sous-composant à dessein : le composant parent ne la rend qu'au retour d'une
 * requête, dans un `useEffect` — or les tests de ce dépôt rendent en
 * `renderToStaticMarkup`, qui n'exécute pas les effets. Isolée, la branche
 * s'éprouve par son résultat, avec et sans adresse.
 */
export const LienSitePrincipal: React.FC<{ site: string | null }> = ({ site }) => {
	if (!site) return null;
	return (
		<>
			{' '}Pour vous connecter, allez sur{' '}
			<a className="origin-warning__lien" href={site}>
				{site}
			</a>
			.
		</>
	);
};

const OriginWarning: React.FC = () => {
	const origine = typeof window !== 'undefined' ? window.location.origin : '';
	// L'adresse du site principal, pour que le visiteur ait une issue plutôt qu'un
	// constat. Elle n'est connue qu'au retour d'une requête, donc absente du
	// premier rendu : le bandeau se suffit à lui-même sans elle.
	const [sitePrincipal, setSitePrincipal] = useState<string | null>(null);

	useEffect(() => {
		let vivant = true;
		setupService.sitePrincipal().then((site) => {
			if (vivant) setSitePrincipal(site);
		});
		return () => {
			vivant = false;
		};
	}, []);

	return (
		<div className="origin-warning" role="status">
			<span className="origin-warning__icon" aria-hidden="true">⚠️</span>
			<div>
				<p className="origin-warning__text">
					La connexion&nbsp;42 ne peut pas aboutir depuis cette adresse&nbsp;: elle n'est pas
					déclarée sur le serveur qui la traite. Vous y seriez renvoyé sans explication.
					<LienSitePrincipal site={sitePrincipal} />
				</p>
				<p className="origin-warning__detail">
					Vous administrez ce site&nbsp;? Ajoutez <code>{origine}</code> aux
					«&nbsp;Origines autorisées&nbsp;» du panneau d'administration du serveur principal.
				</p>
			</div>
		</div>
	);
};

export default OriginWarning;
