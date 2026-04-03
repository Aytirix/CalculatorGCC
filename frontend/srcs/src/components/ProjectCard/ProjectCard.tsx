import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SimulatorProject } from '@/types/rncp.types';
import ProjectContextMenu from '@/components/ProjectContextMenu/ProjectContextMenu';
import ProjectPercentageModal from '@/components/ProjectPercentageModal/ProjectPercentageModal';
import ProjectNoteModal from '@/components/ProjectNoteModal/ProjectNoteModal';
import './ProjectCard.scss';

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
}) => {
	const [isExpanded, setIsExpanded] = useState(false);
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);

	const hasSubProjects = project.subProjects && project.subProjects.length > 0;

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
			onPercentageChange(project.id, percentage);
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

		// Si tous les sous-projets sont déjà cochés, les décocher tous
		if (allSubProjectsSimulated) {
			project.subProjects!.forEach((sub) => {
				onToggleSubProject(project.id, sub.id);
			});
		} else {
			// Sinon, cocher tous les sous-projets non cochés
			project.subProjects!.forEach((sub) => {
				if (!simulatedSubProjects.includes(sub.id)) {
					onToggleSubProject(project.id, sub.id);
				}
			});
		}
	};

	const handleStarClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (isCompleted) return;
		if (projectPercentage === 125) {
			onPercentageChange?.(project.id, 100);
		} else {
			if (!isSimulated) onToggleSimulation(project.id);
			onPercentageChange?.(project.id, 125);
		}
	};

	const handlePctInput = (e: React.ChangeEvent<HTMLInputElement>) => {
		const v = parseInt(e.target.value.replace(/\D/g, '')) || 0;
		onPercentageChange?.(project.id, Math.min(125, v));
	};

	const allSubProjectsSimulated = hasSubProjects
		? project.subProjects!.every((sub) => simulatedSubProjects.includes(sub.id))
		: false;

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

	// Calculer l'XP modifié par le pourcentage et le boost coalition
	let modifiedXP = Math.round((project.xp * projectPercentage) / 100);
	if (hasCoalitionBoost) {
		modifiedXP = Math.round(modifiedXP * 1.042); // +4.2%
	}

	const showPercentage = projectPercentage !== 100;

	return (
		<>
			<div className={`project-card ${status}`} onContextMenu={handleContextMenu}>
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
						) : !hasSubProjects ? (
							<button
								className={`project-star ${projectPercentage === 125 ? 'active' : ''}`}
								data-tour="project-star"
								onClick={handleStarClick}
								title="Simuler à 125%"
							>
								{projectPercentage === 125 ? '★' : '☆'}
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
							<h4 className="project-name">{project.name}</h4>
						</div>
						{status === 'simulated' && !hasSubProjects && (
							<div className="project-sim-controls" onClick={(e) => e.stopPropagation()}>
								<div className="project-pct-wrapper">
									<input
										type="text"
										inputMode="numeric"
										className="project-pct-input"
										value={projectPercentage}
										onChange={handlePctInput}
									/>
									<span className="project-pct-symbol">%</span>
								</div>
								<button
									className={`project-boost-btn ${hasCoalitionBoost ? 'active' : ''}`}
									data-tour="project-boost"
									onClick={(e) => { e.stopPropagation(); onToggleCoalitionBoost?.(project.id); }}
									title="Boost coalition +4.2%"
								>
									⚡
								</button>
							</div>
						)}
						<span className={`project-xp ${showPercentage ? 'modified' : ''}`}>
							{modifiedXP.toLocaleString()} XP
						</span>
						{hasSubProjects && (
							<div className="expand-icon">
								{isExpanded ? '▼' : '▶'}
							</div>
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
											className={`sub-project-item ${isSubCompleted ? 'completed' : isSubSimulated ? 'simulated' : ''}`}
											onClick={(e) => !isSubCompleted && handleSubProjectClick(e, subProject.id)}
											whileHover={!isSubCompleted ? { x: 4 } : {}}
											whileTap={!isSubCompleted ? { scale: 0.98 } : {}}
										>
											<div className="sub-project-checkbox">
												{isSubCompleted || isSubSimulated ? '✅' : '☐'}
											</div>
											<span className="sub-project-name">{subProject.name}</span>
											{subProject.xp > 0 && (
												<span className="sub-project-xp">{subProject.xp.toLocaleString()} XP</span>
											)}
										</motion.div>
									);
								})}
							</div>
							<div className="sub-projects-summary">
								{isCompleted
									? `${project.subProjects!.length} / ${project.subProjects!.length} complété - Piscine validée! 🎉`
									: `${project.subProjects!.filter(s => completedSubProjectIds.includes(s.id) || simulatedSubProjects.includes(s.id)).length} / ${project.subProjects!.length} complété${allSubProjectsSimulated ? ' - Piscine validée! 🎉' : ''}`
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
