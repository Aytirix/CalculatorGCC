import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import Header from '@/components/Header/Header';
import RNCPCard from '@/components/RNCPCard/RNCPCard';
import AddExperienceModal from '@/components/AddExperienceModal/AddExperienceModal';
import { getRncpData } from '@/data/rncp.data';
import { BackendAPI42Service } from '@/services/backend-api42.service';
import type { Project42, UserData } from '@/services/backend-api42.service';
import { xpService } from '@/services/xp.service';
import { isProjectCompleted, matchesProject } from '@/utils/projectMatcher';
import { clampPercentage, getProjectMaxPercentage } from '@/utils/projectPercentage';
import { isGraphSimulationId } from '@/utils/holyGraphSimulation';
import { professionalExperienceMath, professionalExperienceStorage } from '@/utils/professionalExperienceStorage';
import { isReadOnlyMode, simulationService } from '@/services/simulation.service';
import type { SimulationData } from '@/services/simulation.service';
import ProfExpList from '@/components/ProfExpList/ProfExpList';
import type { SimulatorProject, RNCPValidation, UserProgress } from '@/types/rncp.types';
import type { ProfessionalExperience } from '@/pages/ProfessionalExperience/ProfessionalExperience';
import { useTour } from '@/contexts/TourContext';
import { useRefresh } from '@/contexts/useRefresh';
import { useViewingUser } from '@/contexts/useViewingUser';
import { useAuth } from '@/contexts/useAuth';
import { useRncpData } from '@/contexts/useRncpData';
import './Dashboard.scss';

const findConfiguredProjectById = (
	projectId: string,
	customProjects: SimulatorProject[] = []
): SimulatorProject | undefined => {
	for (const rncp of getRncpData()) {
		for (const category of rncp.categories) {
			const project = category.projects.find((entry) => entry.id === projectId);
			if (project) return project;
		}
	}

	return customProjects.find((project) => project.id === projectId);
};

const sanitizeProjectPercentages = (
	percentages: Record<string, number>,
	customProjects: SimulatorProject[] = []
): Record<string, number> => {
	return Object.entries(percentages).reduce<Record<string, number>>((acc, [projectId, percentage]) => {
		const project = findConfiguredProjectById(projectId, customProjects);
		const clampedPercentage = clampPercentage(percentage, getProjectMaxPercentage(project));

		if (clampedPercentage !== 100) {
			acc[projectId] = clampedPercentage;
		}

		return acc;
	}, {});
};

const isAlternanceApiEntry = (entry: Project42): boolean => {
	const lower = entry.project.name.toLowerCase();
	const slug = entry.project.slug?.toLowerCase() || '';
	return lower.includes('alternance') || slug.startsWith('fr-alternance');
};

const getApiEntryDefaultPercentage = (entry: Project42, evals: Project42[]): number => {
	const marks = evals.map(ev => ev.final_mark).filter((m): m is number => m != null);
	if (marks.length === 0) return 100;

	const averageOutOf100 = Math.round(marks.reduce((a, b) => a + b, 0) / marks.length);
	if (isAlternanceApiEntry(entry)) {
		return Math.min(125, Math.round((averageOutOf100 * 125) / 100));
	}

	return Math.min(100, averageOutOf100);
};

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
	const [syncing, setSyncing] = useState(false);
	const [apiStages, setApiStages] = useState<Project42[]>([]);
	const [showProfExpForm, setShowProfExpForm] = useState<'stage' | 'alternance' | null>(null);
	// En consultation d'un autre profil, on part de rien : le localStorage ne
	// contient QUE mes données, et les siennes arrivent du backend juste après.
	const [apiExpPercentages, setApiExpPercentages] = useState<Record<number, number>>(() => {
		if (isReadOnlyMode()) return {};
		const saved = localStorage.getItem('api_exp_percentages');
		return saved ? JSON.parse(saved) : {};
	});
	const [editingExperience, setEditingExperience] = useState<ProfessionalExperience | null>(null);
	const [manualExperiences, setManualExperiences] = useState<ProfessionalExperience[]>(() =>
		isReadOnlyMode() ? [] : professionalExperienceStorage.getAll()
	);
	const [manualExpVersion, setManualExpVersion] = useState(0);
	const [tourStatusLoaded, setTourStatusLoaded] = useState(false);

	const { startTour, hasSeenTour, syncTourSeen } = useTour();
	const { job, requestRefresh, refreshing, cooldownSeconds, completedTick, syncJob } = useRefresh();
	const { isViewingOther } = useViewingUser();
	const { login } = useAuth();
	const { rncpData, loading: rncpLoading, error: rncpError } = useRncpData();
	// Session 42 réellement expirée (refresh_token mort) : filet de sécurité pour
	// couper la boucle de synchro et proposer une reconnexion, au lieu de retenter à l'infini.
	const [authExpired, setAuthExpired] = useState(false);

	// Miroir des expériences affichées (les miennes, ou celles du profil consulté).
	// `loadUserData` est capturé par un effet à dépendances vides : sans ce ref, il
	// lirait éternellement la valeur du premier rendu.
	const manualExpRef = useRef(manualExperiences);
	manualExpRef.current = manualExperiences;

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
				const savedCustomProjects = (data.customProjects as SimulatorProject[]) ?? [];
				const sanitizedPercentages = sanitizeProjectPercentages(percentages, savedCustomProjects);

				setSimulatedProjects(projectIds);
				setProjectPercentages(sanitizedPercentages);
				setCoalitionBoosts(boosts);
				setProjectNotes(notes);
				setSimulatedSubProjects(data.simulatedSubProjects ?? {});
				setCustomProjects(savedCustomProjects);

				// Consultation d'un autre profil : ce sont SES expériences et SES
				// pourcentages qu'on affiche, même quand il n'en a aucun — sinon les
				// miens (localStorage, global au navigateur) restent à l'écran et
				// faussent son niveau projeté. Et on n'écrit jamais dans le
				// localStorage : ses données n'ont rien à faire dans mon stockage.
				const viewingOther = isReadOnlyMode();

				const remotePercentages: Record<number, number> = {};
				for (const [k, v] of Object.entries(data.apiExpPercentages ?? {})) {
					remotePercentages[Number(k)] = v;
				}
				if (viewingOther || Object.keys(remotePercentages).length > 0) {
					setApiExpPercentages(remotePercentages);
				}

				const remoteExperiences = Array.isArray(data.manualExperiences)
					? (data.manualExperiences as ProfessionalExperience[])
					: [];
				if (viewingOther) {
					setManualExperiences(remoteExperiences);
				} else if (remoteExperiences.length > 0) {
					professionalExperienceStorage.saveAll(remoteExperiences);
					setManualExperiences(professionalExperienceStorage.getAll());
				}
				syncTourSeen(data.hasSeenTour === true);
				console.log('[Dashboard] Simulation chargée depuis le backend');
				// Sync localStorage aussi — JAMAIS avec les données d'un autre profil :
				// le localStorage est mon cache de repli, y écrire la simulation d'un
				// ami écraserait la mienne dès la première panne du backend.
				if (!viewingOther) {
					localStorage.setItem('simulated_projects', JSON.stringify(projectIds));
					localStorage.setItem('simulated_sub_projects', JSON.stringify(data.simulatedSubProjects ?? {}));
					localStorage.setItem('project_percentages', JSON.stringify(sanitizedPercentages));
					localStorage.setItem('custom_projects', JSON.stringify(data.customProjects ?? []));
					localStorage.setItem('project_notes', JSON.stringify(notes));
					localStorage.setItem('coalition_boosts', JSON.stringify(boosts));
					localStorage.setItem('api_exp_percentages', JSON.stringify(data.apiExpPercentages ?? {}));
				}
			} catch (err) {
				console.warn('[Dashboard] Backend indisponible, chargement depuis localStorage', err);
				// Fallback localStorage
				loadFromLocalStorage();
			} finally {
				setTourStatusLoaded(true);
				isInitialLoad.current = false;
			}
		};

		const loadFromLocalStorage = () => {
			const saved = localStorage.getItem('simulated_projects');
			if (saved) try { setSimulatedProjects(JSON.parse(saved)); } catch { /* Ignore corrupted localStorage */ }

			const savedSub = localStorage.getItem('simulated_sub_projects');
			if (savedSub) try { setSimulatedSubProjects(JSON.parse(savedSub)); } catch { /* Ignore corrupted localStorage */ }

			const savedCustom = localStorage.getItem('custom_projects');
			let parsedCustomProjects: SimulatorProject[] = [];
			if (savedCustom) {
				try {
					parsedCustomProjects = JSON.parse(savedCustom);
					setCustomProjects(parsedCustomProjects);
				} catch {
					/* Ignore corrupted localStorage */
				}
			}

			const savedPct = localStorage.getItem('project_percentages');
			if (savedPct) {
				try {
					setProjectPercentages(sanitizeProjectPercentages(JSON.parse(savedPct), parsedCustomProjects));
				} catch {
					/* Ignore corrupted localStorage */
				}
			}

			const savedNotes = localStorage.getItem('project_notes');
			if (savedNotes) try { setProjectNotes(JSON.parse(savedNotes)); } catch { /* Ignore corrupted localStorage */ }

			const savedBoosts = localStorage.getItem('coalition_boosts');
			if (savedBoosts) try { setCoalitionBoosts(JSON.parse(savedBoosts)); } catch { /* Ignore corrupted localStorage */ }
		};

		loadSimulation();
	}, [syncTourSeen]);

	// Sauvegardes localStorage : toutes court-circuitées en consultation d'un
	// autre profil. Le state porte alors SES données ; les écrire dans mon
	// stockage local remplacerait silencieusement ma propre simulation.
	const canPersistLocally = !isViewingOther;

	// Sauvegarder les projets simulés dans localStorage
	useEffect(() => {
		if (!canPersistLocally) return;
		if (simulatedProjects.length > 0) {
			localStorage.setItem('simulated_projects', JSON.stringify(simulatedProjects));
		} else {
			localStorage.removeItem('simulated_projects');
		}
	}, [simulatedProjects, canPersistLocally]);

	// Sauvegarder les sous-projets simulés dans localStorage
	useEffect(() => {
		if (!canPersistLocally) return;
		if (Object.keys(simulatedSubProjects).length > 0) {
			localStorage.setItem('simulated_sub_projects', JSON.stringify(simulatedSubProjects));
		} else {
			localStorage.removeItem('simulated_sub_projects');
		}
	}, [simulatedSubProjects, canPersistLocally]);

	// Sauvegarder les pourcentages dans localStorage
	useEffect(() => {
		if (!canPersistLocally) return;
		if (Object.keys(projectPercentages).length > 0) {
			localStorage.setItem('project_percentages', JSON.stringify(projectPercentages));
		} else {
			localStorage.removeItem('project_percentages');
		}
	}, [projectPercentages, canPersistLocally]);

	// Sauvegarder les projets personnalisés dans localStorage
	useEffect(() => {
		if (!canPersistLocally) return;
		if (customProjects.length > 0) {
			localStorage.setItem('custom_projects', JSON.stringify(customProjects));
		} else {
			localStorage.removeItem('custom_projects');
		}
	}, [customProjects, canPersistLocally]);

	// Sauvegarder les notes dans localStorage
	useEffect(() => {
		if (!canPersistLocally) return;
		if (Object.keys(projectNotes).length > 0) {
			localStorage.setItem('project_notes', JSON.stringify(projectNotes));
		} else {
			localStorage.removeItem('project_notes');
		}
	}, [projectNotes, canPersistLocally]);

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
					hasSeenTour: hasSeenTour(),
				};
				await simulationService.save(data);
				console.log('[Dashboard] Simulation sauvegardée vers le backend');
			} catch (err) {
				console.warn('[Dashboard] Erreur sauvegarde backend:', err);
			}
		}, 2000);
	}, [simulatedProjects, simulatedSubProjects, projectPercentages, coalitionBoosts, projectNotes, customProjects, apiExpPercentages, hasSeenTour]);

	useEffect(() => {
		saveToBackend();
	}, [saveToBackend]);

	// Nettoyer le timer de sauvegarde au démontage (évite une fuite / un save perdu).
	useEffect(() => () => {
		if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
	}, []);

	// Réconciliation automatique simulation ↔ réalité. Un projet qu'on avait SIMULÉ et
	// qu'on a depuis VALIDÉ pour de vrai sur l'intra n'a plus rien à faire dans la
	// simulation : son XP réel est déjà compté dans `currentXP`, donc le laisser en
	// simulé le fait DOUBLE-compter dans le niveau projeté, et il gonfle le compteur
	// « N projets simulés » (symptôme : compteur 8 alors que la liste n'affiche que 7,
	// la liste filtrant déjà les projets validés). On le retire du state à la visite ;
	// l'autosave persiste ce nettoyage — pas de purge globale de la base, chaque compte
	// se nettoie tout seul quand son propriétaire ouvre le dashboard, et on ne retire
	// que ce qui est de toute façon devenu faux.
	//
	// JAMAIS en consultation d'un autre profil (`isViewingOther`) : le state porte MES
	// projets simulés, mais les projets validés affichés sont CEUX DE L'AUTRE — comparer
	// les deux supprimerait mes projets à tort (et l'autosave écrit sur MON compte).
	useEffect(() => {
		if (isViewingOther || !userProgress || isInitialLoad.current) return;

		const completed = userProgress.completedProjects;

		// Un id simulé est « désormais validé » s'il correspond à un projet RNCP dont le
		// slug/id est validé côté API. On passe par le référentiel RNCP + le même `isProjectCompleted`
		// que l'affichage (matching permissif : gère le préfixe « 42cursus- »), pour rester
		// exactement cohérent avec la liste de cartes qui produit le « 7 ».
		const isNowValidated = (simId: string): boolean => {
			for (const rncp of rncpData) {
				for (const cat of rncp.categories) {
					const project = cat.projects.find(p => p.slug === simId || p.id === simId);
					if (project) return isProjectCompleted(project.slug || project.id, completed);
				}
			}
			// Projet simulé depuis le Holy Graph : il n'est pas dans le référentiel RNCP, mais
			// son slug 42 est stocké dans `customProjects` — on peut donc le
			// réconcilier comme les autres au lieu de le laisser double-compter.
			if (isGraphSimulationId(simId)) {
				const graphProject = customProjects.find(p => p.id === simId);
				const slug = graphProject?.slug;
				return slug ? isProjectCompleted(slug, completed) : false;
			}
			// Projet custom (hors RNCP) : jamais validé via l'intra → on le garde.
			return false;
		};

		const staleProjects = simulatedProjects.filter(isNowValidated);
		const staleSubParents = Object.keys(simulatedSubProjects).filter(isNowValidated);
		if (staleProjects.length === 0 && staleSubParents.length === 0) return;

		const staleSet = new Set(staleProjects);
		setSimulatedProjects(prev => prev.filter(id => !staleSet.has(id)));

		// Retirer les métadonnées associées pour ne pas laisser d'orphelins (%, boost, note).
		if (staleProjects.length > 0) {
			// Les entrées `42-<id>` ne servent qu'à porter le nom et l'XP d'un projet
			// simulé depuis le Holy Graph : sans le projet simulé, elles n'ont plus
			// de raison d'être (les vrais projets personnalisés, eux, restent).
			setCustomProjects(prev =>
				prev.filter(p => !(isGraphSimulationId(p.id) && staleSet.has(p.id)))
			);
			setProjectPercentages(prev => { const n = { ...prev }; staleProjects.forEach(id => delete n[id]); return n; });
			setCoalitionBoosts(prev => { const n = { ...prev }; staleProjects.forEach(id => delete n[id]); return n; });
			setProjectNotes(prev => { const n = { ...prev }; staleProjects.forEach(id => delete n[id]); return n; });
		}
		if (staleSubParents.length > 0) {
			const subStaleSet = new Set(staleSubParents);
			setSimulatedSubProjects(prev => {
				const n = { ...prev };
				subStaleSet.forEach(id => delete n[id]);
				return n;
			});
		}

		console.log(`[Dashboard] Réconciliation simulation : ${staleProjects.length} projet(s) + ${staleSubParents.length} piscine(s) désormais validé(s), retiré(s) de la simulation.`);
		// `tourStatusLoaded` est dans les deps à dessein : il passe à true juste APRÈS
		// `isInitialLoad.current = false` (fin de chargement), ce qui garantit un
		// déclenchement de cet effet une fois la garde levée — sans lui, si `userProgress`
		// se stabilisait avant la fin du chargement, le nettoyage serait raté.
	}, [userProgress, isViewingOther, simulatedProjects, simulatedSubProjects, tourStatusLoaded, customProjects, rncpData]);

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
		rncpData.forEach(rncp => {
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

	const applyUserData = (userData: UserData) => {
		const completedProjectSlugs = userData.projects;
		const realPercentages: Record<string, number> = {};
		userData.allProjects.forEach((project) => {
			if (project.validated === true) {
				const percentage = Math.min(125, Math.max(0, project.final_mark || 100));
				realPercentages[project.project.name] = percentage;
			}
		});
		setCompletedProjectsPercentages(realPercentages);
		setCompletedSubProjects(computeCompletedSubProjects(completedProjectSlugs));
		setApiStages(userData.allProjects.filter(stageFilter));

		// Les expériences saisies à la main sont ajoutées plus bas (`projectedProfExp`),
		// à partir du state : elles dépendent du profil affiché, pas du localStorage.
		const professionalExpXP = professionalExperienceMath.realXP(manualExpRef.current);
		const professionalExpCount = countApiProfExp(userData.allProjects);
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
	};

	// Charge l'instantané des données 42 depuis le backend (AUCUN appel API 42 ici :
	// l'usage normal ne rafraîchit jamais). Le refresh explicite passe par le contexte.
	const loadUserData = async () => {
		try {
			setError(null);
			const resp = await BackendAPI42Service.getUserData();
			const viewingOther = resp._meta.isViewingOther;

			// Un job de refresh ne concerne que MON profil : ne pas adopter celui d'un autre.
			if (!viewingOther && resp._meta.job) syncJob(resp._meta.job);

			if (!resp._meta.fetchedAt) {
				setLoading(false);
				if (viewingOther) {
					// Profil consulté sans données : état vide explicite (pas « ma synchro »).
					setSyncing(false);
					setError("Ce profil n'a pas encore synchronisé ses données 42.");
				} else if (resp._meta.lastError === 'auth') {
					// Session 42 réellement expirée : retenter ne servira à rien tant que
					// l'utilisateur ne se reconnecte pas. On coupe la boucle et on l'invite à le faire.
					setSyncing(false);
					setAuthExpired(true);
				} else {
					// Mon profil sans données : on affiche TOUJOURS « récupération en cours »
					// (jamais un mur d'erreur). Le retry auto + la file s'en chargent.
					setError(null);
					setAuthExpired(false);
					setSyncing(true);
				}
				return;
			}

			setSyncing(false);
			setAuthExpired(false);
			applyUserData(resp);
			setLoading(false);
		} catch (err) {
			const error = err as Error;
			console.error('Erreur lors du chargement des données utilisateur:', error);
			let errorMessage = 'Impossible de charger vos données. Veuillez réessayer.';
			if (error.message?.includes('expired') || error.message?.includes('login again')) {
				errorMessage = 'Votre session a expiré. Vous allez être redirigé vers la page de connexion...';
			}
			setError(errorMessage);
			setLoading(false);
		}
	};

	// Démarrage automatique du guide à la première visite (après le chargement des données)
	useEffect(() => {
		if (!loading && tourStatusLoaded && !hasSeenTour()) {
			const timer = setTimeout(() => startTour(), 600);
			return () => clearTimeout(timer);
		}
	}, [loading, tourStatusLoaded, hasSeenTour, startTour]);

	useEffect(() => {
		loadUserData();

		// Écouter les changements du localStorage pour les expériences professionnelles
		const handleStorageChange = () => {
			// Recalculer le niveau avec les nouvelles expériences
			if (userProgress) {
				const professionalExpXP = professionalExperienceMath.totalXP(manualExpRef.current);
				const totalXP = userProgress.currentXP + professionalExpXP;
				const newLevel = xpService.getLevelFromXP(totalXP);
				setProjectedLevel(newLevel);
			}
		};

		window.addEventListener('storage', handleStorageChange);
		return () => window.removeEventListener('storage', handleStorageChange);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Recharger l'instantané dès qu'un refresh se termine (badge file d'attente).
	useEffect(() => {
		if (completedTick > 0) loadUserData();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [completedTick]);

	// Tant qu'on n'a pas encore les données (première synchro), on retente
	// périodiquement : le backend gère le cooldown, donc ça n'émet un vrai fetch
	// que quand c'est autorisé. Évite tout écran figé, sans mur d'erreur.
	const refreshingRef = useRef(refreshing);
	refreshingRef.current = refreshing;
	useEffect(() => {
		if (!syncing) return;
		const id = setInterval(() => {
			if (!refreshingRef.current) loadUserData();
		}, 3000);
		return () => clearInterval(id);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [syncing]);

	// Mettre à jour le niveau projeté quand les projets simulés changent
	useEffect(() => {
		if (!userProgress) return;
		// Sans le référentiel, aucun projet simulé ne serait trouvé : le niveau
		// projeté retomberait au niveau actuel le temps qu'il arrive.
		if (rncpData.length === 0) return;

		// Calculer l'XP total de tous les projets (complétés + simulés)
		let totalXP = userProgress.currentXP;

		// Utiliser un Set pour tracker les projets déjà comptés (éviter les doublons)
		const countedProjects = new Set<string>();

		// Pour chaque projet simulé sans sous-projets, ajouter son XP
		simulatedProjects.forEach(projectSlug => {
			// Trouver le projet dans les données RNCP (on s'arrête dès qu'on le trouve)
			for (const rncp of rncpData) {
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

			// Projet absent du référentiel RNCP, dont l'XP vit dans `customProjects` :
			//  - `42-<id>` : simulé depuis le Holy Graph (tronc commun, examens…) ;
			//  - `custom-<id>` : projet saisi à la main du temps où c'était possible.
			// Ces derniers n'étaient tout simplement pas comptés — la boucle
			// ci-dessus ne cherche que dans le référentiel — alors que l'XP a été
			// saisi explicitement par l'utilisateur pour être compté.
			if (!countedProjects.has(projectSlug)) {
				const extraProject = customProjects.find(p => p.id === projectSlug);
				if (extraProject && extraProject.xp > 0) {
					const percentage = projectPercentages[projectSlug] ?? 100;
					let addedXP = Math.round((extraProject.xp * percentage) / 100);
					if (coalitionBoosts[projectSlug]) addedXP = Math.round(addedXP * 1.042);
					totalXP += addedXP;
					countedProjects.add(projectSlug);
				}
			}
		});

		// Pour les projets avec sous-projets, calculer l'XP en fonction des sous-projets validés
		Object.entries(simulatedSubProjects).forEach(([projectId, subProjectIds]) => {
			// On compte ce projet seulement s'il n'a pas déjà été compté
			if (countedProjects.has(projectId)) return;

			for (const rncp of rncpData) {
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
		const professionalExperiencesXP = professionalExperienceMath.totalXP(manualExperiences);
		totalXP += professionalExperiencesXP;

		// Ajouter l'XP des stages/alternances API en cours (avec % éditable)
		const isEval = (name: string) => name.toLowerCase().includes('évaluation') || name.toLowerCase().includes('evaluation');
		const isMainApiEntry = (p: (typeof apiStages)[0]) => {
			const slug = p.project.slug?.toLowerCase() || '';
			const name = p.project.name.toLowerCase();
			if (slug.startsWith('work-experience-')) {
				return !slug.includes('-work-experience-', slug.indexOf('-', 16));
			}
			if (slug.startsWith('fr-alternance')) {
				return !name.includes('évaluation') && !name.includes('evaluation');
			}
			if (name.includes('alternance') || name.includes('stage') || name.includes('internship')) {
				return !name.includes('évaluation') && !name.includes('evaluation');
			}
			return false;
		};
		const apiEntries = apiStages.filter(p => !p.validated && isMainApiEntry(p));
		for (const p of apiEntries) {
			const nameL = p.project.name.toLowerCase();
			const evalsForEntry = apiStages.filter(e => isEval(e.project.name) && (p.created_at ? new Date(p.created_at).getFullYear() : 0) === (e.created_at ? new Date(e.created_at).getFullYear() : 0));
			const defaultPct = getApiEntryDefaultPercentage(p, evalsForEntry);
			const pct = apiExpPercentages[p.id] ?? defaultPct;
			let entryXP = 0;
			if (isAlternanceApiEntry(p)) {
				const match = nameL.match(/(\d+)\s*an/);
				const years = match ? parseInt(match[1]) : 1;
				entryXP = Math.round(90000 * years * (pct / 100));
			} else {
				// Stage / Work Experience (6 mois par défaut)
				entryXP = Math.round(10500 * 6 * (pct / 100));
			}
			totalXP += entryXP;
		}

		const newLevel = xpService.getLevelFromXP(totalXP);
		setProjectedLevel(newLevel);
	}, [simulatedProjects, simulatedSubProjects, userProgress, projectPercentages, coalitionBoosts, apiStages, apiExpPercentages, manualExpVersion, manualExperiences, customProjects, rncpData]);

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
		const project = findConfiguredProjectById(projectId, customProjects);
		const clampedPercentage = clampPercentage(percentage, getProjectMaxPercentage(project));

		setProjectPercentages(prev => {
			if (clampedPercentage === 100) {
				// Si le pourcentage est 100%, le retirer du state
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				const { [projectId]: _removed, ...rest } = prev;
				return rest;
			}
			return {
				...prev,
				[projectId]: clampedPercentage,
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

		rncpData.forEach(rncp => {
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
		rncpData.forEach(rncp => {
			rncp.categories.forEach(category => {
				category.projects.forEach(project => {
					if (simulatedProjects.includes(project.slug || project.id)) {
						projects.push(project);
					}
				});
			});
		});
		// Projets simulés depuis le Holy Graph : ils n'existent pas dans le référentiel RNCP,
		// mais ils comptent dans le total — les omettre ici afficherait « 8 projets
		// simulés » au-dessus d'une liste qui n'en montre que 7.
		customProjects.forEach(project => {
			if (isGraphSimulationId(project.id) && simulatedProjects.includes(project.id)) {
				projects.push(project);
			}
		});
		return projects;
	};

	// Expérience professionnelle projetée : réelle + manuelle simulée + API en cours
	const simulatedManualProfExpCount = manualExperiences
		.filter(exp => exp.isSimulation)
		.reduce((count, exp) => {
			if (exp.type === 'alternance' && exp.duration === 2) return count + 2;
			return count + 1;
		}, 0);

	const apiEnCoursProfExpCount = apiStages
		.filter(p => {
			if (p.validated) return false;
			const slug = p.project.slug?.toLowerCase() || '';
			const name = p.project.name.toLowerCase();
			if (name.includes('évaluation') || name.includes('evaluation')) return false;
			if (slug.startsWith('work-experience-') && slug.includes('-work-experience-', 16)) return false;
			if (name.includes('peer video') || name.includes('contract upload') || name.includes('duration')) return false;
			return name.includes('alternance') || name.includes('stage') || name.includes('internship') || slug.startsWith('work-experience-');
		})
		.reduce((count, p) => {
			const nameL = p.project.name.toLowerCase();
			if (nameL.includes('alternance')) {
				const match = nameL.match(/(\d+)\s*an/);
				const years = match ? parseInt(match[1]) : 1;
				return count + years;
			}
			return count + 1;
		}, 0);

	const projectedProfExp =
		(userProgress?.professionalExperience ?? 0) +
		professionalExperienceMath.realCount(manualExperiences) +
		simulatedManualProfExpCount +
		apiEnCoursProfExpCount;

	// Mémoriser les validations RNCP et les recalculer quand les dépendances changent
	const rncpValidations = useMemo((): RNCPValidation[] => {
		if (!userProgress) return [];


		// Ajouter les projets dont tous les sous-projets sont simulés
		const fullySimulatedParents: string[] = [];
		Object.entries(simulatedSubProjects).forEach(([projectId, subIds]) => {
			for (const rncp of rncpData) {
				for (const category of rncp.categories) {
					const project = category.projects.find(p => p.id === projectId);
					if (project?.subProjects && project.subProjects.every(sub => (subIds as string[]).includes(sub.id))) {
						fullySimulatedParents.push(project.slug || project.id);
					}
				}
			}
		});
		const simulatedProjectsWithSubs = [...simulatedProjects, ...fullySimulatedParents];

		// Fusionner completedSubProjects (validés par l'API) avec simulatedSubProjects pour le calcul XP
		const mergedSubProjects: Record<string, string[]> = {};
		for (const [id, subs] of Object.entries(completedSubProjects) as [string, string[]][]) {
			mergedSubProjects[id] = [...subs];
		}
		for (const [id, subs] of Object.entries(simulatedSubProjects) as [string, string[]][]) {
			mergedSubProjects[id] = [...new Set([...(mergedSubProjects[id] || []), ...subs])];
		}

		return rncpData.map(rncp => {
			return xpService.validateRNCP(
				rncp,
				projectedLevel,
				userProgress.events,
				projectedProfExp,
				userProgress.completedProjects,
				simulatedProjectsWithSubs,
				projectPercentages,
				completedProjectsPercentages,
				coalitionBoosts,
				mergedSubProjects
			);
		});
	}, [userProgress, projectedLevel, projectedProfExp, simulatedProjects, simulatedSubProjects, completedSubProjects, projectPercentages, completedProjectsPercentages, coalitionBoosts, rncpData]);

	// Le référentiel n'a pas pu être construit : on le dit, au lieu d'afficher un
	// simulateur vide ou de tourner indéfiniment sur l'écran de chargement.
	if (rncpError && rncpData.length === 0) {
		return (
			<div className="dashboard-page">
				<Header />
				<div className="dashboard-container">
					<div className="error-state">
						<h2>Référentiel indisponible</h2>
						<p>
							Le serveur n'a pas pu récupérer le catalogue des projets depuis l'API 42.
							Les données arriveront dès qu'elle répondra de nouveau.
						</p>
						<button className="fetch-btn" onClick={() => window.location.reload()}>
							Réessayer
						</button>
					</div>
				</div>
			</div>
		);
	}

	if (loading || rncpLoading) {
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
						{!isViewingOther && (
							<button onClick={() => { requestRefresh(); loadUserData(); }}>Réessayer</button>
						)}
					</div>
				</div>
			</div>
		);
	}

	// Session 42 expirée (refresh_token mort) et aucune donnée à afficher : on
	// sort de la boucle de synchro et on propose une reconnexion 42.
	if (authExpired && !userProgress) {
		return (
			<div className="dashboard-page">
				<Header />
				<div className="dashboard-container">
					<div className="loading-state sync-state">
						<p className="sync-title">Session 42 expirée</p>
						<p className="sync-detail">
							Ta connexion à l'intra 42 a expiré. Reconnecte-toi pour récupérer tes infos.
						</p>
						<button className="fetch-btn" onClick={login} style={{ marginTop: '1rem' }}>
							<span className="fetch-btn__label">Se reconnecter à 42</span>
						</button>
					</div>
				</div>
			</div>
		);
	}

	// Première récupération : aucune donnée encore, la synchro se fait via la file.
	// On n'affiche JAMAIS d'erreur ici — juste l'état d'avancement (place + temps estimé).
	if (syncing && !userProgress) {
		const syncDetail =
			job?.state === 'queued'
				? `Position ${job.position} dans la file · temps estimé ~${job.etaSeconds}s`
				: job?.state === 'running'
					? `C'est ton tour · temps estimé ~${job.etaSeconds}s`
					: cooldownSeconds > 0
						? `Nouvelle tentative dans ${cooldownSeconds}s…`
						: "Connexion à l'API 42…";
		return (
			<div className="dashboard-page">
				<Header />
				<div className="dashboard-container">
					<div className="loading-state sync-state">
						<motion.div
							className="spinner"
							animate={{ rotate: 360 }}
							transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
						/>
						<p className="sync-title">Récupération de vos infos en cours…</p>
						<p className="sync-detail">{syncDetail}</p>
					</div>
				</div>
			</div>
		);
	}

	if (!userProgress) return null;


	const completedProjects = getCompletedProjects();
	const simulatedProjectsDetails = getSimulatedProjectsDetails();
	const selectedRNCP = rncpData[selectedRNCPIndex];
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
		if (isAlternanceApiEntry(p)) {
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
	const apiExpXP = profExpDisplayEntries
		.filter((p: Project42) => !p.validated)
		.reduce((sum: number, p: Project42) => {
			const evals = evalsByParent[getParentKey(p)] || [];
			const pct = apiExpPercentages[p.id] ?? getApiEntryDefaultPercentage(p, evals);
			return sum + getApiEntryXP(p, pct);
		}, 0);

	return (
		<div className="dashboard-page">
			<Header />
			<div className="dashboard-container">
				<motion.div
					className="welcome-section"
					data-tour="welcome-section"
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
								{(simulatedProjects.length > 0 || Object.keys(simulatedSubProjects).length > 0 || professionalExperienceMath.totalXP(manualExperiences) > 0 || apiExpXP > 0) && (
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
								{(simulatedProjects.length >= 0 || Object.keys(simulatedSubProjects).length > 0) && (
									<p>
										{simulatedProjects.length + Object.keys(simulatedSubProjects).length} projet{(simulatedProjects.length + Object.keys(simulatedSubProjects).length) > 1 ? 's' : ''} simulé{(simulatedProjects.length + Object.keys(simulatedSubProjects).length) > 1 ? 's' : ''}
									</p>
								)}
	{professionalExperienceMath.totalXP(manualExperiences) > 0 && (
									<p>
										{manualExperiences.length} expérience{manualExperiences.length > 1 ? 's' : ''} professionnelle{manualExperiences.length > 1 ? 's' : ''}
									</p>
								)}
							</div>
						</div>
						<button
							className="reset-button"
							data-tour="reset-button"
							onClick={handleResetModifications}
							title="Réinitialiser les modifications"
							disabled={simulatedProjects.length === 0 && Object.keys(simulatedSubProjects).length === 0 && Object.keys(projectPercentages).length === 0}
						>
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
								<line x1="10" y1="11" x2="10" y2="17" />
								<line x1="14" y1="11" x2="14" y2="17" />
							</svg>
						</button>
						{!isViewingOther && (
							<div className="header-actions">
								<button
									className="fetch-btn"
									data-tour="refresh-button"
									onClick={requestRefresh}
									disabled={refreshing || cooldownSeconds > 0}
								>
									<span className="fetch-btn__label">Récupérer mes infos</span>
									<span className="fetch-btn__status">
										{refreshing && job?.state === 'queued'
											? `File · ${job.position}ᵉ · ~${job.etaSeconds}s`
											: refreshing && job?.state === 'running'
												? `Mise à jour… ~${job.etaSeconds}s`
												: refreshing
													? 'Mise à jour…'
													: cooldownSeconds > 0
														? `Disponible dans ${cooldownSeconds}s`
														: ''}
									</span>
								</button>
							</div>
						)}
					</div>
				</motion.div>

				{/* Onglets RNCP */}
				<motion.div
					className="rncp-tabs"
					data-tour="rncp-tabs"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, delay: 0.1 }}
				>
					{rncpData.map((rncp, index) => {
						const validation = rncpValidations[index];
						const isActive = selectedRNCPIndex === index;

						return (
							<button
								key={rncp.id}
								className={`rncp-tab ${isActive ? 'active' : ''} ${validation.overallValid ? 'validated' : ''}`}
								onClick={() => setSelectedRNCPIndex(index)}
								{...(rncp.id === 'rncp-global' ? { 'data-tour': 'rncp-global-tab' } : {})}
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
					data-tour="prof-exp-section"
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, delay: 0.15 }}
				>
					<div className="prof-exp-header">
						<h2 className="prof-exp-title">Expériences professionnelles</h2>
						{/* On ne peut ajouter une expérience que sur SON profil : ailleurs,
						    elle partirait dans mon localStorage tout en s'affichant comme
						    celle de l'autre. */}
						{!isViewingOther && (
							<div className="prof-exp-add-buttons">
								<button className="prof-exp-add-btn" onClick={() => setShowProfExpForm('stage')} title="Ajouter un stage">
									+ Stage
								</button>
								<button className="prof-exp-add-btn" onClick={() => setShowProfExpForm('alternance')} title="Ajouter une alternance">
									+ Alternance
								</button>
							</div>
						)}
					</div>

					<ProfExpList
						entries={profExpDisplayEntries}
						evalsByParent={evalsByParent}
						manualExperiences={manualExperiences}
						getParentKey={getParentKey}
						apiExpPercentages={apiExpPercentages}
						onApiExpPercentageChange={(id, pct) => {
							if (isViewingOther) return;
							const updated = { ...apiExpPercentages, [id]: pct };
							setApiExpPercentages(updated);
							localStorage.setItem('api_exp_percentages', JSON.stringify(updated));
						}}
						onDeleteManual={(id) => {
							professionalExperienceStorage.remove(id);
							setManualExperiences(professionalExperienceStorage.getAll());
							setManualExpVersion(v => v + 1);
						}}
						onEditManual={(exp) => {
							setEditingExperience(exp);
							setShowProfExpForm(exp.type);
						}}
						readOnly={isViewingOther}
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
							professionalExperience: projectedProfExp,
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
						projectNotes={projectNotes}
						onSaveNote={handleSaveNote}
						coalitionBoosts={coalitionBoosts}
						onToggleCoalitionBoost={handleToggleCoalitionBoost}
					/>
				</motion.div>

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
						setManualExpVersion(v => v + 1);
					}}
				/>
			</div>
		</div>
	);
};

export default Dashboard;
