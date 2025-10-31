import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { ProfessionalExperience } from '@/pages/ProfessionalExperience/ProfessionalExperience';
import './AlternanceForm.scss';

interface AlternanceFormProps {
  onSubmit: (experience: Omit<ProfessionalExperience, 'id'>) => void;
  onCancel: () => void;
  initialValues?: ProfessionalExperience | null;
}

const AlternanceForm: React.FC<AlternanceFormProps> = ({ onSubmit, onCancel, initialValues }) => {
  const [startDate, setStartDate] = useState(initialValues?.startDate || '');
  const [duration, setDuration] = useState<1 | 2>((initialValues?.duration as 1 | 2) || 1);
  const [validationPercentage, setValidationPercentage] = useState(initialValues?.validationPercentage || 100);
  const [coalitionBoost, setCoalitionBoost] = useState(initialValues?.coalitionBoost ? true : false);
  const [isSimulation, setIsSimulation] = useState(initialValues?.isSimulation || false);
  const [calculatedXP, setCalculatedXP] = useState(0);

  // Calculate XP whenever inputs change
  useEffect(() => {
    // Base XP: 90000 per year
    const baseXP = 90000 * duration;
    
    // Pour les expériences réelles, l'XP de base+validation est déjà compté dans le level de l'API 42
    // On ne compte que le boost de coalition (4.2%)
    // Pour les simulations, on compte tout (base + validation + boost)
    let finalXP;
    if (isSimulation) {
      // Simulation: compter XP total (base + validation + boost)
      const xpWithValidation = (baseXP * validationPercentage) / 100;
      finalXP = xpWithValidation * (1 + (coalitionBoost ? 4.2 : 0) / 100);
    } else {
      // Réel: compter uniquement le boost coalition sur l'XP à 100%
      // (le pourcentage de validation n'affecte que l'affichage, pas le boost)
      finalXP = coalitionBoost ? (baseXP * 4.2 / 100) : 0;
    }
    
    setCalculatedXP(Math.round(finalXP));
  }, [duration, validationPercentage, coalitionBoost, isSimulation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!startDate && !isSimulation) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    onSubmit({
      type: 'alternance',
      startDate: startDate || '',
      duration,
      validationPercentage,
      coalitionBoost: coalitionBoost ? 4.2 : 0,
      isSimulation,
      xpEarned: calculatedXP,
    });
  };

  return (
    <form className="alternance-form" onSubmit={handleSubmit}>
      <div className="form-header">
        <h3>💼 Alternance</h3>
        <p className="form-description">90 000 XP par an</p>
      </div>

      <div className="form-group">
        <Label htmlFor="startDate">
          Début de l'alternance {!isSimulation && '*'}
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
        <Label>Durée de l'alternance *</Label>
        <div className="duration-selector">
          <button
            type="button"
            className={`duration-button ${duration === 1 ? 'active' : ''}`}
            onClick={() => setDuration(1)}
          >
            <span className="duration-value">1 an</span>
            <span className="duration-xp">90 000 XP</span>
          </button>
          <button
            type="button"
            className={`duration-button ${duration === 2 ? 'active' : ''}`}
            onClick={() => setDuration(2)}
          >
            <span className="duration-value">2 ans</span>
            <span className="duration-xp">180 000 XP</span>
          </button>
        </div>
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
          Ajouter l'alternance
        </Button>
      </div>
    </form>
  );
};

export default AlternanceForm;
