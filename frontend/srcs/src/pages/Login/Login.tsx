import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import './Login.scss';

/**
 * Page d'accueil des visiteurs non connectés.
 *
 * Elle ne se contente plus d'un bouton posé au milieu : avant de demander à
 * quelqu'un d'autoriser l'application sur son compte 42, autant lui dire ce
 * qu'elle fait et ce qu'elle lit.
 */

const FEATURES: { icon: string; title: string; text: string }[] = [
	{
		icon: '◎',
		title: 'Simulateur RNCP',
		text: "Coche les projets que tu comptes faire et vois ton niveau projeté, avec l'XP réel de l'API 42.",
	},
	{
		icon: '✳',
		title: 'Holy Graph',
		text: 'Le graphe officiel de 42, avec ton avancement, les prérequis de chaque projet et ses détails.',
	},
	{
		icon: '☰',
		title: 'Ton parcours',
		text: 'Tout ce que tu as validé, raté, commencé ou prévu, dans une liste filtrable.',
	},
	{
		icon: '▤',
		title: 'Calendrier',
		text: 'Étale tes projets dans le temps pour préparer une échéance RNCP ou une alternance.',
	},
];

const Login: React.FC = () => {
	const { login } = useAuth();
	const navigate = useNavigate();

	return (
		<div className="auth-page login-page">
			{/* Accès administrateur discret : authentification autonome (passkey / token
			    console), indépendante d'OAuth 42. */}
			<button
				type="button"
				className="login-admin-link"
				onClick={() => navigate('/admin/login')}
				title="Accès administrateur"
				aria-label="Accès administrateur"
			>
				⚙
			</button>

			<div className="auth-aurora" aria-hidden="true" />

			<div className="login-layout">
				<motion.section
					className="login-intro"
					initial={{ opacity: 0, y: 24 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.45 }}
				>
					<span className="auth-badge login-badge">Pour les étudiants de 42</span>
					<h1 className="auth-title login-title">
						Calculator<span>GCC</span>
					</h1>
					<p className="login-tagline">
						Simule ta progression, ton niveau et tes validations RNCP à partir de tes vraies
						données 42.
					</p>

					<motion.button
						type="button"
						className="auth-cta login-cta"
						onClick={login}
						whileHover={{ scale: 1.02 }}
						whileTap={{ scale: 0.98 }}
					>
						Se connecter avec 42
					</motion.button>

					<p className="auth-note login-note">
						Connexion via l'intra 42. L'application lit tes projets, ton niveau et tes
						événements — elle n'écrit jamais rien sur ton compte.
					</p>
				</motion.section>

				<motion.ul
					className="login-features"
					initial={{ opacity: 0, y: 24 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.45, delay: 0.12 }}
				>
					{FEATURES.map((feature) => (
						<li key={feature.title} className="login-feature">
							<span className="login-feature__icon" aria-hidden="true">{feature.icon}</span>
							<div>
								<h2>{feature.title}</h2>
								<p>{feature.text}</p>
							</div>
						</li>
					))}
				</motion.ul>
			</div>
		</div>
	);
};

export default Login;
