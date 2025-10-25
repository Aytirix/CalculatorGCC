import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ProjectCategory, CategoryValidation } from '@/types/rncp.types';
import { isProjectCompleted, findProjectPercentage } from '@/utils/projectMatcher';
import ProjectCard from '../ProjectCard/ProjectCard';
import './CategorySection.scss';

interface CategorySectionProps {
	category: ProjectCategory;
	validation: CategoryValidation;
	completedProjects: string[];
	simulatedProjects: string[];
	onToggleSimulation: (projectId: string) => void;
	simulatedSubProjects?: Record<string, string[]>;
	onToggleSubProject?: (projectId: string, subProjectId: string) => void;
	projectPercentages?: Record<string, number>;
	completedProjectsPercentages?: Record<string, number>;
	onPercentageChange?: (projectId: string, percentage: number) => void;
}

const CategorySection: React.FC<CategorySectionProps> = ({
	category,
	validation,
	completedProjects,
	simulatedProjects,
	onToggleSimulation,
	simulatedSubProjects = {},
	onToggleSubProject,
	projectPercentages = {},
	completedProjectsPercentages = {},
	onPercentageChange,
}) => {
	const [isExpanded, setIsExpanded] = useState(true);

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
						{category.projects.map((project) => {
							const isCompleted = isProjectCompleted(project.slug || project.id, completedProjects);
							// Pour les projets complétés, utiliser le pourcentage réel de l'API avec normalisation
							// Pour les autres, utiliser le pourcentage personnalisé ou 100%
							const projectPercentage = isCompleted
								? findProjectPercentage(project, completedProjectsPercentages, 100)
								: (projectPercentages[project.id] || 100);

							return (
								<ProjectCard
									key={project.id}
									project={project}
									isCompleted={isCompleted}
									isSimulated={simulatedProjects.includes(project.id)}
									onToggleSimulation={onToggleSimulation}
									simulatedSubProjects={simulatedSubProjects[project.id] || []}
									onToggleSubProject={onToggleSubProject}
									projectPercentage={projectPercentage}
									onPercentageChange={isCompleted ? undefined : onPercentageChange}
								/>
							);
						})}
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
};

export default CategorySection;
