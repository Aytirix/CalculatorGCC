import React, { useEffect, useState } from 'react';
import type {
  HolyGraphProject,
  HolyGraphProjectDetailsResponse,
  ProjectRequirement,
} from '@/services/backend-api42.service';
import type { SimulatedProjectData } from '@/services/simulation.service';
import { STATUS_LABELS, statusOf } from './projectStatus';

/** Pourcentage de validation minimum, aligné sur le reste du simulateur. */
const MIN_PERCENTAGE = 50;

const KIND_LABELS: Record<string, string> = {
  project: 'Projet',
  big_project: 'Gros projet',
  rush: 'Rush',
  piscine: 'Piscine',
  exam: 'Examen',
  part_time: 'Temps partiel',
};

interface ProjectPanelProps {
  project: HolyGraphProject;
  details: HolyGraphProjectDetailsResponse | null;
  simulation: SimulatedProjectData | null;
  /**
   * XP réellement ajouté au niveau projeté. Il vient de nos données RNCP quand
   * le projet y figure (c'est cette valeur que le Dashboard additionne), et de
   * l'API 42 sinon — les deux divergent sur quelques projets.
   */
  simulationXp: number;
  maxPercentage: number;
  /** Projet à sous-projets (piscine) : il se simule module par module ailleurs. */
  hasSubProjects: boolean;
  readOnly: boolean;
  /** false tant que la simulation de l'utilisateur n'est pas chargée. */
  simulationReady: boolean;
  onToggleSimulation: () => void;
  onPercentageChange: (value: number) => void;
  onClose: () => void;
}

/** Une ligne « libellé / valeur » du tableau de caractéristiques. */
const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="panel-fact">
    <span className="panel-fact-label">{label}</span>
    <span className="panel-fact-value">{children}</span>
  </div>
);

/** Un prérequis, coché s'il est déjà rempli. */
const Requirement: React.FC<{ item: ProjectRequirement }> = ({ item }) => (
  <li className={item.met ? 'met' : 'unmet'}>
    <span className="requirement-mark">{item.met ? '✓' : '✗'}</span>
    {item.name}
  </li>
);

const ProjectPanel: React.FC<ProjectPanelProps> = ({
  project,
  details,
  simulation,
  simulationXp,
  maxPercentage,
  hasSubProjects,
  readOnly,
  simulationReady,
  onToggleSimulation,
  onPercentageChange,
  onClose,
}) => {
  const percentage = simulation?.percentage ?? 100;
  // Saisie libre tant que le champ est en cours d'édition : borner à chaque
  // frappe empêcherait de taper « 75 » (le 7 seul serait remonté à 50).
  const [percentageText, setPercentageText] = useState(String(percentage));
  useEffect(() => setPercentageText(String(percentage)), [percentage, project.id]);

  const commitPercentage = () => {
    const value = parseInt(percentageText, 10);
    if (Number.isNaN(value)) {
      setPercentageText(String(percentage));
      return;
    }
    onPercentageChange(value);
  };

  const status = statusOf(project);
  const info = details?.details ?? null;
  const xp = info?.xp || project.difficulty;
  const isSimulated = simulation !== null;

  // Un projet déjà validé n'a rien à faire dans la simulation : son XP est déjà
  // compté dans le niveau réel (le Dashboard retire d'ailleurs tout seul les
  // projets simulés qui finissent par être validés).
  const simulable = !project.validated && !hasSubProjects && !readOnly && simulationReady;

  const groupLabel = info
    ? info.solo
      ? 'Solo'
      : info.groupMin != null && info.groupMax != null
        ? `Groupe de ${info.groupMin} à ${info.groupMax}`
        : info.groupMax != null
          ? `Groupe (jusqu'à ${info.groupMax})`
          : 'Groupe'
    : null;

  const hasRequirements =
    !!info &&
    (info.requiredProjects.length > 0 ||
      (info.anyOfProjects?.projects.length ?? 0) > 0 ||
      info.minLevel != null ||
      info.requiredQuests.length > 0 ||
      info.exclusiveProjects.length > 0);

  return (
    <aside className="holy-graph-panel" onMouseDown={(e) => e.stopPropagation()}>
      <header className="panel-header">
        <div>
          <h2>{project.name}</h2>
          <div className="panel-badges">
            <span className={`panel-badge status-${status}`}>{STATUS_LABELS[status]}</span>
            <span className="panel-badge">
              {/* 42 range les examens sous le `kind` « piscine » : c'est le drapeau
                  `exam` du projet qui fait foi pour l'affichage. */}
              {project.exam ? 'Examen' : (KIND_LABELS[project.kind] ?? project.kind)}
            </span>
            {isSimulated && <span className="panel-badge simulated">Simulé</span>}
          </div>
        </div>
        <button className="panel-close" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
      </header>

      <div className="panel-body">
        <div className="panel-facts">
          <Fact label="XP">{xp > 0 ? xp.toLocaleString('fr-FR') : 'Non renseigné'}</Fact>
          {project.finalMark != null && <Fact label="Note finale">{project.finalMark}</Fact>}
          {info?.estimateTime && <Fact label="Temps estimé">{info.estimateTime}</Fact>}
          {info?.durationDays != null && <Fact label="Durée">{info.durationDays} jours</Fact>}
          {groupLabel && <Fact label="Équipe">{groupLabel}</Fact>}
          {info?.correctionNumber != null && (
            <Fact label="Corrections">
              {info.correctionNumber} correcteur{info.correctionNumber > 1 ? 's' : ''}
            </Fact>
          )}
          {info?.retryDelayDays != null && (
            <Fact label="Délai de retry">{info.retryDelayDays} jours</Fact>
          )}
          {info && info.uploads.length > 0 && <Fact label="Auto-correction">{info.uploads.join(', ')}</Fact>}
        </div>

        {details?.loading && <p className="panel-note">Récupération du détail du projet…</p>}
        {details?.reason === 'UNKNOWN_CAMPUS' && (
          <p className="panel-note">
            Campus inconnu : reconnecte-toi une fois pour que le détail des projets puisse être
            récupéré.
          </p>
        )}
        {details?.reason === 'NOT_OFFERED' && (
          <p className="panel-note">Ce projet n'est pas proposé sur ton campus.</p>
        )}

        {info?.description && (
          <section className="panel-section">
            <h3>Description</h3>
            <p className="panel-description">{info.description}</p>
          </section>
        )}

        {info && info.objectives.length > 0 && (
          <section className="panel-section">
            <h3>Objectifs</h3>
            <div className="panel-chips">
              {info.objectives.map((objective) => (
                <span key={objective} className="panel-chip">
                  {objective}
                </span>
              ))}
            </div>
          </section>
        )}

        {project.layers.length > 0 && (
          <section className="panel-section">
            <h3>Layers</h3>
            <div className="panel-chips">
              {project.layers.map((layer) => (
                <span key={layer} className="panel-chip">
                  {layer}
                </span>
              ))}
            </div>
          </section>
        )}

        {hasRequirements && info && (
          <section className="panel-section">
            <h3>Prérequis</h3>
            <ul className="panel-requirements">
              {info.minLevel != null && (
                <li className={info.minLevelMet ? 'met' : 'unmet'}>
                  <span className="requirement-mark">{info.minLevelMet ? '✓' : '✗'}</span>
                  Niveau {info.minLevel} minimum (tu es niveau {Math.floor(info.level)})
                </li>
              )}
              {info.requiredProjects.map((item) => (
                <Requirement key={item.slug} item={item} />
              ))}
            </ul>

            {info.anyOfProjects && info.anyOfProjects.projects.length > 0 && (
              <>
                <p className="panel-subtitle">
                  {info.anyOfProjects.count} projet
                  {info.anyOfProjects.count > 1 ? 's' : ''} à valider parmi cette liste —{' '}
                  {info.anyOfProjects.done}/{info.anyOfProjects.count}
                </p>
                <ul className="panel-requirements">
                  {info.anyOfProjects.projects.map((item) => (
                    <Requirement key={item.slug} item={item} />
                  ))}
                </ul>
              </>
            )}

            {info.requiredQuests.length > 0 && (
              <p className="panel-subtitle">
                Rang du tronc commun exigé : {info.requiredQuests.join(', ')}
              </p>
            )}

            {info.exclusiveProjects.length > 0 && (
              <p className="panel-subtitle">
                Exclusif avec : {info.exclusiveProjects.map((p) => p.name).join(', ')}
              </p>
            )}
          </section>
        )}

        <section className="panel-section panel-simulation">
          <h3>Simulation</h3>
          {project.validated && <p className="panel-note">Projet déjà validé : rien à simuler.</p>}
          {!project.validated && readOnly && (
            <p className="panel-note">Profil consulté en lecture seule.</p>
          )}
          {!project.validated && !readOnly && hasSubProjects && (
            <p className="panel-note">
              Ce projet se simule module par module depuis le Dashboard.
            </p>
          )}
          {simulable && (
            <>
              <label className="panel-toggle">
                <input type="checkbox" checked={isSimulated} onChange={onToggleSimulation} />
                Je compte faire ce projet
              </label>

              {isSimulated && (
                <div className="panel-percentage">
                  <div className="panel-percentage-head">
                    <span>Pourcentage de validation</span>
                    <input
                      type="number"
                      min={MIN_PERCENTAGE}
                      max={maxPercentage}
                      value={percentageText}
                      onChange={(e) => setPercentageText(e.target.value)}
                      onBlur={commitPercentage}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitPercentage();
                      }}
                    />
                  </div>
                  <input
                    type="range"
                    min={MIN_PERCENTAGE}
                    max={maxPercentage}
                    step={5}
                    value={percentage}
                    onChange={(e) => onPercentageChange(parseInt(e.target.value, 10))}
                  />
                  <div className="panel-percentage-scale">
                    <span>{MIN_PERCENTAGE}%</span>
                    <span>{maxPercentage}%</span>
                  </div>
                  {simulationXp > 0 && (
                    <p className="panel-note">
                      +
                      {Math.round((simulationXp * percentage) / 100).toLocaleString('fr-FR')}{' '}
                      XP dans le niveau projeté
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        <a
          className="panel-link"
          href={`https://projects.intra.42.fr/projects/${project.slug}`}
          target="_blank"
          rel="noreferrer"
        >
          Ouvrir sur l'intra ↗
        </a>
      </div>
    </aside>
  );
};

export default ProjectPanel;
