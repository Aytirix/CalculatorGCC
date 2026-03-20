import React from 'react';
import type { Project42 } from '@/services/backend-api42.service';
import type { ProfessionalExperience } from '@/pages/ProfessionalExperience/ProfessionalExperience';

interface ProfExpListProps {
  entries: Project42[];
  evalsByParent: Record<string, Project42[]>;
  manualExperiences: ProfessionalExperience[];
  getParentKey: (p: Project42) => string;
  onDeleteManual: (id: string) => void;
  onEditManual: (exp: ProfessionalExperience) => void;
  apiExpPercentages: Record<number, number>;
  onApiExpPercentageChange: (id: number, percentage: number) => void;
}

function getApiEntryXP(p: Project42, percentage: number): number {
  const lower = p.project.name.toLowerCase();
  const slug = p.project.slug?.toLowerCase() || '';
  if (lower.includes('alternance')) {
    const match = lower.match(/(\d+)\s*an/);
    const years = match ? parseInt(match[1]) : 1;
    return Math.round(90000 * years * (percentage / 100));
  }
  // Stage / Work Experience (6 mois par défaut)
  if (slug.startsWith('work-experience') || lower.includes('stage')) {
    return Math.round(10500 * 6 * (percentage / 100));
  }
  return 0;
}

function getDefaultPercentage(evals: Project42[]): number {
  const marks = evals.map(ev => ev.final_mark).filter((m): m is number => m != null);
  if (marks.length === 0) return 100;
  const avg = Math.round(marks.reduce((a, b) => a + b, 0) / marks.length);
  return Math.min(100, avg);
}

const ProfExpList: React.FC<ProfExpListProps> = ({
  entries,
  evalsByParent,
  manualExperiences,
  getParentKey,
  onDeleteManual,
  onEditManual,
  apiExpPercentages,
  onApiExpPercentageChange,
}) => (
  <div className="prof-exp-list">
    {entries.length === 0 && manualExperiences.length === 0 && (
      <p className="prof-exp-empty">Aucune expérience professionnelle détectée.</p>
    )}
    {entries.map((p) => {
      const evals = evalsByParent[getParentKey(p)] || [];
      const isAlt = p.project.name.toLowerCase().includes('alternance');
      const isStage = !isAlt;
      const defaultPct = getDefaultPercentage(evals);
      const pct = apiExpPercentages[p.id] ?? (p.validated ? p.final_mark || 100 : defaultPct);

      const xp = getApiEntryXP(p, pct);
      return (
        <div key={p.id} className="prof-exp-item">
          <span className="prof-exp-item__type">{isAlt ? '💼' : '🎓'}</span>
          <span className="prof-exp-item__name">{p.project.name}</span>
          <div className="prof-exp-item__marks">
            {evals.filter(ev => ev.final_mark != null).map((ev) => (
              <span
                key={ev.id}
                className="prof-exp-item__mark prof-exp-item__mark--sub"
                title={ev.project.name}
              >
                {ev.final_mark}%
              </span>
            ))}
          </div>
          {!p.validated && (isAlt || isStage) && (
            <div className="prof-exp-item__pct-edit">
              <div className="prof-exp-item__pct-wrapper">
                <input
                  type="text"
                  inputMode="numeric"
                  value={pct}
                  onChange={(e) => {
                    const v = parseInt(e.target.value.replace(/\D/g, '')) || 0;
                    onApiExpPercentageChange(p.id, Math.min(125, v));
                  }}
                  className="prof-exp-item__pct-input"
                />
                <span className="prof-exp-item__pct-symbol">%</span>
              </div>
              <span className="prof-exp-item__status validated">{xp.toLocaleString()} XP</span>
            </div>
          )}
          <span className={`prof-exp-item__status ${p.validated ? 'validated' : 'pending'}`}>
            {p.validated ? `Validé (${p.final_mark}%)` : 'En cours'}
          </span>
        </div>
      );
    })}
    {manualExperiences.map((exp) => (
      <div key={exp.id} className="prof-exp-item prof-exp-item--manual">
        <span className="prof-exp-item__type">{exp.type === 'alternance' ? '💼' : '🎓'}</span>
        <span className="prof-exp-item__name">
          {exp.type === 'alternance'
            ? `Alternance ${exp.duration} an${exp.duration > 1 ? 's' : ''}`
            : `Stage ${exp.duration} mois`}
        </span>
        <div className="prof-exp-item__marks">
          <span className="prof-exp-item__mark prof-exp-item__mark--sub">{exp.xpEarned.toLocaleString()} XP</span>
          {exp.coalitionBoost > 0 && (
            <span className="prof-exp-item__mark prof-exp-item__mark--sub">⚡</span>
          )}
        </div>
        <span className="prof-exp-item__status validated">{exp.validationPercentage}%</span>
        <button className="prof-exp-item__edit" onClick={() => onEditManual(exp)} title="Modifier">✎</button>
        <button className="prof-exp-item__delete" onClick={() => onDeleteManual(exp.id)} title="Supprimer">×</button>
      </div>
    ))}
  </div>
);

export default ProfExpList;
