import React from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header/Header';
import './Dashboard.scss';

const Dashboard: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="dashboard-page">
      <Header />
      <div className="dashboard-container">
        <motion.div
          className="welcome-section"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1>Bienvenue, {user?.login}!</h1>
          <p className="subtitle">
            Gérez votre progression et simulez vos validations RNCP
          </p>
        </motion.div>

        <motion.div
          className="dashboard-content"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="info-card">
            <h2>📊 Tableau de bord</h2>
            <p>Cette section est en cours de développement.</p>
            <p>Prochainement, vous pourrez :</p>
            <ul>
              <li>Voir votre niveau actuel : {user?.level || 'N/A'}</li>
              <li>Suivre votre progression vers les RNCP</li>
              <li>Simuler vos XP avec différents projets</li>
              <li>Valider vos prérequis (events, expérience pro, etc.)</li>
            </ul>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard;
