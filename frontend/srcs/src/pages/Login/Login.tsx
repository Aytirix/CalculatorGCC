import React from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/useAuth';
import { Button } from '@/components/ui/button';
import './Login.scss';

const Login: React.FC = () => {
	const { login } = useAuth();

	return (
		<div className="login-page">
			<motion.div
				className="login-card"
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.5 }}
			>
				<h1>CalculatorGCC</h1>
				<p className="subtitle">Simulez votre progression et vos validations RNCP</p>
				
				<motion.div
					whileHover={{ scale: 1.05 }}
					whileTap={{ scale: 0.95 }}
				>
					<Button onClick={login} size="lg" className="login-button">
						Se connecter avec 42
					</Button>
				</motion.div>
			</motion.div>
		</div>
	);
};

export default Login;
