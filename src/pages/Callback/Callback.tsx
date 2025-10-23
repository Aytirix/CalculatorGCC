import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import './Callback.scss';

const Callback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Éviter les appels multiples
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const handleCallback = async () => {
      const code = searchParams.get('code');
      const errorParam = searchParams.get('error');

      if (errorParam) {
        setError('Authentication failed. Please try again.');
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      if (!code) {
        setError('No authorization code received.');
        setTimeout(() => navigate('/'), 3000);
        return;
      }

      try {
        await login(code);
        navigate('/dashboard', { replace: true });
      } catch (err) {
        console.error('Login error:', err);
        setError('Failed to complete authentication. Please try again.');
        setTimeout(() => navigate('/'), 3000);
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="callback-page">
      <motion.div
        className="callback-card"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {error ? (
          <>
            <div className="error-icon">⚠️</div>
            <h2>Erreur</h2>
            <p>{error}</p>
          </>
        ) : (
          <>
            <div className="spinner" />
            <h2>Authentification en cours...</h2>
            <p>Veuillez patienter</p>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default Callback;
