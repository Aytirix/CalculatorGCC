import type { HolyGraphProject } from '@/services/backend-api42.service';

export interface StatusStyle {
  fill: string;
  stroke: string;
}

export const NODE_DARK_FILL = '#0d1b23';

export const STATUS_STYLES: Record<string, StatusStyle> = {
  validated: { fill: '#2dd4bf', stroke: '#2dd4bf' },
  in_progress: { fill: '#38bdf8', stroke: '#38bdf8' },
  waiting_for_correction: { fill: '#fbbf24', stroke: '#fbbf24' },
  finished: { fill: '#f87171', stroke: '#f87171' },
  available: { fill: NODE_DARK_FILL, stroke: '#e2e8f0' },
};

export const STATUS_LABELS: Record<string, string> = {
  validated: 'Validé',
  in_progress: 'En cours',
  waiting_for_correction: 'En attente de correction',
  finished: 'Rendu (non validé)',
  available: 'Disponible',
};

export function statusOf(p: HolyGraphProject): string {
  if (p.validated) return 'validated';
  if (p.status === 'in_progress' || p.status === 'creating_group' || p.status === 'searching_a_group') return 'in_progress';
  if (p.status === 'waiting_for_correction') return 'waiting_for_correction';
  if (p.status === 'finished' && !p.validated) return 'finished';
  return 'available';
}
