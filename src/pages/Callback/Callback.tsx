import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import './Callback.scss';

/**
 * Page de callback - Avec la nouvelle architecture, cette page n'est plus utilisée
 * car le backend redirige directement vers '/' avec le JWT en paramètre.
 * On garde cette page pour compatibilité, mais elle redirige simplement vers l'accueil.
 */
const Callback: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Rediriger immédiatement vers l'accueil
    // L'AuthContext gère automatiquement le JWT depuis l'URL
    navigate('/', { replace: true });
  }, [navigate]);

  return (
    <div className="callback-page">
      <motion.div
        className="callback-card"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="spinner" />
        <h2>Authentification en cours...</h2>
        <p>Veuillez patienter</p>
      </motion.div>
    </div>
  );
};

export default Callback;
