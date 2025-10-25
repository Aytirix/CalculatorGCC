import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { storage } from '@/utils/storage';
import { Button } from '@/components/ui/button';
import Header from '@/components/Header/Header';
import './Settings.scss';

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    try {
      const data = storage.exportData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `42-xp-simulator-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setMessage({ type: 'success', text: 'Données exportées avec succès!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Export error:', error);
      setMessage({ type: 'error', text: 'Erreur lors de l\'exportation des données.' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      storage.importData(text);

      setMessage({ type: 'success', text: 'Données importées avec succès! Rechargement...' });
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      console.error('Import error:', error);
      setMessage({ type: 'error', text: 'Erreur lors de l\'importation. Fichier invalide.' });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    <div className="settings-page">
      <Header />
      <div className="settings-container">
        <motion.div
          className="settings-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Button 
            onClick={() => navigate('/dashboard')} 
            variant="ghost" 
            className="back-button-top"
            size="icon"
          >
            ←
          </Button>
          <h1>Paramètres</h1>
          
          <div className="settings-section">
            <h2>Gestion des données</h2>
            <p className="section-description">
              Exportez vos données pour créer une sauvegarde ou importez des données précédemment sauvegardées.
              Toutes les données sont chiffrées pour votre sécurité.
            </p>

            <div className="button-group">
              <Button onClick={handleExport} size="lg" className="action-button">
                📥 Exporter les données
              </Button>
              <Button onClick={handleImport} variant="outline" size="lg" className="action-button">
                📤 Importer les données
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>

            {message && (
              <motion.div
                className={`message ${message.type}`}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {message.text}
              </motion.div>
            )}
          </div>

          <div className="settings-section">
            <h2>À propos</h2>
            <p className="section-description">
              Ce simulateur vous permet de visualiser votre progression vers les différents RNCP
              de l'école 42. Les données sont stockées localement dans votre navigateur.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Settings;
