import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SimulatorProject } from '@/types/rncp.types';
import ProjectContextMenu from '@/components/ProjectContextMenu/ProjectContextMenu';
import ProjectPercentageModal from '@/components/ProjectPercentageModal/ProjectPercentageModal';
import './ProjectCard.scss';

interface ProjectCardProps {
	project: SimulatorProject;
	isCompleted: boolean;
	isSimulated: boolean;
	onToggleSimulation: (projectId: string) => void;
	simulatedSubProjects?: string[];
	onToggleSubProject?: (projectId: string, subProjectId: string) => void;
	projectPercentage?: number;
	onPercentageChange?: (projectId: string, percentage: number) => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({
	project,
	isCompleted,
	isSimulated,
	onToggleSimulation,
	simulatedSubProjects = [],
	onToggleSubProject,
	projectPercentage = 100,
	onPercentageChange,
}) => {
	const [isExpanded, setIsExpanded] = useState(false);
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
	const [isModalOpen, setIsModalOpen] = useState(false);

	const hasSubProjects = project.subProjects && project.subProjects.length > 0;

	const handleContextMenu = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		// Ne pas afficher le menu contextuel si le projet est complété ou si onPercentageChange n'est pas défini
		if (isCompleted || !onPercentageChange) {
			return;
		}

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

	const handleSavePercentage = (percentage: number) => {
		if (onPercentageChange) {
			onPercentageChange(project.id, percentage);
		}
	};

	const handleMainClick = () => {
		if (hasSubProjects) {
			// Si c'est un projet avec sous-projets, on déplie/replie
			setIsExpanded(!isExpanded);
		} else {
			// Sinon on toggle la simulation comme avant
			if (!isCompleted) {
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

	const allSubProjectsSimulated = hasSubProjects
		? project.subProjects!.every((sub) => simulatedSubProjects.includes(sub.id))
		: false;

	const getStatus = () => {
		if (isCompleted) return 'completed';
		if (hasSubProjects) {
			// Pour les projets avec sous-projets, on est simulé seulement si tous les sous-projets sont simulés
			if (allSubProjectsSimulated) return 'simulated';
		} else {
			if (isSimulated) return 'simulated';
		}
		return 'available';
	};

	const status = getStatus();

	// Calculer l'XP modifié par le pourcentage
	const modifiedXP = Math.round((project.xp * projectPercentage) / 100);

	const showPercentage = projectPercentage !== 100;

	return (
		<>
			<div className={`project-card ${status}`} onContextMenu={handleContextMenu}>
				<motion.div
					className="project-main"
					onClick={handleMainClick}
					whileHover={!isCompleted ? { scale: 1.01, y: -1 } : {}}
					whileTap={!isCompleted ? { scale: 0.99 } : {}}
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.2 }}
				>
					<div className="project-header">
						<div
							className={`project-status-icon ${hasSubProjects && !isCompleted ? 'clickable' : ''}`}
							onClick={handleIconClick}
							title={hasSubProjects && !isCompleted ? (allSubProjectsSimulated ? 'Décocher tous les sous-projets' : 'Cocher tous les sous-projets') : ''}
						>
							{isCompleted && '✅'}
							{status === 'simulated' && '🎯'}
							{status === 'available' && '⭕'}
						</div>
						<div className="project-info">
							<h4 className="project-name">{project.name}</h4>
							<div className="project-xp-container">
								{showPercentage && (
									<span className="project-percentage" title={`${projectPercentage}% de ${project.xp.toLocaleString()} XP`}>
										{projectPercentage}%
									</span>
								)}
								<span className={`project-xp ${showPercentage ? 'modified' : ''}`}>
									{modifiedXP.toLocaleString()} XP
								</span>
								{showPercentage && (
									<span className="project-xp-original">
										({project.xp.toLocaleString()} XP)
									</span>
								)}
							</div>
						</div>
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
									const isSubSimulated = simulatedSubProjects.includes(subProject.id);
									return (
										<motion.div
											key={subProject.id}
											className={`sub-project-item ${isSubSimulated ? 'simulated' : ''}`}
											onClick={(e) => handleSubProjectClick(e, subProject.id)}
											whileHover={{ x: 4 }}
											whileTap={{ scale: 0.98 }}
										>
											<div className="sub-project-checkbox">
												{isSubSimulated ? '✅' : '☐'}
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
								{simulatedSubProjects.length} / {project.subProjects!.length} complété
								{allSubProjectsSimulated && ' - Piscine validée! 🎉'}
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
					projectName={project.name}
				/>
			)}

			<ProjectPercentageModal
				isOpen={isModalOpen}
				onClose={handleCloseModal}
				onSave={handleSavePercentage}
				projectName={project.name}
				currentPercentage={projectPercentage}
			/>
		</>
	);
};

export default ProjectCard;
