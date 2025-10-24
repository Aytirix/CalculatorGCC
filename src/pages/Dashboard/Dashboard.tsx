import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Header from '@/components/Header/Header';
import RNCPCard from '@/components/RNCPCard/RNCPCard';
import { RNCP_DATA } from '@/data/rncp.data';
import { api42Service } from '@/services/api42.service';
import { authService } from '@/services/auth.service';
import { xpService } from '@/services/xp.service';
import type { SimulatorProject, RNCPValidation, UserProgress } from '@/types/rncp.types';
import './Dashboard.scss';

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userProgress, setUserProgress] = useState<UserProgress | null>(null);
  const [simulatedProjects, setSimulatedProjects] = useState<string[]>([]);
  const [simulatedSubProjects, setSimulatedSubProjects] = useState<Record<string, string[]>>({});
  const [projectedLevel, setProjectedLevel] = useState<number>(0);
  const [selectedRNCPIndex, setSelectedRNCPIndex] = useState<number>(0);

  // Charger les projets simulés depuis le localStorage
  useEffect(() => {
    const saved = localStorage.getItem('simulated_projects');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSimulatedProjects(parsed);
      } catch (err) {
        console.error('Erreur lors du chargement des projets simulés:', err);
      }
    }

    const savedSubProjects = localStorage.getItem('simulated_sub_projects');
    if (savedSubProjects) {
      try {
        const parsed = JSON.parse(savedSubProjects);
        setSimulatedSubProjects(parsed);
      } catch (err) {
        console.error('Erreur lors du chargement des sous-projets simulés:', err);
      }
    }
  }, []);

  // Sauvegarder les projets simulés dans localStorage
  useEffect(() => {
    if (simulatedProjects.length > 0) {
      localStorage.setItem('simulated_projects', JSON.stringify(simulatedProjects));
    } else {
      localStorage.removeItem('simulated_projects');
    }
  }, [simulatedProjects]);

  // Sauvegarder les sous-projets simulés dans localStorage
  useEffect(() => {
    if (Object.keys(simulatedSubProjects).length > 0) {
      localStorage.setItem('simulated_sub_projects', JSON.stringify(simulatedSubProjects));
    } else {
      localStorage.removeItem('simulated_sub_projects');
    }
  }, [simulatedSubProjects]);

  const loadUserData = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);

      // Si forceRefresh, vider le cache
      if (forceRefresh) {
        api42Service.clearCache();
      }

      // Récupérer le token d'accès
      const tokens = authService.getTokens();
      if (!tokens) {
        setError('Non authentifié');
        setLoading(false);
        return;
      }

      // Récupérer l'utilisateur
      const user = authService.getUser();
      if (!user) {
        setError('Utilisateur non trouvé');
        setLoading(false);
        return;
      }

      // Récupérer les données de l'utilisateur depuis l'API 42
      const userData = await api42Service.getUserData(tokens.access_token, user.id);
      
      // La liste des slugs des projets validés est déjà dans userData.projects
      const completedProjectSlugs = userData.projects;

      // Créer la progression utilisateur
      const progress: UserProgress = {
        currentLevel: userData.level,
        currentXP: xpService.getXPFromLevel(userData.level),
        events: userData.eventsCount,
        professionalExperience: 0, // À implémenter: extraction depuis l'API 42
        completedProjects: completedProjectSlugs,
        simulatedProjects: [],
      };

      setUserProgress(progress);
      setProjectedLevel(userData.level);
      setLoading(false);
    } catch (err) {
      console.error('Erreur lors du chargement des données utilisateur:', err);
      setError('Impossible de charger vos données. Veuillez réessayer.');
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUserData();
  }, []);

  // Mettre à jour le niveau projeté quand les projets simulés changent
  useEffect(() => {
    if (!userProgress) return;
    
    // Calculer l'XP total de tous les projets (complétés + simulés)
    let totalXP = userProgress.currentXP;
    
    // Utiliser un Set pour tracker les projets déjà comptés (éviter les doublons)
    const countedProjects = new Set<string>();
    
    // Pour chaque projet simulé sans sous-projets, ajouter son XP
    simulatedProjects.forEach(projectSlug => {
      // Trouver le projet dans les données RNCP (on s'arrête dès qu'on le trouve)
      for (const rncp of RNCP_DATA) {
        for (const category of rncp.categories) {
          const project = category.projects.find(p => p.slug === projectSlug || p.id === projectSlug);
          if (project && !project.subProjects && !countedProjects.has(project.id)) {
            totalXP += project.xp;
            countedProjects.add(project.id);
            console.log(`✅ Projet: ${project.name} +${project.xp} XP`);
            break; // On sort de la boucle des catégories
          }
        }
        if (countedProjects.has(projectSlug)) break; // On sort de la boucle des RNCPs
      }
    });

    // Pour les projets avec sous-projets, calculer l'XP en fonction des sous-projets validés
    Object.entries(simulatedSubProjects).forEach(([projectId, subProjectIds]) => {
      // On compte ce projet seulement s'il n'a pas déjà été compté
      if (countedProjects.has(projectId)) return;
      
      for (const rncp of RNCP_DATA) {
        for (const category of rncp.categories) {
          const project = category.projects.find(p => p.id === projectId);
          if (project && project.subProjects) {
            // Vérifier si tous les sous-projets sont validés
            const allSubProjectsValidated = project.subProjects.every(sub => 
              subProjectIds.includes(sub.id)
            );

            if (allSubProjectsValidated) {
              // Si tous les sous-projets sont validés, ajouter l'XP du projet principal
              console.log(`✅ Piscine complète: ${project.name} +${project.xp} XP`);
              totalXP += project.xp;
            }

            // Ajouter l'XP de chaque sous-projet validé individuellement
            subProjectIds.forEach(subId => {
              const subProject = project.subProjects?.find(s => s.id === subId);
              if (subProject && subProject.xp > 0) {
                console.log(`  📚 Sous-projet: ${subProject.name} +${subProject.xp} XP`);
                totalXP += subProject.xp;
              }
            });
            
            countedProjects.add(projectId);
            break; // On sort de la boucle des catégories
          }
        }
        if (countedProjects.has(projectId)) break; // On sort de la boucle des RNCPs
      }
    });

    console.log(`💡 XP Total calculé: ${totalXP}`);
    const newLevel = xpService.getLevelFromXP(totalXP);
    console.log(`📊 Niveau projeté: ${newLevel}`);
    setProjectedLevel(newLevel);
  }, [simulatedProjects, simulatedSubProjects, userProgress]);

  const handleToggleSimulation = (projectId: string) => {
    setSimulatedProjects(prev => {
      if (prev.includes(projectId)) {
        // Retirer le projet de la simulation
        return prev.filter(id => id !== projectId);
      } else {
        // Ajouter le projet à la simulation
        return [...prev, projectId];
      }
    });
  };

  const handleToggleSubProject = (projectId: string, subProjectId: string) => {
    setSimulatedSubProjects(prev => {
      const currentSubProjects = prev[projectId] || [];
      
      if (currentSubProjects.includes(subProjectId)) {
        // Retirer le sous-projet
        const newSubProjects = currentSubProjects.filter(id => id !== subProjectId);
        
        // Si plus aucun sous-projet n'est simulé, retirer l'entrée du projet
        if (newSubProjects.length === 0) {
          const { [projectId]: _, ...rest } = prev;
          return rest;
        }
        
        return {
          ...prev,
          [projectId]: newSubProjects,
        };
      } else {
        // Ajouter le sous-projet
        return {
          ...prev,
          [projectId]: [...currentSubProjects, subProjectId],
        };
      }
    });
  };

  const getCompletedProjects = (): SimulatorProject[] => {
    if (!userProgress) return [];
    
    const projects: SimulatorProject[] = [];
    RNCP_DATA.forEach(rncp => {
      rncp.categories.forEach(category => {
        category.projects.forEach(project => {
          if (userProgress.completedProjects.includes(project.slug || project.id)) {
            projects.push(project);
          }
        });
      });
    });
    return projects;
  };

  const getSimulatedProjectsDetails = (): SimulatorProject[] => {
    const projects: SimulatorProject[] = [];
    RNCP_DATA.forEach(rncp => {
      rncp.categories.forEach(category => {
        category.projects.forEach(project => {
          if (simulatedProjects.includes(project.slug || project.id)) {
            projects.push(project);
          }
        });
      });
    });
    return projects;
  };

  const getRNCPValidations = (): RNCPValidation[] => {
    if (!userProgress) return [];

    return RNCP_DATA.map(rncp => {
      return xpService.validateRNCP(
        rncp,
        projectedLevel,
        userProgress.events,
        userProgress.professionalExperience,
        userProgress.completedProjects,
        simulatedProjects
      );
    });
  };

  if (loading) {
    return (
      <div className="dashboard-page">
        <Header />
        <div className="dashboard-container">
          <div className="loading-state">
            <motion.div
              className="spinner"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
            <p>Chargement de vos données...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-page">
        <Header />
        <div className="dashboard-container">
          <div className="error-state">
            <p>{error}</p>
            <button onClick={() => loadUserData(true)}>Réessayer</button>
          </div>
        </div>
      </div>
    );
  }

  if (!userProgress) return null;

  const rncpValidations = getRNCPValidations();
  const completedProjects = getCompletedProjects();
  const simulatedProjectsDetails = getSimulatedProjectsDetails();
  const selectedRNCP = RNCP_DATA[selectedRNCPIndex];
  const selectedValidation = rncpValidations[selectedRNCPIndex];

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
          <div className="welcome-header">
            <div>
              <h1>Simulateur RNCP</h1>
              <div className="level-info">
                <div className="level-current">
                  <span className="label">Niveau actuel</span>
                  <span className="value">{userProgress.currentLevel.toFixed(2)}</span>
                </div>
                {(simulatedProjects.length > 0 || Object.keys(simulatedSubProjects).length > 0) && (
                  <>
                    <span className="arrow">→</span>
                    <div className="level-projected">
                      <span className="label">Niveau projeté</span>
                      <span className="value projected">{projectedLevel.toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>
              {(simulatedProjects.length > 0 || Object.keys(simulatedSubProjects).length > 0) && (
                <p className="simulation-info">
                  {simulatedProjects.length + Object.keys(simulatedSubProjects).length} projet{(simulatedProjects.length + Object.keys(simulatedSubProjects).length) > 1 ? 's' : ''} simulé{(simulatedProjects.length + Object.keys(simulatedSubProjects).length) > 1 ? 's' : ''}
                </p>
              )}
            </div>
            <button className="refresh-button" onClick={() => loadUserData(true)} title="Rafraîchir les données">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
              </svg>
            </button>
          </div>
        </motion.div>

        {/* Onglets RNCP */}
        <motion.div
          className="rncp-tabs"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {RNCP_DATA.map((rncp, index) => {
            const validation = rncpValidations[index];
            const isActive = selectedRNCPIndex === index;
            
            return (
              <button
                key={rncp.id}
                className={`rncp-tab ${isActive ? 'active' : ''} ${validation.overallValid ? 'validated' : ''}`}
                onClick={() => setSelectedRNCPIndex(index)}
              >
                <div className="rncp-tab__content">
                  {validation.overallValid && <span className="rncp-tab__check">✓</span>}
                  <div className="rncp-tab__info">
                    <h3 className="rncp-tab__title">{rncp.name}</h3>
                  </div>
                </div>
              </button>
            );
          })}
        </motion.div>

        {/* Contenu du RNCP sélectionné */}
        <motion.div
          className="dashboard-content"
          key={selectedRNCPIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          <RNCPCard
            rncp={selectedRNCP}
            validation={selectedValidation}
            userProgress={{
              currentLevel: projectedLevel,
              events: userProgress.events,
              professionalExperience: userProgress.professionalExperience,
            }}
            completedProjects={completedProjects}
            simulatedProjects={simulatedProjectsDetails}
            onToggleSimulation={handleToggleSimulation}
            simulatedSubProjects={simulatedSubProjects}
            onToggleSubProject={handleToggleSubProject}
          />
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard;
