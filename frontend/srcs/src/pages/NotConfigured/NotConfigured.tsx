import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

/**
 * L'instance n'a pas encore reçu ses identifiants 42.
 *
 * Écran d'INFORMATION, sans aucune action possible : la configuration se fait
 * depuis le panneau d'administration, qui exige le token console affiché dans les
 * logs du serveur. Un visiteur ordinaire ne peut rien y faire, et c'est justement
 * ce qu'il faut lui dire — plutôt que de le laisser sur une page de connexion qui
 * échouerait sans explication.
 *
 * Remplace la redirection automatique vers `/admin/login`, qui envoyait tout le
 * monde sur un formulaire de token sans jamais dire pourquoi.
 */
const NotConfigured: React.FC = () => {
	const navigate = useNavigate();

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
					<span className="service-down__icon" aria-hidden="true">🛠️</span>
					<div>
						<span className="auth-badge">Installation à terminer</span>
						<h1 className="auth-title service-down__title">Application non configurée</h1>
					</div>
				</div>

				<p className="service-down__lead">
					Ce site n'a pas encore reçu ses identifiants d'application&nbsp;42.
				</p>

				<p className="service-down__reassure">
					La connexion&nbsp;42 restera indisponible tant qu'ils n'auront pas été renseignés.
					Rien à faire de votre côté&nbsp;: revenez un peu plus tard.
				</p>

				<div className="service-down__fix">
					<h2>Vous administrez ce site&nbsp;?</h2>
					<p>
						Ouvrez le panneau d'administration avec le <strong>token console</strong>, affiché
						dans les logs du serveur à chaque démarrage, puis renseignez le Client&nbsp;ID et
						le Client&nbsp;Secret de votre application&nbsp;42.
					</p>
				</div>

				<div className="service-down__actions">
					<button type="button" className="auth-cta" onClick={() => navigate('/admin/login')}>
						Accès au panneau admin
					</button>
				</div>
			</motion.main>
		</div>
	);
};

export default NotConfigured;
