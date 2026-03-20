import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import Header from '@/components/Header/Header';
import RNCPCard from '@/components/RNCPCard/RNCPCard';
import AddCustomProjectModal from '@/components/AddCustomProjectModal/AddCustomProjectModal';
import AddExperienceModal from '@/components/AddExperienceModal/AddExperienceModal';
import { RNCP_DATA } from '@/data/rncp.data';
import { BackendAPI42Service } from '@/services/backend-api42.service';
import type { Project42 } from '@/services/backend-api42.service';
import { xpService } from '@/services/xp.service';
import { isProjectCompleted, matchesProject } from '@/utils/projectMatcher';
import { professionalExperienceStorage } from '@/utils/professionalExperienceStorage';
import { simulationService } from '@/services/simulation.service';
import type { SimulationData } from '@/services/simulation.service';
import ProfExpList from '@/components/ProfExpList/ProfExpList';
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
  const [coalitionBoosts, setCoalitionBoosts] = useState<Record<string, boolean>>({});
  const [completedSubProjects, setCompletedSubProjects] = useState<Record<string, string[]>>({});
  const [projectedLevel, setProjectedLevel] = useState<number>(0);
  const [selectedRNCPIndex, setSelectedRNCPIndex] = useState<number>(0);
  const [customProjectModal, setCustomProjectModal] = useState<{
    isOpen: boolean;
    editProject: SimulatorProject | null;
  }>({ isOpen: false, editProject: null });
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [apiStages, setApiStages] = useState<Project42[]>([]);
  const [showProfExpForm, setShowProfExpForm] = useState<'stage' | 'alternance' | null>(null);
  const [apiExpPercentages, setApiExpPercentages] = useState<Record<number, number>>(() => {
    const saved = localStorage.getItem('api_exp_percentages');
    return saved ? JSON.parse(saved) : {};
  });
  const [editingExperience, setEditingExperience] = useState<import('@/pages/ProfessionalExperience/ProfessionalExperience').ProfessionalExperience | null>(null);
  const [manualExperiences, setManualExperiences] = useState(() => professionalExperienceStorage.getAll());

  // Flag pour éviter de sauvegarder pendant le chargement initial
  const isInitialLoad = useRef(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Charger les données de simulation (backend puis fallback localStorage)
  useEffect(() => {
    const loadSimulation = async () => {
      try {
        const data = await simulationService.load();
        // Reconstituer l'état depuis les données backend
        const projectIds = data.simulatedProjects.map((p) => p.projectId);
        const percentages: Record<string, number> = {};
        const boosts: Record<string, boolean> = {};
        const notes: Record<string, string> = {};
        for (const p of data.simulatedProjects) {
          percentages[p.projectId] = p.percentage;
          if (p.coalitionBoost) boosts[p.projectId] = true;
          if (p.note) notes[p.projectId] = p.note;
        }
        setSimulatedProjects(projectIds);
        setProjectPercentages(percentages);
        setCoalitionBoosts(boosts);
        setProjectNotes(notes);
        setSimulatedSubProjects(data.simulatedSubProjects ?? {});
        setCustomProjects((data.customProjects as SimulatorProject[]) ?? []);
        if (data.apiExpPercentages && Object.keys(data.apiExpPercentages).length > 0) {
          const numericKeys: Record<number, number> = {};
          for (const [k, v] of Object.entries(data.apiExpPercentages)) {
            numericKeys[Number(k)] = v;
          }
          setApiExpPercentages(numericKeys);
        }
        if (Array.isArray(data.manualExperiences) && data.manualExperiences.length > 0) {
          professionalExperienceStorage.saveAll(data.manualExperiences as any);
          setManualExperiences(professionalExperienceStorage.getAll());
        }
        console.log('[Dashboard] Simulation chargée depuis le backend');
        // Sync localStorage aussi
        localStorage.setItem('simulated_projects', JSON.stringify(projectIds));
        localStorage.setItem('simulated_sub_projects', JSON.stringify(data.simulatedSubProjects ?? {}));
        localStorage.setItem('project_percentages', JSON.stringify(percentages));
        localStorage.setItem('custom_projects', JSON.stringify(data.customProjects ?? []));
        localStorage.setItem('project_notes', JSON.stringify(notes));
        localStorage.setItem('coalition_boosts', JSON.stringify(boosts));
        localStorage.setItem('api_exp_percentages', JSON.stringify(data.apiExpPercentages ?? {}));
      } catch (err) {
        console.warn('[Dashboard] Backend indisponible, chargement depuis localStorage', err);
        // Fallback localStorage
        loadFromLocalStorage();
      }
      isInitialLoad.current = false;
    };

    const loadFromLocalStorage = () => {
      const saved = localStorage.getItem('simulated_projects');
      if (saved) try { setSimulatedProjects(JSON.parse(saved)); } catch {}

      const savedSub = localStorage.getItem('simulated_sub_projects');
      if (savedSub) try { setSimulatedSubProjects(JSON.parse(savedSub)); } catch {}

      const savedPct = localStorage.getItem('project_percentages');
      if (savedPct) try { setProjectPercentages(JSON.parse(savedPct)); } catch {}

      const savedCustom = localStorage.getItem('custom_projects');
      if (savedCustom) try { setCustomProjects(JSON.parse(savedCustom)); } catch {}

      const savedNotes = localStorage.getItem('project_notes');
      if (savedNotes) try { setProjectNotes(JSON.parse(savedNotes)); } catch {}

      const savedBoosts = localStorage.getItem('coalition_boosts');
      if (savedBoosts) try { setCoalitionBoosts(JSON.parse(savedBoosts)); } catch {}
    };

    loadSimulation();
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

  // Sauvegarder la simulation vers le backend (debounced 2s)
  const saveToBackend = useCallback(() => {
    if (isInitialLoad.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const data: SimulationData = {
          simulatedProjects: simulatedProjects.map((id: string) => ({
            projectId: id,
            percentage: projectPercentages[id] ?? 100,
            coalitionBoost: coalitionBoosts[id] ?? false,
            note: projectNotes[id],
          })),
          simulatedSubProjects,
          customProjects,
          manualExperiences: professionalExperienceStorage.getAll(),
          apiExpPercentages,
        };
        await simulationService.save(data);
        console.log('[Dashboard] Simulation sauvegardée vers le backend');
      } catch (err) {
        console.warn('[Dashboard] Erreur sauvegarde backend:', err);
      }
    }, 2000);
  }, [simulatedProjects, simulatedSubProjects, projectPercentages, coalitionBoosts, projectNotes, customProjects, apiExpPercentages]);

  useEffect(() => {
    saveToBackend();
  }, [saveToBackend]);

  const stageFilter = (p: Project42) => {
    const slug = p.project.slug?.toLowerCase() || '';
    const name = p.project.name?.toLowerCase() || '';
    return slug.includes('stage') || slug.includes('alternance') ||
      slug.includes('internship') || slug.startsWith('work-experience') ||
      slug.startsWith('fr-alternance') ||
      name.includes('stage') || name.includes('alternance') ||
      name.includes('internship') || name.includes('work experience');
  };

  // Compte les stages/alternances API principaux validés
  const countApiProfExp = (allProjects: Project42[]) => {
    return allProjects.filter(p => {
      if (!stageFilter(p)) return false;
      if (!p.validated) return false;
      const slug = p.project.slug?.toLowerCase() || '';
      const name = p.project.name.toLowerCase();
      // Exclure les sous-évaluations
      if (slug.startsWith('work-experience-') && slug.includes('-work-experience-', 16)) return false;
      if (name.includes('évaluation') || name.includes('evaluation')) return false;
      if (name.includes('peer video') || name.includes('contract upload') || name.includes('duration')) return false;
      return true;
    }).length;
  };

  // Calcule quels sous-projets sont validés individuellement via l'API
  const computeCompletedSubProjects = (completedProjectSlugs: string[]): Record<string, string[]> => {
    const result: Record<string, string[]> = {};
    RNCP_DATA.forEach(rncp => {
      rncp.categories.forEach(cat => {
        cat.projects.forEach(p => {
          if (p.subProjects && p.subProjects.length > 0) {
            const completedSubs = p.subProjects
              .filter(sub => isProjectCompleted(sub.slug || sub.id, completedProjectSlugs))
              .map(sub => sub.id);
            if (completedSubs.length > 0) {
              result[p.id] = completedSubs;
            }
          }
        });
      });
    });
    return result;
  };

  const loadUserData = async (forceRefresh = false) => {
    try {
      // Throttle : éviter les appels trop rapprochés (moins de 30 secondes)
      const now = Date.now();
      const timeSinceLastFetch = now - lastFetchTime;
      const MIN_FETCH_INTERVAL = 30 * 1000; // 30 secondes minimum entre deux fetch
      
      if (timeSinceLastFetch < MIN_FETCH_INTERVAL && !forceRefresh) {
        console.log(`[Dashboard] ⚠️  Throttle: only ${Math.round(timeSinceLastFetch / 1000)}s since last fetch, skipping...`);
        return;
      }
      
      // Si forceRefresh mais que le dernier fetch est très récent (< 10s), refuser
      if (forceRefresh && timeSinceLastFetch < 10000) {
        console.log(`[Dashboard] ⚠️  Force refresh denied: only ${Math.round(timeSinceLastFetch / 1000)}s since last fetch`);
        setError('Veuillez attendre quelques secondes avant de rafraîchir à nouveau.');
        setTimeout(() => setError(null), 3000);
        return;
      }
      
      setLoading(true);
      setError(null);
      setLastFetchTime(now);

      // Vérifier le cache localStorage d'abord
      const CACHE_KEY = 'user_data_cache';
      const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 jours
      const CACHE_MIN_AGE = 10 * 60 * 1000; // 10 minutes minimum avant de permettre un refresh
      
      const cachedData = localStorage.getItem(CACHE_KEY);
      if (cachedData) {
        try {
          const { data, timestamp } = JSON.parse(cachedData);
          const age = Date.now() - timestamp;
          
          // Si le cache a moins de 10 minutes, TOUJOURS l'utiliser (même avec forceRefresh)
          // pour éviter de spam l'API 42
          if (age < CACHE_MIN_AGE) {
            console.log(`[Dashboard] ⚠️  Cache too fresh (${Math.round(age / 1000)}s / ${Math.round(CACHE_MIN_AGE / 1000)}s min), refusing to bypass - preventing rate limit`);
            const userData = data;
            
            // Traiter les données cachées
            const completedProjectSlugs = userData.projects;
            const realPercentages: Record<string, number> = {};
            (userData.allProjects as Array<{ validated: boolean; final_mark?: number; project: { name: string } }>).forEach((project) => {
              if (project.validated === true) {
                const percentage = Math.min(125, Math.max(0, project.final_mark || 100));
                realPercentages[project.project.name] = percentage;
              }
            });
            setCompletedProjectsPercentages(realPercentages);
            setCompletedSubProjects(computeCompletedSubProjects(completedProjectSlugs));
            setApiStages((userData.allProjects as Project42[]).filter(stageFilter));

            const professionalExpXP = professionalExperienceStorage.getRealXP();
            const professionalExpCount = professionalExperienceStorage.getRealCount() + countApiProfExp(userData.allProjects);
            const progress: UserProgress = {
              currentLevel: userData.level,
              currentXP: xpService.getXPFromLevel(userData.level),
              events: userData.eventsCount,
              professionalExperience: professionalExpCount,
              completedProjects: completedProjectSlugs,
              simulatedProjects: [],
            };

            setUserProgress(progress);
            setProjectedLevel(xpService.getLevelFromXP(xpService.getXPFromLevel(userData.level) + professionalExpXP));
            setLoading(false);
            return;
          }

          // Si pas de forceRefresh et cache valide, l'utiliser
          if (!forceRefresh && age < CACHE_TTL) {
            console.log(`[Dashboard] Using cached data (age: ${Math.round(age / 1000)}s)`);
            const userData = data;

            // Traiter les données cachées (même logique qu'après l'API)
            const completedProjectSlugs = userData.projects;
            const realPercentages: Record<string, number> = {};
            (userData.allProjects as Array<{ validated: boolean; final_mark?: number; project: { name: string } }>).forEach((project) => {
              if (project.validated === true) {
                const percentage = Math.min(125, Math.max(0, project.final_mark || 100));
                realPercentages[project.project.name] = percentage;
              }
            });
            setCompletedProjectsPercentages(realPercentages);
            setCompletedSubProjects(computeCompletedSubProjects(completedProjectSlugs));
            setApiStages((userData.allProjects as Project42[]).filter(stageFilter));

            const professionalExpXP = professionalExperienceStorage.getRealXP();
            const professionalExpCount = professionalExperienceStorage.getRealCount() + countApiProfExp(userData.allProjects);
            const progress: UserProgress = {
              currentLevel: userData.level,
              currentXP: xpService.getXPFromLevel(userData.level),
              events: userData.eventsCount,
              professionalExperience: professionalExpCount,
              completedProjects: completedProjectSlugs,
              simulatedProjects: [],
            };
            
            setUserProgress(progress);
            setProjectedLevel(xpService.getLevelFromXP(xpService.getXPFromLevel(userData.level) + professionalExpXP));
            setLoading(false);
            return; // Sortir sans appeler l'API
          }
          
          // Cache expiré
          if (age >= CACHE_TTL) {
            console.log('[Dashboard] Cache expired, fetching fresh data');
            localStorage.removeItem(CACHE_KEY);
          } else if (forceRefresh) {
            console.log('[Dashboard] Force refresh requested (cache older than 10 minutes) - fetching fresh data');
          }
        } catch (err) {
          console.error('[Dashboard] Error reading cache:', err);
          localStorage.removeItem(CACHE_KEY);
        }
      }

      // Récupérer les données de l'utilisateur depuis le backend
      console.log('[Dashboard] Fetching data from backend...');
      const userData = await BackendAPI42Service.getUserData(forceRefresh);
      
      // Mettre en cache
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: userData,
        timestamp: Date.now(),
      }));
      console.log('[Dashboard] Data cached in localStorage');
      
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
      setCompletedSubProjects(computeCompletedSubProjects(completedProjectSlugs));
      const filtered = userData.allProjects.filter(stageFilter);
      setApiStages(filtered);

      // Créer la progression utilisateur
      const professionalExpXP = professionalExperienceStorage.getRealXP();
      const professionalExpCount = professionalExperienceStorage.getRealCount() + countApiProfExp(userData.allProjects);
      const progress: UserProgress = {
        currentLevel: userData.level,
        currentXP: xpService.getXPFromLevel(userData.level),
        events: userData.eventsCount,
        professionalExperience: professionalExpCount,
        completedProjects: completedProjectSlugs,
        simulatedProjects: [],
      };

      setUserProgress(progress);
      setProjectedLevel(xpService.getLevelFromXP(xpService.getXPFromLevel(userData.level) + professionalExpXP));
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

    // Écouter les changements du localStorage pour les expériences professionnelles
    const handleStorageChange = () => {
      // Recalculer le niveau avec les nouvelles expériences
      if (userProgress) {
        const professionalExpXP = professionalExperienceStorage.getTotalXP();
        const totalXP = userProgress.currentXP + professionalExpXP;
        const newLevel = xpService.getLevelFromXP(totalXP);
        setProjectedLevel(newLevel);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            // Appliquer le pourcentage personnalisé si présent
            const percentage = projectPercentages[project.id] ?? 100;
            let addedXP = Math.round((project.xp * percentage) / 100);

            // Appliquer le boost coalition si activé pour ce projet
            if (coalitionBoosts[project.id]) {
              addedXP = Math.round(addedXP * 1.042);
            }

            totalXP += addedXP;
            countedProjects.add(project.id);
            console.log(`✅ Projet: ${project.name} +${addedXP} XP (base: ${project.xp}, %: ${percentage}, boost: ${coalitionBoosts[project.id] ? 'yes' : 'no'})`);
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
              let addedXP = project.xp;

              // Appliquer le pourcentage personnalisé si présent (rare pour les piscines)
              const percentage = projectPercentages[project.id] ?? 100;
              addedXP = Math.round((addedXP * percentage) / 100);

              // Appliquer le boost coalition si activé
              if (coalitionBoosts[project.id]) {
                addedXP = Math.round(addedXP * 1.042);
              }

              totalXP += addedXP;
            } else {
              // Ajouter l'XP de chaque sous-projet validé individuellement (partiel)
              subProjectIds.forEach(subId => {
                const subProject = project.subProjects?.find(s => s.id === subId);
                if (subProject && subProject.xp > 0) {
                  totalXP += subProject.xp;
                }
              });
            }

            countedProjects.add(projectId);
            break; // On sort de la boucle des catégories
          }
        }
        if (countedProjects.has(projectId)) break; // On sort de la boucle des RNCPs
      }
    });

    // Ajouter l'XP des expériences professionnelles manuelles
    const professionalExperiencesXP = professionalExperienceStorage.getTotalXP();
    totalXP += professionalExperiencesXP;

    // Ajouter l'XP des alternances API en cours (avec % éditable)
    const isEval = (name: string) => name.toLowerCase().includes('évaluation') || name.toLowerCase().includes('evaluation');
    const apiEntries = apiStages.filter(p => !isEval(p.project.name) && !p.validated && p.project.name.toLowerCase().includes('alternance'));
    for (const p of apiEntries) {
      const evalsForEntry = apiStages.filter(e => isEval(e.project.name) && (p.created_at ? new Date(p.created_at).getFullYear() : 0) === (e.created_at ? new Date(e.created_at).getFullYear() : 0));
      const marks = evalsForEntry.map(e => e.final_mark).filter((m): m is number => m != null);
      const defaultPct = marks.length > 0 ? Math.min(100, Math.round(marks.reduce((a, b) => a + b, 0) / marks.length)) : 100;
      const pct = apiExpPercentages[p.id] ?? defaultPct;
      const nameL = p.project.name.toLowerCase();
      const match = nameL.match(/(\d+)\s*an/);
      const years = match ? parseInt(match[1]) : 1;
      totalXP += Math.round(90000 * years * (pct / 100));
    }

    const newLevel = xpService.getLevelFromXP(totalXP);
    setProjectedLevel(newLevel);
  }, [simulatedProjects, simulatedSubProjects, userProgress, projectPercentages, coalitionBoosts, apiStages, apiExpPercentages]);

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
    if (window.confirm('Êtes-vous sûr de vouloir réinitialiser toutes les modifications (projets simulés, pourcentages, notes, boosts et projets personnalisés) ?')) {
      setSimulatedProjects([]);
      setSimulatedSubProjects({});
      setProjectPercentages({});
      setCustomProjects([]);
      setProjectNotes({});
      setCoalitionBoosts({});
      localStorage.removeItem('simulated_projects');
      localStorage.removeItem('simulated_sub_projects');
      localStorage.removeItem('project_percentages');
      localStorage.removeItem('custom_projects');
      localStorage.removeItem('project_notes');
      localStorage.removeItem('coalition_boosts');
      // Le debounced save enverra l'état vide au backend automatiquement
    }
  };

  const handleAddCustomProject = (name: string, xp: number, percentage: number, note?: string, hasCoalitionBoost?: boolean) => {
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

    // Sauvegarder le boost coalition si activé
    if (hasCoalitionBoost) {
      setCoalitionBoosts(prev => {
        const newBoosts = { ...prev, [newProject.id]: true };
        localStorage.setItem('coalition_boosts', JSON.stringify(newBoosts));
        return newBoosts;
      });
    }
  };

  const handleEditCustomProject = (id: string, name: string, xp: number, percentage: number, note?: string, hasCoalitionBoost?: boolean) => {
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

    // Mettre à jour le boost coalition
    setCoalitionBoosts(prev => {
      const newBoosts = { ...prev };
      if (hasCoalitionBoost) {
        newBoosts[id] = true;
      } else {
        delete newBoosts[id];
      }
      localStorage.setItem('coalition_boosts', JSON.stringify(newBoosts));
      return newBoosts;
    });
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

  const handleToggleCoalitionBoost = (projectId: string) => {
    setCoalitionBoosts(prev => {
      const newBoosts = { ...prev, [projectId]: !prev[projectId] };
      localStorage.setItem('coalition_boosts', JSON.stringify(newBoosts));
      return newBoosts;
    });
  };

  const getCompletedProjects = (): SimulatorProject[] => {
    if (!userProgress) return [];

    const projects: SimulatorProject[] = [];
    const apiSlugs = userProgress.completedProjects;
    const matchedApiSlugs = new Set<string>();

    RNCP_DATA.forEach(rncp => {
      rncp.categories.forEach(category => {
        category.projects.forEach(project => {
          const projectSlug = project.slug || project.id;

          // Vérifier si le projet parent est directement validé
          if (isProjectCompleted(projectSlug, apiSlugs)) {
            projects.push(project);
            apiSlugs.forEach((apiSlug: string) => {
              if (matchesProject(projectSlug, apiSlug)) matchedApiSlugs.add(apiSlug);
            });
            return;
          }

          // Pour les projets avec sous-projets, vérifier si tous les sous-projets sont validés
          if (project.subProjects && project.subProjects.length > 0) {
            const completedSubs = completedSubProjects[project.id] || [];
            if (completedSubs.length === project.subProjects.length) {
              projects.push(project);
              // Marquer les slugs des sous-projets comme matchés
              project.subProjects.forEach(sub => {
                apiSlugs.forEach((apiSlug: string) => {
                  if (matchesProject(sub.slug || sub.id, apiSlug)) matchedApiSlugs.add(apiSlug);
                });
              });
            }
          }
        });
      });
    });

    // Logger les projets validés par l'API qui n'ont pas de correspondance locale
    const unmatchedSlugs = apiSlugs.filter((slug: string) => !matchedApiSlugs.has(slug) && !stageFilter({ project: { slug, name: slug } } as Project42));
    if (unmatchedSlugs.length > 0) {
      console.warn('[RNCP] Projets validés sans correspondance locale:', unmatchedSlugs);
    }

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

  // Mémoriser les validations RNCP et les recalculer quand les dépendances changent
  const rncpValidations = useMemo((): RNCPValidation[] => {
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

    // Ajouter les projets dont tous les sous-projets sont simulés
    const fullySimulatedParents: string[] = [];
    Object.entries(simulatedSubProjects).forEach(([projectId, subIds]) => {
      for (const rncp of RNCP_DATA) {
        for (const category of rncp.categories) {
          const project = category.projects.find(p => p.id === projectId);
          if (project?.subProjects && project.subProjects.every(sub => (subIds as string[]).includes(sub.id))) {
            fullySimulatedParents.push(project.slug || project.id);
          }
        }
      }
    });
    const simulatedProjectsWithSubs = [...simulatedProjects, ...fullySimulatedParents];

    return rncpDataWithCustom.map(rncp => {
      return xpService.validateRNCP(
        rncp,
        projectedLevel,
        userProgress.events,
        userProgress.professionalExperience,
        userProgress.completedProjects,
        simulatedProjectsWithSubs,
        projectPercentages,
        completedProjectsPercentages,
        coalitionBoosts,
        simulatedSubProjects
      );
    });
  }, [userProgress, projectedLevel, simulatedProjects, simulatedSubProjects, projectPercentages, completedProjectsPercentages, coalitionBoosts, customProjects]);

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

  const completedProjects = getCompletedProjects();
  const simulatedProjectsDetails = getSimulatedProjectsDetails();
  const selectedRNCP = rncpDataWithCustom[selectedRNCPIndex];
  const selectedValidation = rncpValidations[selectedRNCPIndex];

  // Grouper les évaluations d'alternance/stage pour l'affichage
  const getEntryYear = (p: Project42) =>
    p.created_at ? new Date(p.created_at).getFullYear() : 0;

  // Détecte si c'est une entrée principale (work-experience-i, work-experience-ii, fr-alternance-rncp7-1-an)
  // vs une sous-évaluation (work-experience-i-work-experience-i-peer-video, évaluation entreprise...)
  const isMainEntry = (p: Project42) => {
    const slug = p.project.slug?.toLowerCase() || '';
    const name = p.project.name.toLowerCase();
    // Work Experience principal : slug = "work-experience-i" ou "work-experience-ii" (pas de double occurrence)
    if (slug.startsWith('work-experience-')) {
      // Les sous-évals ont le pattern "work-experience-X-work-experience-X-..."
      return !slug.includes('-work-experience-', slug.indexOf('-', 16));
    }
    // Alternance FR principale (pas les évaluations)
    if (slug.startsWith('fr-alternance')) {
      return !name.includes('évaluation') && !name.includes('evaluation');
    }
    // Stages classiques
    if (name.includes('stage') || name.includes('internship')) {
      return !name.includes('évaluation') && !name.includes('evaluation');
    }
    return true;
  };
  const profExpDisplayEntries = apiStages.filter((p: Project42) => isMainEntry(p));
  // Grouper les sous-évaluations par entrée parente
  // Pour work-experience : on extrait le préfixe (work-experience-i, work-experience-ii)
  // Pour alternance FR : on groupe par année
  const getParentKey = (p: Project42): string => {
    const slug = p.project.slug?.toLowerCase() || '';
    if (slug.startsWith('work-experience-')) {
      const match = slug.match(/^(work-experience-[ivxlc]+)/);
      return match ? match[1] : slug;
    }
    return String(getEntryYear(p));
  };
  const evalsByParent: Record<string, Project42[]> = {};
  apiStages.filter((p: Project42) => !isMainEntry(p)).forEach((p: Project42) => {
    const key = getParentKey(p);
    if (!evalsByParent[key]) evalsByParent[key] = [];
    evalsByParent[key].push(p);
  });

  // XP simulé des stages/alternances API (entrées non validées avec pourcentage éditable)
  const getApiEntryXP = (p: Project42, pct: number): number => {
    const lower = p.project.name.toLowerCase();
    const slug = p.project.slug?.toLowerCase() || '';
    if (lower.includes('alternance')) {
      const match = lower.match(/(\d+)\s*an/);
      const years = match ? parseInt(match[1]) : 1;
      return Math.round(90000 * years * (pct / 100));
    }
    // Stage / Work Experience (6 mois par défaut)
    if (slug.startsWith('work-experience') || lower.includes('stage')) {
      return Math.round(10500 * 6 * (pct / 100));
    }
    return 0;
  };
  const getEvalsAvg = (evals: Project42[]): number => {
    const marks = evals.map(ev => ev.final_mark).filter((m): m is number => m != null);
    if (marks.length === 0) return 100;
    return Math.min(100, Math.round(marks.reduce((a, b) => a + b, 0) / marks.length));
  };
  const apiExpXP = profExpDisplayEntries
    .filter((p: Project42) => !p.validated)
    .reduce((sum: number, p: Project42) => {
      const evals = evalsByParent[getParentKey(p)] || [];
      const pct = apiExpPercentages[p.id] ?? getEvalsAvg(evals);
      return sum + getApiEntryXP(p, pct);
    }, 0);

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
                {(simulatedProjects.length > 0 || Object.keys(simulatedSubProjects).length > 0 || professionalExperienceStorage.getTotalXP() > 0 || apiExpXP > 0) && (
                  <>
                    <span className="arrow">→</span>
                    <div className="level-projected">
                      <span className="label">Niveau projeté</span>
                      <span className="value projected">{projectedLevel.toFixed(2)}</span>
                    </div>
                  </>
                )}
              </div>
              <div className="simulation-info">
                {(simulatedProjects.length > 0 || Object.keys(simulatedSubProjects).length > 0) && (
                  <p>
                    {simulatedProjects.length + Object.keys(simulatedSubProjects).length} projet{(simulatedProjects.length + Object.keys(simulatedSubProjects).length) > 1 ? 's' : ''} simulé{(simulatedProjects.length + Object.keys(simulatedSubProjects).length) > 1 ? 's' : ''}
                  </p>
                )}
                {professionalExperienceStorage.getTotalXP() > 0 && (
                  <p>
                    {professionalExperienceStorage.getAll().length} expérience{professionalExperienceStorage.getAll().length > 1 ? 's' : ''} professionnelle{professionalExperienceStorage.getAll().length > 1 ? 's' : ''}
                  </p>
                )}
              </div>
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

        {/* Expériences professionnelles */}
        <motion.div
          className="prof-exp-section"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          <div className="prof-exp-header">
            <h2 className="prof-exp-title">Expériences professionnelles</h2>
            <div className="prof-exp-add-buttons">
              <button className="prof-exp-add-btn" onClick={() => setShowProfExpForm('stage')} title="Ajouter un stage">
                + Stage
              </button>
              <button className="prof-exp-add-btn" onClick={() => setShowProfExpForm('alternance')} title="Ajouter une alternance">
                + Alternance
              </button>
            </div>
          </div>

          <ProfExpList
            entries={profExpDisplayEntries}
            evalsByParent={evalsByParent}
            manualExperiences={manualExperiences}
            getParentKey={getParentKey}
            apiExpPercentages={apiExpPercentages}
            onApiExpPercentageChange={(id, pct) => {
              const updated = { ...apiExpPercentages, [id]: pct };
              setApiExpPercentages(updated);
              localStorage.setItem('api_exp_percentages', JSON.stringify(updated));
            }}
            onDeleteManual={(id) => {
              professionalExperienceStorage.remove(id);
              setManualExperiences(professionalExperienceStorage.getAll());
              if (userProgress) {
                setProjectedLevel(xpService.getLevelFromXP(userProgress.currentXP + professionalExperienceStorage.getTotalXP()));
              }
            }}
            onEditManual={(exp) => {
              setEditingExperience(exp);
              setShowProfExpForm(exp.type);
            }}
          />
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
              currentLevel: userProgress.currentLevel,
              events: userProgress.events,
              professionalExperience: userProgress.professionalExperience,
            }}
            completedProjects={completedProjects}
            simulatedProjects={simulatedProjectsDetails}
            onToggleSimulation={handleToggleSimulation}
            completedSubProjects={completedSubProjects}
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
            coalitionBoosts={coalitionBoosts}
            onToggleCoalitionBoost={handleToggleCoalitionBoost}
          />
        </motion.div>

        {/* Modal d'ajout/édition de projet personnalisé */}
        <AddCustomProjectModal
          isOpen={customProjectModal.isOpen}
          onClose={() => setCustomProjectModal({ isOpen: false, editProject: null })}
          onSave={(name, xp, percentage, note, hasCoalitionBoost) => {
            if (customProjectModal.editProject) {
              handleEditCustomProject(customProjectModal.editProject.id, name, xp, percentage, note, hasCoalitionBoost);
            } else {
              handleAddCustomProject(name, xp, percentage, note, hasCoalitionBoost);
            }
          }}
          editProject={customProjectModal.editProject ? {
            ...customProjectModal.editProject,
            percentage: projectPercentages[customProjectModal.editProject.id] || 100,
            note: projectNotes[customProjectModal.editProject.id] || '',
            hasCoalitionBoost: coalitionBoosts[customProjectModal.editProject.id] || false,
          } : null}
        />

        {/* Modal ajout expérience professionnelle */}
        <AddExperienceModal
          isOpen={showProfExpForm !== null}
          initialType={showProfExpForm ?? undefined}
          editingExperience={editingExperience}
          onClose={() => { setShowProfExpForm(null); setEditingExperience(null); }}
          onAdd={(exp) => {
            if (editingExperience) {
              professionalExperienceStorage.update({ ...exp, id: editingExperience.id });
            } else {
              professionalExperienceStorage.add({ ...exp, id: `manual-${Date.now()}` });
            }
            setManualExperiences(professionalExperienceStorage.getAll());
            setShowProfExpForm(null);
            setEditingExperience(null);
            if (userProgress) {
              setProjectedLevel(xpService.getLevelFromXP(userProgress.currentXP + professionalExperienceStorage.getTotalXP()));
            }
          }}
        />
      </div>
    </div>
  );
};

export default Dashboard;
