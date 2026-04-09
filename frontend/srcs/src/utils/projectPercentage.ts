import type { SimulatorProject } from '@/types/rncp.types';

export const DEFAULT_PROJECT_MAX_PERCENTAGE = 125;

export const getProjectMaxPercentage = (
	project?: Pick<SimulatorProject, 'maxPercentage'>
): number => project?.maxPercentage ?? DEFAULT_PROJECT_MAX_PERCENTAGE;

export const clampPercentage = (
	percentage: number,
	maxPercentage: number = DEFAULT_PROJECT_MAX_PERCENTAGE,
	minPercentage: number = 0
): number => Math.max(minPercentage, Math.min(maxPercentage, percentage));

export const clampProjectPercentage = (
	percentage: number,
	project?: Pick<SimulatorProject, 'maxPercentage'>,
	minPercentage: number = 0
): number => clampPercentage(percentage, getProjectMaxPercentage(project), minPercentage);
