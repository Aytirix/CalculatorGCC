import React from 'react';
import { motion } from 'framer-motion';

/**
 * Ce miroir n'est pas déclaré sur l'instance principale.
 *
 * Un miroir sert le site et relaie `/api` vers l'instance principale, mais la
 * connexion 42 doit REVENIR ici : le miroir joint son origine à la demande, et
 * l'instance principale ne l'accepte que si elle y est déclarée. Sinon elle
 * retombe en silence sur son propre domaine — le visiteur cliquait « Se
 * connecter » et se retrouvait sur l'autre site, sans un mot d'explication.
 *
 * Écran d'INFORMATION, sans action possible : la correction se fait sur
 * l'instance PRINCIPALE, où ce visiteur n'a probablement aucun droit. Le bouton
 * d'administration de `NotConfigured` n'aurait donc rien à ouvrir ici — le
 * panneau de ce miroir ne peut pas déclarer sa propre origine.
 *
 * Normalement inatteignable : `nginx/entrypoint.sh` refuse de démarrer un miroir
 * non déclaré. Cette page couvre ce que le démarrage ne peut pas voir — une
 * origine RÉVOQUÉE depuis le panneau alors que le miroir tourne déjà.
 */
const OriginNotAllowed: React.FC = () => {
	return (
		<div className="auth-page">
			<div className="auth-aurora" aria-hidden="true" />
			<motion.main
				className="service-down"
				role="alert"
				initial={{ opacity: 0, y: 16 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.35 }}
			>
				<div className="service-down__header">
					<span className="service-down__icon" aria-hidden="true">🪞</span>
					<div>
						<span className="auth-badge">Miroir non reconnu</span>
						<h1 className="auth-title service-down__title">Ce site n'est pas relié</h1>
					</div>
				</div>

				<p className="service-down__lead">
					Cette copie du simulateur n'est pas déclarée auprès du serveur principal.
				</p>

				<p className="service-down__reassure">
					La connexion&nbsp;42 vous renverrait sur l'autre site au lieu de vous ramener ici.
					Elle est donc bloquée tant que le lien n'est pas rétabli. Rien à faire de votre
					côté&nbsp;: revenez plus tard, ou passez par le site principal.
				</p>

				<div className="service-down__fix">
					<h2>Vous administrez ce miroir&nbsp;?</h2>
					<p>
						La déclaration se fait sur l'<strong>instance principale</strong>, pas ici&nbsp;:
						panneau d'administration → <strong>Origines autorisées</strong> → ajouter
						l'adresse publique de ce miroir, exactement telle qu'elle apparaît dans la barre
						d'adresse (<code>{window.location.origin}</code>).
					</p>
				</div>
			</motion.main>
		</div>
	);
};

export default OriginNotAllowed;
