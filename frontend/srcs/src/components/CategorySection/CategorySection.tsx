import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ProjectCategory, CategoryValidation, SimulatorProject } from '@/types/rncp.types';
import { isProjectCompleted, findProjectPercentage } from '@/utils/projectMatcher';
import ProjectCard from '../ProjectCard/ProjectCard';
import CustomProjectCard from '../CustomProjectCard/CustomProjectCard';
import TeammateModal from '../TeammateModal/TeammateModal';
import './CategorySection.scss';

interface CategorySectionProps {
	category: ProjectCategory;
	validation: CategoryValidation;
	completedProjects: string[];
	simulatedProjects: string[];
	onToggleSimulation: (projectId: string) => void;
	completedSubProjects?: Record<string, string[]>;
	simulatedSubProjects?: Record<string, string[]>;
	onToggleSubProject?: (projectId: string, subProjectId: string) => void;
	projectPercentages?: Record<string, number>;
	completedProjectsPercentages?: Record<string, number>;
	onPercentageChange?: (projectId: string, percentage: number) => void;
	isOtherProjectsCategory?: boolean;
	onAddCustomProject?: () => void;
	onEditCustomProject?: (project: SimulatorProject) => void;
	onDeleteCustomProject?: (id: string) => void;
	projectNotes?: Record<string, string>;
	onSaveNote?: (projectId: string, note: string) => void;
	coalitionBoosts?: Record<string, boolean>;
	onToggleCoalitionBoost?: (projectId: string) => void;
}

const CategorySection: React.FC<CategorySectionProps> = ({
	category,
	validation,
	completedProjects,
	simulatedProjects,
	onToggleSimulation,
	completedSubProjects = {},
	simulatedSubProjects = {},
	onToggleSubProject,
	projectPercentages = {},
	completedProjectsPercentages = {},
	onPercentageChange,
	isOtherProjectsCategory = false,
	onAddCustomProject,
	onEditCustomProject,
	onDeleteCustomProject,
	projectNotes = {},
	onSaveNote,
	coalitionBoosts = {},
	onToggleCoalitionBoost,
}) => {
	const [isExpanded, setIsExpanded] = useState(true);
	const [teammateProject, setTeammateProject] = useState<SimulatorProject | null>(null);

	const progressPercentage = category.requiredXP > 0
		? Math.min((validation.currentXP / category.requiredXP) * 100, 100)
		: 100;

	return (
		<motion.div
			className="category-section"
			initial={{ opacity: 0, y: 20 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.3 }}
		>
			<div
				className="category-header"
				onClick={() => setIsExpanded(!isExpanded)}
			>
				<div className="category-title">
					<span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
					<h3>{category.name}</h3>
					{validation.isValid && <span className="validation-badge">✓ Validé</span>}
				</div>

				<div className="category-stats">
					{category.requiredCount > 0 && (
						<div className="stat">
							<span className="stat-label">Projets:</span>
							<span className={`stat-value ${validation.currentCount >= category.requiredCount ? 'valid' : ''}`}>
								{validation.currentCount} / {category.requiredCount}
							</span>
						</div>
					)}
					{category.requiredXP > 0 && (
						<div className="stat">
							<span className="stat-label">XP:</span>
							<span className={`stat-value ${validation.currentXP >= category.requiredXP ? 'valid' : ''}`}>
								{validation.currentXP.toLocaleString()} / {category.requiredXP.toLocaleString()}
							</span>
						</div>
					)}
				</div>
			</div>

			{category.requiredXP > 0 && (
				<div className="progress-bar-container">
					<div className="progress-bar-bg">
						<motion.div
							className={`progress-bar-fill ${validation.isValid ? 'completed' : ''}`}
							initial={{ width: 0 }}
							animate={{ width: `${progressPercentage}%` }}
							transition={{ duration: 0.5, ease: 'easeOut' }}
						/>
					</div>
					<span className="progress-percentage">{Math.round(progressPercentage)}%</span>
				</div>
			)}

			<AnimatePresence>
				{isExpanded && (
					<motion.div
						className="projects-grid"
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: 'auto', opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.3 }}
					>
						{/* Bouton d'ajout pour la catégorie "Autres projets" */}
						{isOtherProjectsCategory && onAddCustomProject && (
							<button
								className="add-custom-project-button"
								data-tour="add-custom-project"
								onClick={onAddCustomProject}
								title="Ajouter un projet personnalisé"
							>
								<span className="add-icon">+</span>
								<span className="add-label">Ajouter un projet</span>
							</button>
						)}

						{/* Affichage des projets - ordre d'origine */}
						{category.projects
							.map((project) => {
								if (isOtherProjectsCategory && onEditCustomProject && onDeleteCustomProject) {
									return (
										<CustomProjectCard
											key={project.id}
											id={project.id}
											name={project.name}
											xp={project.xp}
											onEdit={() => onEditCustomProject(project)}
											onDelete={onDeleteCustomProject}
										/>
									);
								}

								const isCompleted = isProjectCompleted(project.slug || project.id, completedProjects);
								const projectPercentage = isCompleted
									? findProjectPercentage(project, completedProjectsPercentages, 100)
									: (projectPercentages[project.id] || 100);

								return (
									<div key={project.id} className="project-card-wrapper">
										<button
											className="teammate-btn"
											data-tour="teammate-btn"
											onClick={() => setTeammateProject(project)}
											title="Trouver des teammates"
										>
											👥
										</button>
										<ProjectCard
											project={project}
											isCompleted={isCompleted}
											isSimulated={simulatedProjects.includes(project.id)}
											onToggleSimulation={onToggleSimulation}
											completedSubProjectIds={completedSubProjects[project.id] || []}
											simulatedSubProjects={simulatedSubProjects[project.id] || []}
											onToggleSubProject={onToggleSubProject}
											projectPercentage={projectPercentage}
											onPercentageChange={isCompleted ? undefined : onPercentageChange}
											projectNote={projectNotes[project.id]}
											onSaveNote={onSaveNote}
											hasCoalitionBoost={coalitionBoosts[project.id] || false}
											onToggleCoalitionBoost={onToggleCoalitionBoost}
										/>
									</div>
								);
							})}
					</motion.div>
				)}
			</AnimatePresence>

			{teammateProject && (
				<TeammateModal
					isOpen={true}
					onClose={() => setTeammateProject(null)}
					projectId={teammateProject.id}
					projectName={teammateProject.name}
					/>
			)}
		</motion.div>
	);
};

export default CategorySection;
