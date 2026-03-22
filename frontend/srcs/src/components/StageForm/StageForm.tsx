import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { ProfessionalExperience } from '@/pages/ProfessionalExperience/ProfessionalExperience';
import './StageForm.scss';

interface StageFormProps {
  onSubmit: (experience: Omit<ProfessionalExperience, 'id'>) => void;
  onCancel: () => void;
  initialValues?: ProfessionalExperience | null;
}

const StageForm: React.FC<StageFormProps> = ({ onSubmit, onCancel, initialValues }) => {
  const [months, setMonths] = useState(String(initialValues?.duration || 1));
  const [validationPercentage, setValidationPercentage] = useState(String(initialValues?.validationPercentage ?? 100));
  const [coalitionBoost, setCoalitionBoost] = useState(initialValues?.coalitionBoost ? true : false);
  const [calculatedXP, setCalculatedXP] = useState(0);

  const monthsNum = parseInt(months) || 0;
  const validationNum = Math.min(125, Math.max(0, parseInt(validationPercentage) || 0));

  useEffect(() => {
    const baseXP = 10500 * monthsNum * (validationNum / 100);
    const finalXP = baseXP + (coalitionBoost ? (baseXP * 4.2 / 100) : 0);
    setCalculatedXP(Math.round(finalXP));
  }, [monthsNum, validationNum, coalitionBoost]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (monthsNum < 1) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    onSubmit({
      type: 'stage',
      startDate: '',
      duration: monthsNum,
      validationPercentage: validationNum,
      coalitionBoost: coalitionBoost ? 4.2 : 0,
      isSimulation: false,
      xpEarned: calculatedXP,
    });
  };

  return (
    <form className="stage-form" onSubmit={handleSubmit}>
      <div className="form-header">
        <h3>🎓 Stage</h3>
        <p className="form-description">10 500 XP par mois à 100%</p>
      </div>

      <div className="form-group">
        <Label htmlFor="months">Nombre de mois *</Label>
        <Input
          id="months"
          type="number"
          min="1"
          max="12"
          value={months}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, '');
            setMonths(raw === '' ? '' : String(Math.min(12, parseInt(raw))));
          }}
          required
        />
      </div>

      <div className="form-group">
        <Label htmlFor="validation">Pourcentage de validation (0% - 125%)</Label>
        <div className="percentage-input">
          <Input
            id="validation"
            type="number"
            min="0"
            max="125"
            value={validationPercentage}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^0-9]/g, '');
              setValidationPercentage(raw === '' ? '' : String(Math.min(125, parseInt(raw))));
            }}
          />
          <span className="percentage-symbol">%</span>
        </div>
        <input
          type="range"
          min="0"
          max="125"
          value={validationNum}
          onChange={(e) => setValidationPercentage(e.target.value)}
          className="percentage-slider"
        />
      </div>

      <div className="form-group switch-group">
        <div className="switch-label-container">
          <Label htmlFor="coalition">Boost de coalition</Label>
          <p className="switch-description">
            Ajoute +4.2% d'XP
          </p>
        </div>
        <Switch
          id="coalition"
          checked={coalitionBoost}
          onCheckedChange={setCoalitionBoost}
        />
      </div>

      <div className="xp-preview">
        <span className="xp-label">XP calculé :</span>
        <span className="xp-value">{calculatedXP.toLocaleString()} XP</span>
      </div>

      <div className="form-actions">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit">
          Ajouter le stage
        </Button>
      </div>
    </form>
  );
};

export default StageForm;
