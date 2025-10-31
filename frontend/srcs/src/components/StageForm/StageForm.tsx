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
}

const StageForm: React.FC<StageFormProps> = ({ onSubmit, onCancel }) => {
  const [startDate, setStartDate] = useState('');
  const [months, setMonths] = useState(1);
  const [validationPercentage, setValidationPercentage] = useState(100);
  const [coalitionBoost, setCoalitionBoost] = useState(false);
  const [isSimulation, setIsSimulation] = useState(false);
  const [calculatedXP, setCalculatedXP] = useState(0);

  // Calculate XP whenever inputs change
  useEffect(() => {
    // Base XP: 10500 per month at 100%
    const baseXP = 10500 * months;
    // Apply validation percentage
    const xpWithValidation = (baseXP * validationPercentage) / 100;
    // Apply coalition boost (4.2% if enabled)
    const finalXP = xpWithValidation * (1 + (coalitionBoost ? 4.2 : 0) / 100);
    setCalculatedXP(Math.round(finalXP));
  }, [months, validationPercentage, coalitionBoost]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if ((!startDate && !isSimulation) || months < 1) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    onSubmit({
      type: 'stage',
      startDate: startDate || '',
      duration: months,
      validationPercentage,
      coalitionBoost: coalitionBoost ? 4.2 : 0,
      isSimulation,
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
        <Label htmlFor="startDate">
          Date de début du stage {!isSimulation && '*'}
        </Label>
        <Input
          id="startDate"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          required={!isSimulation}
        />
      </div>

      <div className="form-group">
        <Label htmlFor="months">Nombre de mois *</Label>
        <Input
          id="months"
          type="number"
          min="1"
          max="12"
          value={months}
          onChange={(e) => setMonths(parseInt(e.target.value) || 1)}
          required
        />
      </div>

      <div className="form-group">
        <Label htmlFor="validation">Pourcentage de validation (50% - 125%)</Label>
        <div className="percentage-input">
          <Input
            id="validation"
            type="number"
            min="50"
            max="125"
            value={validationPercentage}
            onChange={(e) => setValidationPercentage(parseInt(e.target.value) || 100)}
          />
          <span className="percentage-symbol">%</span>
        </div>
        <input
          type="range"
          min="50"
          max="125"
          value={validationPercentage}
          onChange={(e) => setValidationPercentage(parseInt(e.target.value))}
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

      <div className="form-group switch-group">
        <div className="switch-label-container">
          <Label htmlFor="simulation">Simulation</Label>
          <p className="switch-description">
            Cette expérience est-elle une simulation ?
          </p>
        </div>
        <Switch
          id="simulation"
          checked={isSimulation}
          onCheckedChange={setIsSimulation}
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
