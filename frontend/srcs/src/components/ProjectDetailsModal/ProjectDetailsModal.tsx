import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  BackendAPI42Service,
  type HolyGraphProjectDetailsResponse,
  type ProjectRequirement,
  type ProjectTeamInfo,
} from '@/services/backend-api42.service';
import type { SimulatorProject } from '@/types/rncp.types';
import { clampProjectPercentage, getProjectMaxPercentage } from '@/utils/projectPercentage';
import './ProjectDetailsModal.scss';

/** Cursus 42 principal : c'est celui sur lequel porte tout le simulateur. */
const CURSUS_ID = 21;

/** Aligné sur le reste du simulateur (panneau du Holy Graph compris). */
const MIN_PERCENTAGE = 50;

interface ProjectDetailsModalProps {
  project: SimulatorProject;
  /** Donne l'identifiant 42 du projet — sans lui, aucun détail n'est récupérable. */
  teamInfo: ProjectTeamInfo | null;
  isCompleted: boolean;
  isSimulated: boolean;
  /** Profil d'un autre étudiant : on n'y simule rien, comme dans le Holy Graph. */
  readOnly?: boolean;
  percentage: number;
  hasCoalitionBoost: boolean;
  onToggleSimulation: (projectId: string) => void;
  onPercentageChange?: (projectId: string, percentage: number) => void;
  onToggleCoalitionBoost?: (projectId: string) => void;
  onClose: () => void;
}

/** Une ligne « libellé / valeur ». */
const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="pdm-fact">
    <span className="pdm-fact__label">{label}</span>
    <span className="pdm-fact__value">{children}</span>
  </div>
);

/** Un prérequis, coché s'il est déjà rempli. */
const Requirement: React.FC<{ item: ProjectRequirement }> = ({ item }) => (
  <li className={item.met ? 'met' : 'unmet'}>
    <span className="pdm-mark">{item.met ? '✓' : '✗'}</span>
    {item.name}
  </li>
);

/**
 * Toutes les informations d'un projet, et de quoi le simuler, en un seul endroit.
 *
 * Les caractéristiques (durée, équipe, prérequis, description…) viennent de la
 * même source que le panneau du Holy Graph : les sessions du campus, côté 42.
 * Elles ne sont accessibles que si l'on connaît l'identifiant 42 du projet, que
 * nos données RNCP ne portent pas — d'où le passage par `teamInfo`.
 */
const ProjectDetailsModal: React.FC<ProjectDetailsModalProps> = ({
  project,
  teamInfo,
  isCompleted,
  isSimulated,
  readOnly = false,
  percentage,
  hasCoalitionBoost,
  onToggleSimulation,
  onPercentageChange,
  onToggleCoalitionBoost,
  onClose,
}) => {
  const [details, setDetails] = useState<HolyGraphProjectDetailsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const maxPercentage = getProjectMaxPercentage(project);
  const hasSubProjects = !!project.subProjects && project.subProjects.length > 0;
  // Un projet déjà validé n'a rien à simuler, et une piscine se coche module
  // par module depuis la liste.
  const simulable = !isCompleted && !hasSubProjects && !readOnly;

  // Saisie libre pendant l'édition : borner à chaque frappe empêcherait de
  // taper « 75 » (le 7 seul serait remonté au plancher).
  const [percentageText, setPercentageText] = useState(String(percentage));
  useEffect(() => setPercentageText(String(percentage)), [percentage, project.id]);

  useEffect(() => {
    if (!teamInfo?.id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Le détail des sessions du campus se récupère en tâche de fond côté
    // serveur, qui répond `loading: true` en attendant. Sans nouvelle tentative,
    // le panneau affichait « Récupération… » indéfiniment — le Holy Graph, lui,
    // repasse toutes les 3 secondes.
    const load = () => {
      BackendAPI42Service.getProjectDetails(teamInfo.id, CURSUS_ID)
        .then((res) => {
          if (cancelled) return;
          setDetails(res);
          if (res.loading) timer = setTimeout(load, 3000);
        })
        .catch(() => !cancelled && setFailed(true));
    };
    load();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [teamInfo?.id]);

  const commitPercentage = useCallback(() => {
    const value = parseInt(percentageText, 10);
    if (Number.isNaN(value)) {
      setPercentageText(String(percentage));
      return;
    }
    onPercentageChange?.(project.id, clampProjectPercentage(value, project, MIN_PERCENTAGE));
  }, [percentageText, percentage, project, onPercentageChange]);

  /** Ferme en validant d'abord la saisie : un nœud retiré n'émet pas de `blur`. */
  const closeAndCommit = useCallback(() => {
    commitPercentage();
    onClose();
  }, [commitPercentage, onClose]);

  // Échap ferme, comme partout ailleurs dans l'application. Tab reste ENFERMÉ
  // dans la fenêtre : sans ce garde, le focus repartait derrière l'overlay, sur
  // des contrôles invisibles qu'on pouvait actionner sans les voir.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeAndCommit();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (!panelRef.current.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeAndCommit]);

  // Focus initial dans la fenêtre, puis restitué à l'élément d'origine.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    // La page derrière ne doit pas défiler sous la fenêtre.
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);


  // Le champ de la ligne de projet autorise des valeurs sous le plancher : le
  // curseur doit pouvoir les représenter, sinon les deux contrôles du même
  // panneau affichent deux valeurs différentes.
  const sliderMin = Math.min(MIN_PERCENTAGE, percentage);

  const info = details?.details ?? null;
  const xp = info?.xp || project.xp;

  // Même base que la ligne « XP » affichée juste au-dessus : les calculer à
  // partir de sources différentes (catalogue 42 / référentiel RNCP) les faisait
  // se contredire sur les projets où les deux divergent.
  let simulatedXP = Math.round((xp * percentage) / 100);
  if (hasCoalitionBoost) simulatedXP = Math.round(simulatedXP * 1.042);

  const groupLabel = info
    ? info.solo
      ? 'Solo'
      : info.groupMin != null && info.groupMax != null
        ? `Groupe de ${info.groupMin} à ${info.groupMax}`
        : 'Groupe'
    : teamInfo
      ? teamInfo.solo
        ? 'Solo'
        : teamInfo.groupMin != null && teamInfo.groupMax != null
          ? `Groupe de ${teamInfo.groupMin} à ${teamInfo.groupMax}`
          : 'Groupe'
      : null;

  const hasRequirements =
    !!info &&
    (info.requiredProjects.length > 0 ||
      (info.anyOfProjects?.projects.length ?? 0) > 0 ||
      info.minLevel != null ||
      info.requiredQuests.length > 0 ||
      info.exclusiveProjects.length > 0);

  return createPortal(
    <div
      className="pdm-overlay"
      onMouseDown={(e) => e.button === 0 && closeAndCommit()}
      role="presentation"
    >
      <motion.aside
        ref={panelRef}
        className="pdm"
        role="dialog"
        aria-modal="true"
        aria-label={`Détails du projet ${project.name}`}
        onMouseDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
      >
        <header className="pdm-header">
          <div>
            <h2>{project.name}</h2>
            <div className="pdm-badges">
              {isCompleted && <span className="pdm-badge validated">Validé</span>}
              {isSimulated && !isCompleted && <span className="pdm-badge simulated">Simulé</span>}
              {hasCoalitionBoost && <span className="pdm-badge boost">Boost coalition</span>}
            </div>
          </div>
          <button ref={closeButtonRef} className="pdm-close" onClick={closeAndCommit} aria-label="Fermer">
            ✕
          </button>
        </header>

        <div className="pdm-body">
          <div className="pdm-facts">
            <Fact label="XP">{xp > 0 ? xp.toLocaleString('fr-FR') : 'Non renseigné'}</Fact>
            {isSimulated && (
              <Fact label="XP simulé">{simulatedXP.toLocaleString('fr-FR')}</Fact>
            )}
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
            {info && info.uploads.length > 0 && (
              <Fact label="Auto-correction">{info.uploads.join(', ')}</Fact>
            )}
          </div>

          {/* ===== Simulation ===== */}
          <section className="pdm-section pdm-simulation">
            <h3>Simulation</h3>
            {isCompleted && <p className="pdm-note">Projet déjà validé : son XP est déjà acquis.</p>}
            {hasSubProjects && (
              <p className="pdm-note">Ce projet se simule module par module depuis la liste.</p>
            )}
            {readOnly && !isCompleted && (
              <p className="pdm-note">Profil consulté en lecture seule.</p>
            )}
            {simulable && (
              <>
                <label className="pdm-toggle">
                  <input
                    type="checkbox"
                    checked={isSimulated}
                    onChange={() => onToggleSimulation(project.id)}
                  />
                  Je compte faire ce projet
                </label>

                {isSimulated && (
                  <>
                    <div className="pdm-pct">
                      <div className="pdm-pct__head">
                        <span>Pourcentage de validation</span>
                        <input
                          type="number"
                          min={sliderMin}
                          max={maxPercentage}
                          value={percentageText}
                          onChange={(e) => setPercentageText(e.target.value)}
                          onBlur={commitPercentage}
                          onKeyDown={(e) => e.key === 'Enter' && commitPercentage()}
                        />
                      </div>
                      <input
                        type="range"
                        min={sliderMin}
                        max={maxPercentage}
                        step={5}
                        value={percentage}
                        onChange={(e) =>
                          onPercentageChange?.(project.id, parseInt(e.target.value, 10))
                        }
                      />
                      <div className="pdm-pct__scale">
                        <span>{sliderMin}%</span>
                        <span>{maxPercentage}%</span>
                      </div>
                    </div>

                    <label className="pdm-toggle">
                      <input
                        type="checkbox"
                        checked={hasCoalitionBoost}
                        onChange={() => onToggleCoalitionBoost?.(project.id)}
                      />
                      Boost de coalition (+4,2 %)
                    </label>
                  </>
                )}
              </>
            )}
          </section>

          {details?.loading && <p className="pdm-note">Récupération du détail du projet…</p>}
          {failed && <p className="pdm-note">Le détail du projet n'a pas pu être récupéré.</p>}
          {!teamInfo && !details && (
            <p className="pdm-note">
              Ce projet n'est pas rattaché au catalogue de ton campus : seules les informations
              du référentiel sont disponibles.
            </p>
          )}
          {details?.reason === 'UNKNOWN_CAMPUS' && (
            <p className="pdm-note">
              Campus inconnu : reconnecte-toi une fois pour que le détail des projets puisse être
              récupéré.
            </p>
          )}
          {details?.reason === 'NOT_OFFERED' && (
            <p className="pdm-note">Ce projet n'est pas proposé sur ton campus.</p>
          )}

          {info?.description && (
            <section className="pdm-section">
              <h3>Description</h3>
              <p className="pdm-description">{info.description}</p>
            </section>
          )}

          {info && info.objectives.length > 0 && (
            <section className="pdm-section">
              <h3>Objectifs</h3>
              <div className="pdm-chips">
                {info.objectives.map((objective) => (
                  <span key={objective} className="pdm-chip">
                    {objective}
                  </span>
                ))}
              </div>
            </section>
          )}

          {hasRequirements && info && (
            <section className="pdm-section">
              <h3>Prérequis</h3>
              <ul className="pdm-requirements">
                {info.minLevel != null && (
                  <li className={info.minLevelMet ? 'met' : 'unmet'}>
                    <span className="pdm-mark">{info.minLevelMet ? '✓' : '✗'}</span>
                    Niveau {info.minLevel} minimum (tu es niveau {Math.floor(info.level)})
                  </li>
                )}
                {info.requiredProjects.map((item) => (
                  <Requirement key={item.slug} item={item} />
                ))}
              </ul>

              {info.anyOfProjects && info.anyOfProjects.projects.length > 0 && (
                <>
                  <p className="pdm-subtitle">
                    {info.anyOfProjects.count} projet
                    {info.anyOfProjects.count > 1 ? 's' : ''} à valider parmi cette liste —{' '}
                    {info.anyOfProjects.done}/{info.anyOfProjects.count}
                  </p>
                  <ul className="pdm-requirements">
                    {info.anyOfProjects.projects.map((item) => (
                      <Requirement key={item.slug} item={item} />
                    ))}
                  </ul>
                </>
              )}

              {info.requiredQuests.length > 0 && (
                <p className="pdm-subtitle">
                  Rang du tronc commun exigé : {info.requiredQuests.join(', ')}
                </p>
              )}

              {info.exclusiveProjects.length > 0 && (
                <p className="pdm-subtitle">
                  Exclusif avec : {info.exclusiveProjects.map((p) => p.name).join(', ')}
                </p>
              )}
            </section>
          )}

          <a
            className="pdm-link"
            /* Le slug de nos données RNCP est amputé de son préfixe
               (« 42cursus-libft » devient « libft ») car il sert au
               rapprochement interne : il ne désigne aucune page de l'intra.
               Celui du catalogue 42 est intact. */
            href={`https://projects.intra.42.fr/projects/${teamInfo?.slug ?? project.slug ?? project.id}`}
            target="_blank"
            rel="noreferrer"
          >
            Ouvrir sur l'intra ↗
          </a>
        </div>
      </motion.aside>
    </div>,
    document.body
  );
};

export default ProjectDetailsModal;
