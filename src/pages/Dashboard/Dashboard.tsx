import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Header from '@/components/Header/Header';
import RNCPCard from '@/components/RNCPCard/RNCPCard';
import AddCustomProjectModal from '@/components/AddCustomProjectModal/AddCustomProjectModal';
import { RNCP_DATA } from '@/data/rncp.data';
import { BackendAPI42Service } from '@/services/backend-api42.service';
import { xpService } from '@/services/xp.service';
import { isProjectCompleted } from '@/utils/projectMatcher';
import type { SimulatorProject, RNCPValidation, UserProgress } from '@/types/rncp.types';
import './Dashboard.scss';

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userProgress, setUserProgress] = useState<UserProgress | null>(null);
  const [simulatedProjects, setSimulatedProjects] = useState<string[]>([]);
  const [simulatedSubProjects, setSimulatedSubProjects] = useState<Record<string, string[]>>({});
  const [projectPercentages, setProjectPercentages] = useState<Record<string, number>>({});
  const [completedProjectsPercentages, setCompletedProjectsPercentages] = useState<Record<string, number>>({});
  const [customProjects, setCustomProjects] = useState<SimulatorProject[]>([]);
  const [projectNotes, setProjectNotes] = useState<Record<string, string>>({});
  const [projectedLevel, setProjectedLevel] = useState<number>(0);
  const [selectedRNCPIndex, setSelectedRNCPIndex] = useState<number>(0);
  const [customProjectModal, setCustomProjectModal] = useState<{
    isOpen: boolean;
    editProject: SimulatorProject | null;
  }>({ isOpen: false, editProject: null });

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

    const savedPercentages = localStorage.getItem('project_percentages');
    if (savedPercentages) {
      try {
        const parsed = JSON.parse(savedPercentages);
        setProjectPercentages(parsed);
      } catch (err) {
        console.error('Erreur lors du chargement des pourcentages:', err);
      }
    }

    const savedCustomProjects = localStorage.getItem('custom_projects');
    if (savedCustomProjects) {
      try {
        const parsed = JSON.parse(savedCustomProjects);
        setCustomProjects(parsed);
      } catch (err) {
        console.error('Erreur lors du chargement des projets personnalisés:', err);
      }
    }

    const savedNotes = localStorage.getItem('project_notes');
    if (savedNotes) {
      try {
        const parsed = JSON.parse(savedNotes);
        setProjectNotes(parsed);
      } catch (err) {
        console.error('Erreur lors du chargement des notes:', err);
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

  // Sauvegarder les pourcentages dans localStorage
  useEffect(() => {
    if (Object.keys(projectPercentages).length > 0) {
      localStorage.setItem('project_percentages', JSON.stringify(projectPercentages));
    } else {
      localStorage.removeItem('project_percentages');
    }
  }, [projectPercentages]);

  // Sauvegarder les projets personnalisés dans localStorage
  useEffect(() => {
    if (customProjects.length > 0) {
      localStorage.setItem('custom_projects', JSON.stringify(customProjects));
    } else {
      localStorage.removeItem('custom_projects');
    }
  }, [customProjects]);

  // Sauvegarder les notes dans localStorage
  useEffect(() => {
    if (Object.keys(projectNotes).length > 0) {
      localStorage.setItem('project_notes', JSON.stringify(projectNotes));
    } else {
      localStorage.removeItem('project_notes');
    }
  }, [projectNotes]);

  const loadUserData = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);

      if (forceRefresh) {
        console.log('Force refresh requested - bypassing cache');
      }

      // Récupérer les données de l'utilisateur depuis le backend
      const userData = await BackendAPI42Service.getUserData(forceRefresh);
      
      // La liste des slugs des projets validés est déjà dans userData.projects
      const completedProjectSlugs = userData.projects;

      // Extraire les pourcentages réels (final_mark) de TOUS les projets validés
      // peu importe leur note (50%, 75%, 100%, 125%, etc.)
      const realPercentages: Record<string, number> = {};
      userData.allProjects.forEach((project) => {
        if (project.validated === true) {
          // Convertir la note sur 100 en pourcentage (125 max devient 125%)
          const percentage = Math.min(125, Math.max(0, project.final_mark || 100));
          // Utiliser project.name comme clé car c'est ce qui est retourné par l'API
          realPercentages[project.project.name] = percentage;
        }
      });
      setCompletedProjectsPercentages(realPercentages);
      
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
      const error = err as Error;
      console.error('Erreur lors du chargement des données utilisateur:', error);
      
      // Message d'erreur plus spécifique selon le type d'erreur
      let errorMessage = 'Impossible de charger vos données. Veuillez réessayer.';
      
      if (error.message?.includes('expired') || error.message?.includes('login again')) {
        errorMessage = 'Votre session a expiré. Vous allez être redirigé vers la page de connexion...';
        // La redirection est déjà gérée par le service
      } else if (error.message?.includes('rate limit')) {
        errorMessage = 'Limite de requêtes API 42 atteinte. Veuillez patienter quelques minutes.';
      }
      
      setError(errorMessage);
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
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { [projectId]: _removed, ...rest } = prev;
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

  const handlePercentageChange = (projectId: string, percentage: number) => {
    setProjectPercentages(prev => {
      if (percentage === 100) {
        // Si le pourcentage est 100%, le retirer du state
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [projectId]: _removed, ...rest } = prev;
        return rest;
      }
      return {
        ...prev,
        [projectId]: percentage,
      };
    });
  };

  const handleResetModifications = () => {
    if (window.confirm('Êtes-vous sûr de vouloir réinitialiser toutes les modifications (projets simulés et pourcentages personnalisés) ?')) {
      setSimulatedProjects([]);
      setSimulatedSubProjects({});
      setProjectPercentages({});
      localStorage.removeItem('simulated_projects');
      localStorage.removeItem('simulated_sub_projects');
      localStorage.removeItem('project_percentages');
    }
  };

  const handleAddCustomProject = (name: string, xp: number, percentage: number, note?: string) => {
    const newProject: SimulatorProject = {
      id: `custom-${Date.now()}`,
      name: name,
      xp: xp,
      slug: name.toLowerCase().replace(/\s+/g, '-'),
    };
    setCustomProjects(prev => [...prev, newProject]);
    
    // Ajouter automatiquement à la simulation
    setSimulatedProjects(prev => [...prev, newProject.id]);
    
    // Définir le pourcentage si différent de 100%
    if (percentage !== 100) {
      setProjectPercentages(prev => ({ ...prev, [newProject.id]: percentage }));
    }
    
    // Sauvegarder la note si elle existe
    if (note) {
      setProjectNotes(prev => ({ ...prev, [newProject.id]: note }));
    }
  };

  const handleEditCustomProject = (id: string, name: string, xp: number, percentage: number, note?: string) => {
    setCustomProjects(prev =>
      prev.map(project =>
        project.id === id
          ? { ...project, name, xp, slug: name.toLowerCase().replace(/\s+/g, '-') }
          : project
      )
    );
    
    // Mettre à jour le pourcentage
    if (percentage !== 100) {
      setProjectPercentages(prev => ({ ...prev, [id]: percentage }));
    } else {
      // Retirer le pourcentage s'il est à 100%
      setProjectPercentages(prev => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [id]: _removed, ...rest } = prev;
        return rest;
      });
    }
    
    // Mettre à jour ou supprimer la note
    if (note) {
      setProjectNotes(prev => ({ ...prev, [id]: note }));
    } else {
      setProjectNotes(prev => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [id]: _removed, ...rest } = prev;
        return rest;
      });
    }
  };

  const handleDeleteCustomProject = (id: string) => {
    setCustomProjects(prev => prev.filter(project => project.id !== id));
    
    // Retirer aussi de la simulation
    setSimulatedProjects(prev => prev.filter(projId => projId !== id));
  };

  const handleSaveNote = (projectId: string, note: string) => {
    if (note.trim()) {
      setProjectNotes(prev => ({ ...prev, [projectId]: note }));
    } else {
      // Supprimer la note si elle est vide
      setProjectNotes(prev => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [projectId]: _removed, ...rest } = prev;
        return rest;
      });
    }
  };

  const getCompletedProjects = (): SimulatorProject[] => {
    if (!userProgress) return [];
    
    const projects: SimulatorProject[] = [];
    const apiSlugs = userProgress.completedProjects;
    RNCP_DATA.forEach(rncp => {
      rncp.categories.forEach(category => {
        category.projects.forEach(project => {
          const projectSlug = project.slug || project.id;
          if (isProjectCompleted(projectSlug, apiSlugs)) {
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

    // Injecter les projets personnalisés dans la catégorie "Autres projets"
    const rncpDataWithCustom = RNCP_DATA.map(rncp => {
      if (rncp.id === 'rncp-global') {
        return {
          ...rncp,
          categories: rncp.categories.map(category => {
            if (category.id === 'other-projects') {
              return {
                ...category,
                projects: customProjects,
              };
            }
            return category;
          }),
        };
      }
      return rncp;
    });

    return rncpDataWithCustom.map(rncp => {
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

  // Injecter les projets personnalisés dans la catégorie "Autres projets"
  const rncpDataWithCustom = RNCP_DATA.map(rncp => {
    if (rncp.id === 'rncp-global') {
      return {
        ...rncp,
        categories: rncp.categories.map(category => {
          if (category.id === 'other-projects') {
            return {
              ...category,
              projects: customProjects,
            };
          }
          return category;
        }),
      };
    }
    return rncp;
  });

  const rncpValidations = getRNCPValidations();
  const completedProjects = getCompletedProjects();
  const simulatedProjectsDetails = getSimulatedProjectsDetails();
  const selectedRNCP = rncpDataWithCustom[selectedRNCPIndex];
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
            <div className="welcome-content">
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
            <div className="header-actions">
              <button 
                className="reset-button" 
                onClick={handleResetModifications} 
                title="Réinitialiser les modifications"
                disabled={simulatedProjects.length === 0 && Object.keys(simulatedSubProjects).length === 0 && Object.keys(projectPercentages).length === 0}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  <line x1="10" y1="11" x2="10" y2="17"/>
                  <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
              </button>
              <button className="refresh-button" onClick={() => loadUserData(true)} title="Rafraîchir les données">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                </svg>
              </button>
            </div>
          </div>
        </motion.div>

        {/* Onglets RNCP */}
        <motion.div
          className="rncp-tabs"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {rncpDataWithCustom.map((rncp, index) => {
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
            projectPercentages={projectPercentages}
            completedProjectsPercentages={completedProjectsPercentages}
            onPercentageChange={handlePercentageChange}
            customProjects={customProjects}
            onAddCustomProject={() => setCustomProjectModal({ isOpen: true, editProject: null })}
            onEditCustomProject={(project) => setCustomProjectModal({ isOpen: true, editProject: project })}
            onDeleteCustomProject={handleDeleteCustomProject}
            projectNotes={projectNotes}
            onSaveNote={handleSaveNote}
          />
        </motion.div>

        {/* Modal d'ajout/édition de projet personnalisé */}
        <AddCustomProjectModal
          isOpen={customProjectModal.isOpen}
          onClose={() => setCustomProjectModal({ isOpen: false, editProject: null })}
          onSave={(name, xp, percentage, note) => {
            if (customProjectModal.editProject) {
              handleEditCustomProject(customProjectModal.editProject.id, name, xp, percentage, note);
            } else {
              handleAddCustomProject(name, xp, percentage, note);
            }
          }}
          editProject={customProjectModal.editProject ? {
            ...customProjectModal.editProject,
            percentage: projectPercentages[customProjectModal.editProject.id] || 100,
            note: projectNotes[customProjectModal.editProject.id] || '',
          } : null}
        />
      </div>
    </div>
  );
};

export default Dashboard;
