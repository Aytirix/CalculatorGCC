import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SimulatorProject } from '@/types/rncp.types';
import { clampProjectPercentage, getProjectMaxPercentage } from '@/utils/projectPercentage';
import ProjectContextMenu from '@/components/ProjectContextMenu/ProjectContextMenu';
import ProjectPercentageModal from '@/components/ProjectPercentageModal/ProjectPercentageModal';
import ProjectNoteModal from '@/components/ProjectNoteModal/ProjectNoteModal';
import './ProjectCard.scss';
import { activeSubProjects, effectiveProjectXP } from '@/services/xp.service';

interface ProjectCardProps {
	project: SimulatorProject;
	isCompleted: boolean;
	isSimulated: boolean;
	onToggleSimulation: (projectId: string) => void;
	completedSubProjectIds?: string[];
	simulatedSubProjects?: string[];
	onToggleSubProject?: (projectId: string, subProjectId: string) => void;
	projectPercentage?: number;
	onPercentageChange?: (projectId: string, percentage: number) => void;
	projectNote?: string;
	onSaveNote?: (projectId: string, note: string) => void;
	hasCoalitionBoost?: boolean;
	onToggleCoalitionBoost?: (projectId: string) => void;
	/** Ouvre le panneau « tout sur ce projet » (engrenage). */
	onOpenDetails?: (project: SimulatorProject) => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({
	project,
	isCompleted,
	isSimulated,
	onToggleSimulation,
	completedSubProjectIds = [],
	simulatedSubProjects = [],
	onToggleSubProject,
	projectPercentage = 100,
	onPercentageChange,
	projectNote,
	onSaveNote,
	hasCoalitionBoost = false,
	onToggleCoalitionBoost,
	onOpenDetails,
}) => {
	const [isExpanded, setIsExpanded] = useState(false);
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);

	const hasSubProjects = project.subProjects && project.subProjects.length > 0;
	const maxPercentage = getProjectMaxPercentage(project);
	const canUseMaxShortcut = maxPercentage > 100;
	const isMaxPercentageApplied = projectPercentage === maxPercentage;

	const handleContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		// Toujours afficher le menu contextuel (pour les notes)
		setContextMenu({ x: e.clientX, y: e.clientY });
	};

	const handleCloseContextMenu = () => {
		setContextMenu(null);
	};

	const handleOpenModal = () => {
		setIsModalOpen(true);
	};

	const handleCloseModal = () => {
		setIsModalOpen(false);
	};

	const handleOpenNoteModal = () => {
		setIsNoteModalOpen(true);
	};

	const handleCloseNoteModal = () => {
		setIsNoteModalOpen(false);
	};

	const handleSavePercentage = (percentage: number) => {
		if (onPercentageChange) {
			onPercentageChange(project.id, clampProjectPercentage(percentage, project));
		}
	};

	const handleSaveNote = (projectId: string, note: string) => {
		if (onSaveNote) {
			onSaveNote(projectId, note);
		}
	};

	const handleMainClick = () => {
		if (hasSubProjects) {
			// Si c'est un projet avec sous-projets, on déplie/replie
			setIsExpanded(!isExpanded);
		} else {
			// Sinon on toggle la simulation comme avant
			if (!isCompleted) {
				if (isSimulated) onPercentageChange?.(project.id, 100);
				onToggleSimulation(project.id);
			}
		}
	};

	const handleSubProjectClick = (e: React.MouseEvent, subProjectId: string) => {
		e.stopPropagation();
		if (onToggleSubProject && !isCompleted) {
			onToggleSubProject(project.id, subProjectId);
		}
	};

	const handleIconClick = (e: React.MouseEvent) => {
		e.stopPropagation();

		if (!hasSubProjects || isCompleted || !onToggleSubProject) return;

		// Sur les modules ACTIFS uniquement, comme `allSubProjectsSimulated` qui
		// décide de la branche : itérer la liste complète ici ferait COCHER le
		// module retiré au moment même où l'on demande à tout décocher.
		if (allSubProjectsSimulated) {
			active.forEach((sub) => {
				onToggleSubProject(project.id, sub.id);
			});
		} else {
			// Sinon, cocher tous les sous-projets non cochés
			active.forEach((sub) => {
				if (!simulatedSubProjects.includes(sub.id)) {
					onToggleSubProject(project.id, sub.id);
				}
			});
		}
	};

	const handleStarClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (isCompleted || !canUseMaxShortcut) return;
		if (isMaxPercentageApplied) {
			onPercentageChange?.(project.id, 100);
		} else {
			if (!isSimulated) onToggleSimulation(project.id);
			onPercentageChange?.(project.id, maxPercentage);
		}
	};

	const handlePctInput = (e: React.ChangeEvent<HTMLInputElement>) => {
		const raw = e.target.value.replace(/\D/g, '');
		// Champ vidé : on ne descend pas le projet à 0 % au premier retour arrière,
		// on attend la nouvelle valeur.
		if (raw === '') return;
		// Taper une valeur est une intention explicite : elle simule le projet.
		// Le FOCUS, lui, ne doit rien faire — tabuler dans une catégorie de
		// cinquante projets les simulait tous, et un simple clic pour lire la
		// valeur suffisait à en simuler un.
		if (!isSimulated) onToggleSimulation(project.id);
		onPercentageChange?.(project.id, clampProjectPercentage(parseInt(raw, 10), project));
	};

	/**
	 * Les modules que l'école compte encore. Un module retiré ne peut plus être
	 * validé par personne : l'inclure ici rendrait la piscine éternellement
	 * incomplète à l'écran, alors que le calcul RNCP, lui, l'ignore. Les deux
	 * doivent dire la même chose.
	 */
	const active = hasSubProjects ? activeSubProjects(project) : [];

	const allSubProjectsSimulated =
		active.length > 0 &&
		active.every((sub) => simulatedSubProjects.includes(sub.id));

	const getStatus = () => {
		if (isCompleted) return 'completed';
		if (hasSubProjects) {
			// Pour les projets avec sous-projets, on est simulé seulement si tous les sous-projets sont simulés
			if (allSubProjectsSimulated) return 'simulated';
			if (completedSubProjectIds.length > 0) return 'partial';
		} else {
			if (isSimulated) return 'simulated';
		}
		return 'available';
	};

	const status = getStatus();

	// Calculer l'XP modifié par le pourcentage et le boost coalition.
	// `effectiveProjectXP` déduit les modules retirés : afficher l'XP brut ferait
	// annoncer par la carte un chiffre que la catégorie ne compte pas.
	let modifiedXP = Math.round((effectiveProjectXP(project) * projectPercentage) / 100);
	if (hasCoalitionBoost) {
		modifiedXP = Math.round(modifiedXP * 1.042); // +4.2%
	}

	const showPercentage = projectPercentage !== 100;

	return (
		<>
			<div
				className={`project-card ${status}${project.retired ? ' project-card--retired' : ''}`}
				onContextMenu={handleContextMenu}
			>
				<motion.div
					className="project-main"
					data-tour={!isCompleted && !hasSubProjects ? 'calendar-test-project' : undefined}
					onClick={handleMainClick}
					whileHover={!isCompleted ? { scale: 1.01, y: -1 } : {}}
					whileTap={!isCompleted ? { scale: 0.99 } : {}}
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.2 }}
				>
					<div className="project-header">
						{isCompleted ? (
							<div className="project-status-icon">✅</div>
						) : !hasSubProjects && canUseMaxShortcut && !project.retired ? (
							<button
								className={`project-star ${isMaxPercentageApplied ? 'active' : ''}`}
								data-tour="project-star"
								onClick={handleStarClick}
								title={`Simuler à ${maxPercentage}%`}
							>
								{isMaxPercentageApplied ? '★' : '☆'}
							</button>
						) : null}
						{hasSubProjects && !isCompleted && (
							<div
								className="project-status-icon clickable"
								onClick={handleIconClick}
								title={allSubProjectsSimulated ? 'Décocher tous les sous-projets' : 'Cocher tous les sous-projets'}
							>
								{allSubProjectsSimulated ? '🎯' : completedSubProjectIds.length > 0 ? '🟢' : '⭕'}
							</div>
						)}
						<div className="project-info">
							<h4 className="project-name">
								{project.name}
								{/* Sans cette mention, quelqu'un qui a validé ce projet verrait
								    simplement sa progression ne pas bouger, sans explication. */}
								{project.retired && (
									<>
										<span className="project-retired-badge">hors référentiel</span>
										<span className="project-retired-hint">
											L'école ne compte plus ce projet dans cette catégorie : il n'entre
											ni dans les projets requis ni dans l'XP exigé.
										</span>
									</>
								)}
							</h4>
						</div>
						{/* Contrôles toujours présents sur un projet simulable : les
						    faire apparaître seulement une fois le projet coché faisait
						    sauter toute la ligne au moindre clic. Ils sont simplement
						    atténués tant que le projet n'est pas dans la simulation. */}
						{/* Un projet hors référentiel n'apporte plus rien au RNCP : pourcentage,
						    boost de coalition et XP n'y ont plus de sens, et laisser ces
						    contrôles laisserait croire qu'ils changent encore quelque chose.
						    L'engrenage reste, c'est lui qui porte l'explication. */}
						{!hasSubProjects && !isCompleted && !project.retired && (
							<div
								className={`project-sim-controls${isSimulated ? '' : ' inactive'}`}
								onClick={(e) => e.stopPropagation()}
							>
								<div className="project-pct-wrapper">
									<input
										type="text"
										inputMode="numeric"
										className="project-pct-input"
										value={projectPercentage}
										onChange={handlePctInput}
										title={isSimulated ? 'Pourcentage de validation' : 'Saisir un pourcentage simulera ce projet'}
									/>
									<span className="project-pct-symbol">%</span>
								</div>
								<button
									className={`project-boost-btn ${hasCoalitionBoost && isSimulated ? 'active' : ''}`}
									data-tour="project-boost"
									onClick={(e) => {
										e.stopPropagation();
										if (isSimulated) {
											onToggleCoalitionBoost?.(project.id);
											return;
										}
										// Projet non simulé : le clic veut ALLUMER le boost, pas
										// l'inverser. Un boost resté à `true` d'une simulation
										// précédente faisait donc exactement le contraire.
										onToggleSimulation(project.id);
										if (!hasCoalitionBoost) onToggleCoalitionBoost?.(project.id);
									}}
									title="Boost coalition +4,2 %"
								>
									⚡
								</button>
							</div>
						)}
						{!project.retired && (
							<span className={`project-xp ${showPercentage ? 'modified' : ''}`}>
								{modifiedXP.toLocaleString()} XP
							</span>
						)}
						{hasSubProjects && (
							<div className="expand-icon">
								{isExpanded ? '▼' : '▶'}
							</div>
						)}
						{onOpenDetails && (
							<button
								className="project-details-btn"
								data-tour="project-details"
								onClick={(e) => { e.stopPropagation(); onOpenDetails(project); }}
								title="Voir toutes les informations du projet"
								aria-label={`Informations sur ${project.name}`}
							>
								⚙
							</button>
						)}
					</div>
				</motion.div>

				<AnimatePresence>
					{hasSubProjects && isExpanded && (
						<motion.div
							className="sub-projects-expanded"
							initial={{ height: 0, opacity: 0 }}
							animate={{ height: 'auto', opacity: 1 }}
							exit={{ height: 0, opacity: 0 }}
							transition={{ duration: 0.3 }}
						>
							<div className="sub-projects-list-expanded">
								{project.subProjects!.map((subProject) => {
									const isSubCompleted = isCompleted || completedSubProjectIds.includes(subProject.id);
									const isSubSimulated = simulatedSubProjects.includes(subProject.id);
									return (
										<motion.div
											key={subProject.id}
											className={`sub-project-item ${isSubCompleted ? 'completed' : isSubSimulated ? 'simulated' : ''}${subProject.retired ? ' sub-project-item--retired' : ''}`}
											// Un module retiré ne compte plus : le laisser cochable
											// affichait un ✅ sans que rien ne bouge, ni le compteur ni l'XP.
											onClick={(e) =>
												!isSubCompleted && !subProject.retired &&
												handleSubProjectClick(e, subProject.id)
											}
											whileHover={!isSubCompleted && !subProject.retired ? { x: 4 } : {}}
											whileTap={!isSubCompleted && !subProject.retired ? { scale: 0.98 } : {}}
										>
											<div className="sub-project-checkbox">
												{isSubCompleted || isSubSimulated ? '✅' : '☐'}
											</div>
											<span className="sub-project-name">
												{subProject.name}
												{subProject.retired && (
													<span className="project-retired-badge">hors référentiel</span>
												)}
											</span>
											{subProject.xp > 0 && (
												<span className="sub-project-xp">{subProject.xp.toLocaleString()} XP</span>
											)}
										</motion.div>
									);
								})}
							</div>
							<div className="sub-projects-summary">
								{/* Dénominateur sur les modules ACTIFS : compter un module retiré
								    afficherait « 3 / 4 » sur une piscine que le RNCP considère
								    pourtant comme acquise. */}
								{isCompleted
									? `${active.length} / ${active.length} complété - Piscine validée! 🎉`
									: `${active.filter(s => completedSubProjectIds.includes(s.id) || simulatedSubProjects.includes(s.id)).length} / ${active.length} complété${allSubProjectsSimulated ? ' - Piscine validée! 🎉' : ''}`
								}
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>

			{contextMenu && (
				<ProjectContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					onClose={handleCloseContextMenu}
					onEditPercentage={handleOpenModal}
					onEditNote={handleOpenNoteModal}
					projectName={project.name}
					isCompleted={isCompleted}
					hasCoalitionBoost={hasCoalitionBoost}
					onToggleCoalitionBoost={() => onToggleCoalitionBoost?.(project.id)}
				/>
			)}

			<ProjectPercentageModal
				isOpen={isModalOpen}
				onClose={handleCloseModal}
				onSave={handleSavePercentage}
				projectName={project.name}
				currentPercentage={projectPercentage}
				maxPercentage={maxPercentage}
			/>

			{onSaveNote && (
				<ProjectNoteModal
					isOpen={isNoteModalOpen}
					onClose={handleCloseNoteModal}
					onSave={handleSaveNote}
					projectName={project.name}
					projectId={project.id}
					currentNote={projectNote}
				/>
			)}
		</>
	);
};

export default ProjectCard;
