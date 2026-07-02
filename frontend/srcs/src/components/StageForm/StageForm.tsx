import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { ProfessionalExperience } from '@/pages/ProfessionalExperience/ProfessionalExperience';
import {
  type StageSubNotes,
  type StageNoteKey,
  STAGE_NOTE_INFO,
  STAGE_NOTE_MAX,
  STAGE_NOTE_MIN,
  STAGE_NOTE_ORDER,
  STAGE_MODEL_INFO,
  STAGE_DURATION_GUIDE,
  STAGE_XP_IMPORTANCE,
  STAGE_NOTE_IMPORTANCE,
  predictStageXP,
  predictStageNote,
  applyCoalitionBoost,
} from '@/utils/stageModel';
import './StageForm.scss';

interface StageFormProps {
  onSubmit: (experience: Omit<ProfessionalExperience, 'id'>) => void;
  onCancel: () => void;
  initialValues?: ProfessionalExperience | null;
  /** Vraies notes déjà connues (API) : ces champs sont pré-remplis et verrouillés. */
  knownNotes?: Partial<StageSubNotes>;
}

const DEFAULT_NOTES: StageSubNotes = { duration: 100, mid: 100, final: 100, peer: 100 };

const StageForm: React.FC<StageFormProps> = ({ onSubmit, onCancel, initialValues, knownNotes }) => {
  // Notes de départ : défauts <- valeurs éditées <- notes réelles connues (prioritaires)
  const initialNotes: StageSubNotes = {
    ...DEFAULT_NOTES,
    ...(initialValues?.subNotes ?? {}),
    ...(knownNotes ?? {}),
  };

  const [notes, setNotes] = useState<StageSubNotes>(initialNotes);
  const [coalitionBoost, setCoalitionBoost] = useState(initialValues?.coalitionBoost ? true : false);
  const [showInfo, setShowInfo] = useState(false);

  const isLocked = (key: StageNoteKey) => knownNotes?.[key] != null;

  const setNote = (key: StageNoteKey, value: number) => {
    if (isLocked(key)) return; // note réelle : non éditable
    const clamped = Math.max(STAGE_NOTE_MIN[key], Math.min(STAGE_NOTE_MAX[key], value || 0));
    setNotes((prev) => ({ ...prev, [key]: clamped }));
  };

  const baseXP = useMemo(() => predictStageXP(notes), [notes]);
  const finalXP = useMemo(() => applyCoalitionBoost(baseXP, coalitionBoost), [baseXP, coalitionBoost]);
  const predictedNote = useMemo(() => predictStageNote(notes), [notes]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      type: 'stage',
      startDate: '',
      duration: initialValues?.duration ?? 0, // les mois ne servent plus au stage (cf. carte)
      validationPercentage: predictedNote,
      coalitionBoost: coalitionBoost ? 4.2 : 0,
      isSimulation: false,
      xpEarned: finalXP,
      subNotes: notes,
      predictedNote,
    });
  };

  const hasKnown = knownNotes && Object.values(knownNotes).some((v) => v != null);

  return (
    <form className="stage-form" onSubmit={handleSubmit}>
      <div className="form-header">
        <button
          type="button"
          className="info-gear"
          onClick={() => setShowInfo(true)}
          title="Comment marche la simulation ?"
          aria-label="Informations sur la simulation"
        >
          ?
        </button>
        <h3>🎓 Stage — Work Experience I</h3>
        <p className="form-description">
          Estime les notes des sous-projets pour prédire l'XP et la note finale.
          {hasKnown && ' Les notes déjà connues sont verrouillées 🔒.'}
        </p>
      </div>

      {showInfo && (
        <div className="info-modal-overlay" onClick={() => setShowInfo(false)}>
          <div className="info-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="info-modal-close" onClick={() => setShowInfo(false)} aria-label="Fermer">✕</button>
            <h4>ℹ️ Comment marche la simulation</h4>
            <p>
              On estime les 4 notes des sous-projets du stage. Une <b>régression linéaire</b> — entraînée
              sur les vrais stages validés ({STAGE_MODEL_INFO.trainingWindow}) — prédit l'<b>XP réel</b> et
              la <b>note finale</b>. Les notes déjà connues (via l'API) sont verrouillées 🔒.
            </p>

            <h5>Les 4 notes</h5>
            <ul className="info-notes">
              {STAGE_NOTE_ORDER.map((key) => (
                <li key={key}><b>{STAGE_NOTE_INFO[key].label}</b> — {STAGE_NOTE_INFO[key].help}</li>
              ))}
              <li className="muted">Contract Upload (5ᵉ sous-projet) est toujours à 100 → ignoré.</li>
            </ul>

            <h5>À propos de la Duration</h5>
            <p>{STAGE_MODEL_INFO.durationNote}</p>

            <h5>Formules (poids de la régression)</h5>
            <code className="info-formula">{STAGE_MODEL_INFO.xpFormula}</code>
            <code className="info-formula">{STAGE_MODEL_INFO.noteFormula} <span className="muted">(plafond 125)</span></code>
            <p className="muted">
              Le <b>%</b> affiché sous chaque note = sa part dans ce qui fait <b>varier</b> le résultat
              (les 4 somment à 100 %). Duration pèse le plus sur l'XP, Final sur la note.
            </p>
            <p className="muted">{STAGE_MODEL_INFO.interceptNote}</p>
            <p className="info-accuracy">
              XP : {STAGE_MODEL_INFO.xpAccuracy}<br />
              Note : {STAGE_MODEL_INFO.noteAccuracy}
            </p>

            <p className="muted info-drift">
              La <b>Durée</b> est le principal moteur de l'XP ; le <b>Final</b> celui de la note. Contract & Peer
              pèsent peu. Si le barème 42 change un jour, les poids sont ré-entraînables.
            </p>
          </div>
        </div>
      )}

      {STAGE_NOTE_ORDER.map((key) => {
        const info = STAGE_NOTE_INFO[key];
        const max = STAGE_NOTE_MAX[key];
        const min = STAGE_NOTE_MIN[key];
        const locked = isLocked(key);
        return (
          <div className={`form-group note-group ${locked ? 'note-official' : 'note-simulated'}`} key={key}>
            <Label htmlFor={`note-${key}`}>
              {info.label}
              <span className="note-scale"> / {max}</span>
              <span className={`note-tag ${locked ? 'official' : 'sim'}`}>{locked ? '🔒 officiel' : 'simulé'}</span>
            </Label>
            <p className="note-help">{info.help} <span className="note-min">Min : {min}.</span></p>
            <div className="note-weight" title="Part de ce paramètre dans ce qui fait varier l'XP / la note (les 4 somment à 100 %)">
              ⚖️ Poids : <b>{STAGE_XP_IMPORTANCE[key]}%</b> de l'XP
              <span className="note-weight__sep">·</span>
              {STAGE_NOTE_IMPORTANCE[key]}% de la note
            </div>
            {key === 'duration' && (
              <div className="duration-guide">
                <div className="duration-guide__title">📊 Moyennes réelles (dataset)</div>
                {[
                  { lbl: '4 mois', d: STAGE_DURATION_GUIDE.fourMonths },
                  { lbl: '6 mois', d: STAGE_DURATION_GUIDE.sixMonths },
                ].map(({ lbl, d }) => (
                  <div className="duration-guide__row" key={lbl}>
                    <span className="dg-label">{lbl}</span>
                    <span className="dg-avg">~{d.avg}%</span>
                    <span className="dg-range">{d.min}–{d.max}%</span>
                  </div>
                ))}
              </div>
            )}
            <div className="percentage-input">
              <Input
                id={`note-${key}`}
                type="number"
                min={min}
                max={max}
                value={notes[key]}
                disabled={locked}
                onChange={(e) => setNote(key, parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0)}
              />
              <span className="percentage-symbol">{key === 'peer' ? 'pts' : '%'}</span>
            </div>
            <input
              type="range"
              min={min}
              max={max}
              value={notes[key]}
              disabled={locked}
              onChange={(e) => setNote(key, parseInt(e.target.value))}
              className="percentage-slider"
            />
          </div>
        );
      })}

      <div className="form-group switch-group">
        <div className="switch-label-container">
          <Label htmlFor="coalition">Boost de coalition</Label>
          <p className="switch-description">Ajoute +4.2% d'XP (déjà inclus en moyenne dans la prédiction)</p>
        </div>
        <Switch id="coalition" checked={coalitionBoost} onCheckedChange={setCoalitionBoost} />
      </div>

      <div className="xp-preview">
        <div className="xp-preview-row">
          <span className="xp-label">XP prédit :</span>
          <span className="xp-value">{finalXP.toLocaleString()} XP</span>
        </div>
        <div className="xp-preview-row">
          <span className="xp-label">Note finale prédite :</span>
          <span className="xp-value note">{predictedNote.toFixed(1)}</span>
        </div>
      </div>

      <div className="form-actions">
        <Button type="button" variant="outline" onClick={onCancel}>Annuler</Button>
        <Button type="submit">{initialValues ? 'Enregistrer' : 'Ajouter le stage'}</Button>
      </div>
    </form>
  );
};

export default StageForm;
