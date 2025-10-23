import React from 'react';
import { motion } from 'framer-motion';
import type { SimulatorProject } from '@/types/rncp.types';
import './ProjectCard.scss';

interface ProjectCardProps {
  project: SimulatorProject;
  isCompleted: boolean;
  isSimulated: boolean;
  onToggleSimulation: (projectId: string) => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  isCompleted,
  isSimulated,
  onToggleSimulation,
}) => {
  const handleClick = () => {
    if (!isCompleted) {
      onToggleSimulation(project.id);
    }
  };

  const getStatus = () => {
    if (isCompleted) return 'completed';
    if (isSimulated) return 'simulated';
    return 'available';
  };

  const status = getStatus();

  return (
    <motion.div
      className={`project-card ${status}`}
      onClick={handleClick}
      whileHover={!isCompleted ? { scale: 1.02, y: -2 } : {}}
      whileTap={!isCompleted ? { scale: 0.98 } : {}}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="project-header">
        <div className="project-status-icon">
          {isCompleted && '✅'}
          {isSimulated && '🎯'}
          {!isCompleted && !isSimulated && '⭕'}
        </div>
        <div className="project-info">
          <h4 className="project-name">{project.name}</h4>
          <span className="project-xp">{project.xp.toLocaleString()} XP</span>
        </div>
      </div>

      {project.subProjects && project.subProjects.length > 0 && (
        <div className="sub-projects">
          <div className="sub-projects-header">
            <span>📚 {project.subProjects.length} sous-projets</span>
          </div>
          <div className="sub-projects-list">
            {project.subProjects.slice(0, 3).map((sub) => (
              <span key={sub.id} className="sub-project-tag">
                {sub.name}
              </span>
            ))}
            {project.subProjects.length > 3 && (
              <span className="sub-project-tag more">
                +{project.subProjects.length - 3}
              </span>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default ProjectCard;
