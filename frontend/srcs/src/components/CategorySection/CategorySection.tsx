import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ProjectCategory, CategoryValidation, SimulatorProject } from '@/types/rncp.types';
import { findProjectPercentage } from '@/utils/projectMatcher';
import { clampProjectPercentage } from '@/utils/projectPercentage';
import ProjectCard from '../ProjectCard/ProjectCard';
import CustomProjectCard from '../CustomProjectCard/CustomProjectCard';
import TeammateModal from '../TeammateModal/TeammateModal';
import ProjectDetailsModal from '../ProjectDetailsModal/ProjectDetailsModal';
import { isReadOnlyMode } from '@/services/simulation.service';
import { useProjectTeams } from '@/contexts/useProjectTeams';
import './CategorySection.scss';

interface CategorySectionProps {
	category: ProjectCategory;
	validation: CategoryValidation;
	/**
	 * Identifiants des projets déjà ACQUIS, tranchés en amont.
	 *
	 * Surtout pas des slugs : juger ici qu'une piscine est acquise demanderait les
	 * slugs de ses MODULES, que ce composant n'a pas. La question est répondue une
	 * fois, au bon endroit, et il ne reste ici qu'une appartenance.
	 */
	completedProjectIds: string[];
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
	completedProjectIds,
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
	const [detailsProject, setDetailsProject] = useState<SimulatorProject | null>(null);
	const { getTeamInfo } = useProjectTeams();

	// Deux parts distinctes dans une seule barre : ce qui est ACQUIS et ce qui
	// n'est que SIMULÉ. Une barre unique nourrie par le total annonçait comme
	// acquis ce qui ne l'était pas — elle virait au vert sur de la simulation.
	const realPercentage = category.requiredXP > 0
		? Math.min((validation.realXP / category.requiredXP) * 100, 100)
		: 100;
	const projectedPercentage = category.requiredXP > 0
		? Math.min((validation.currentXP / category.requiredXP) * 100, 100)
		: 100;
	// Le segment simulé se pose SUR le réel, il n'en reprend pas la longueur.
	const simulatedPercentage = Math.max(0, projectedPercentage - realPercentage);
	// La projection n'est annoncée que si elle DIFFÈRE à l'affichage : les deux
	// nombres étant arrondis, un écart minime donnait « 58% → 58% », soit
	// exactement le doublon inutile qu'on veut éviter.
	const showProjection = Math.round(projectedPercentage) !== Math.round(realPercentage);

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
					{/* « Validé » n'est dit que d'un acquis réel. Une catégorie
					    satisfaite par la simulation est annoncée comme telle. */}
					{validation.isRealValid ? (
						<span className="validation-badge">✓ Validé</span>
					) : validation.isValid ? (
						<span className="validation-badge validation-badge--simulated">Simulé</span>
					) : null}
				</div>

				{/* Même convention que la barre : l'acquis, puis la projection en bleu
				    derrière une flèche. Le vert ne marque que ce qui est réellement
				    validé — un compteur vert nourri par la simulation annonçait
				    comme acquis ce qui ne l'était pas. */}
				<div className="category-stats">
					{/* La projection s'insère AVANT le slash : le seuil à atteindre
					    reste le dernier nombre lu, sinon « 5 / 2 → 7 » se lit comme si
					    le seuil valait 7. */}
					{category.requiredCount > 0 && (
						<div className="stat">
							<span className="stat-label">Projets:</span>
							<span className={`stat-value ${validation.realCount >= category.requiredCount ? 'valid' : ''}`}>
								{validation.realCount}
								{validation.currentCount !== validation.realCount && (
									<span className="stat-value__projected"> → {validation.currentCount}</span>
								)}
								{' / '}
								{category.requiredCount}
							</span>
						</div>
					)}
					{category.requiredXP > 0 && (
						<div className="stat">
							<span className="stat-label">XP:</span>
							<span className={`stat-value ${validation.realXP >= category.requiredXP ? 'valid' : ''}`}>
								{validation.realXP.toLocaleString()}
								{validation.currentXP !== validation.realXP && (
									<span className="stat-value__projected">
										{' '}→ {validation.currentXP.toLocaleString()}
									</span>
								)}
								{' / '}
								{category.requiredXP.toLocaleString()}
							</span>
						</div>
					)}
				</div>
			</div>

			{category.requiredXP > 0 && (
				<div className="progress-bar-container">
					<div
						className="progress-bar-bg"
						role="img"
						aria-label={
							showProjection
								? `${Math.round(realPercentage)} % acquis, ${Math.round(projectedPercentage)} % en comptant la simulation`
								: `${Math.round(realPercentage)} % acquis`
						}
					>
						{/* Largeur posée directement, animée en CSS : framer-motion
						    n'interpole pas d'un nombre (`0`) vers un pourcentage
						    (`'42%'`), il laissait la barre à zéro alors que le texte
						    annonçait le bon pourcentage. */}
						<div className="progress-bar-fill" style={{ width: `${realPercentage}%` }} />
						{simulatedPercentage > 0 && (
							<div
								className="progress-bar-fill simulated"
								style={{ width: `${simulatedPercentage}%` }}
							/>
						)}
					</div>
					<span className="progress-percentage">
						{Math.round(realPercentage)}%
						{showProjection && (
							<span className="progress-percentage__simulated">
								{' '}→ {Math.round(projectedPercentage)}%
							</span>
						)}
					</span>
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

								// Garde des piscines comprise : sans elle, la carte s'affichait
								// « validée » — vert, ✓, réglage du pourcentage désactivé — dès
								// UN module validé, pendant que la catégorie ne la comptait pas.
								const isCompleted = completedProjectIds.includes(project.id);
								const projectPercentage = isCompleted
									? findProjectPercentage(project, completedProjectsPercentages, 100)
									: clampProjectPercentage(projectPercentages[project.id] ?? 100, project);

								// Le bouton « teammates » n'a de sens que sur un projet qui se
								// fait réellement en groupe : 42 le dit via la taille d'équipe
								// de la session du campus.
								const teamInfo = getTeamInfo(project);
								const isGroupProject = teamInfo != null && !teamInfo.solo;

								return (
									<div key={project.id} className="project-card-wrapper">
										{/* La colonne du bouton « teammates » est TOUJOURS occupée :
										    rendue seulement sur les projets de groupe, elle décalait
										    tous les autres projets vers la gauche et la liste devenait
										    illisible en dents de scie. */}
										{isGroupProject ? (
											<button
												className="teammate-btn"
												data-tour="teammate-btn"
												onClick={() => setTeammateProject(project)}
												title={
													teamInfo.groupMin != null && teamInfo.groupMax != null
														? `Trouver des teammates (groupe de ${teamInfo.groupMin} à ${teamInfo.groupMax})`
														: 'Trouver des teammates'
												}
											>
												👥
											</button>
										) : (
											<span className="teammate-btn-placeholder" aria-hidden="true" />
										)}
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
											onOpenDetails={setDetailsProject}
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
					teamInfo={getTeamInfo(teammateProject)}
					isSimulated={simulatedProjects.includes(teammateProject.id)}
					/>
			)}

			{detailsProject && (
				<ProjectDetailsModal
					project={detailsProject}
					teamInfo={getTeamInfo(detailsProject)}
					isCompleted={completedProjectIds.includes(detailsProject.id)}
					isSimulated={simulatedProjects.includes(detailsProject.id)}
					percentage={clampProjectPercentage(
						projectPercentages[detailsProject.id] ?? 100,
						detailsProject
					)}
					hasCoalitionBoost={coalitionBoosts[detailsProject.id] || false}
					// Sur le profil d'un autre étudiant, rien n'est enregistré : le
					// panneau doit le dire au lieu de proposer des réglages qui
					// seront jetés — c'est ce que fait déjà le Holy Graph.
					readOnly={isReadOnlyMode()}
					onToggleSimulation={onToggleSimulation}
					onPercentageChange={onPercentageChange}
					onToggleCoalitionBoost={onToggleCoalitionBoost}
					onClose={() => setDetailsProject(null)}
				/>
			)}
		</motion.div>
	);
};

export default CategorySection;
