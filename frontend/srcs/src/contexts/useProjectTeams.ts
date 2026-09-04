import { useContext } from 'react';
import { ProjectTeamsContext } from './ProjectTeamsContext';

export const useProjectTeams = () => useContext(ProjectTeamsContext);
