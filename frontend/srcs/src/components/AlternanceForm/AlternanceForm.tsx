import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { ProfessionalExperience } from '@/types/professionalExperience.types';
import './AlternanceForm.scss';

interface AlternanceFormProps {
	onSubmit: (experience: Omit<ProfessionalExperience, 'id'>) => void;
	onCancel: () => void;
	initialValues?: ProfessionalExperience | null;
}

const AlternanceForm: React.FC<AlternanceFormProps> = ({ onSubmit, onCancel, initialValues }) => {
	const [duration, setDuration] = useState<1 | 2>((initialValues?.duration as 1 | 2) || 1);
	const [validationPercentage, setValidationPercentage] = useState(
		String(Math.min(125, initialValues?.validationPercentage ?? 100))
	);
	const [coalitionBoost, setCoalitionBoost] = useState(initialValues?.coalitionBoost ? true : false);
	// Défaut : SIMULATION. Le drapeau était codé en dur et aucune interface ne
	// proposait le choix ; une expérience réellement faite mais absente de l'API 42
	// n'avait alors aucun moyen d'être déclarée acquise.
	const [dejaAcquise, setDejaAcquise] = useState(
		initialValues?.simulationExplicite === true ? !initialValues.isSimulation : false
	);
	const [calculatedXP, setCalculatedXP] = useState(0);

	const validationNum = Math.min(125, Math.max(0, parseInt(validationPercentage) || 0));

	useEffect(() => {
		const baseXP = 90000 * duration * (validationNum / 100);
		const finalXP = baseXP + (coalitionBoost ? (baseXP * 4.2 / 100) : 0);
		setCalculatedXP(Math.round(finalXP));
	}, [duration, validationNum, coalitionBoost]);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		onSubmit({
			type: 'alternance',
			startDate: '',
			duration,
			validationPercentage: validationNum,
			coalitionBoost: coalitionBoost ? 4.2 : 0,
			// Saisie à la main = SIMULATION. Ce drapeau était codé en dur à `false` dans
			// les deux formulaires et rien ne le mettait jamais à `true` : `realCount()`
			// comptait donc ces expériences comme RÉELLEMENT acquises, et elles faisaient
			// passer au vert le prérequis d'expérience professionnelle du RNCP — que le code
			// décrit pourtant comme « ce qui est réellement acquis, et ce qui doit décider
			// d'un validé ».
			//
			// Le marqueur visuel correspondant vit dans `ProfExpList` (« 🔮 Simulé »). Une
			// version antérieure de ce commentaire invoquait un badge et une carte
			// « XP Simulé » qui n'existent plus : ils appartenaient à un écran supprimé.
			isSimulation: !dejaAcquise,
			simulationExplicite: true,
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
				<Label htmlFor="validation">Pourcentage de validation (0% - 125%)</Label>
				<div className="percentage-input">
					<Input
						id="validation"
						type="number"
						min="0"
						max="125"
						value={validationPercentage}
						// On borne à la SORTIE du champ, pas à chaque frappe. Borner en
						// cours de saisie rendait la valeur inatteignable : depuis 100,
						// taper un chiffre donnait « 1002 », ramené à 125 — et une fois
						// à 125 on ne pouvait plus en sortir qu'en vidant le champ.
						onChange={(e) => setValidationPercentage(e.target.value.replace(/[^0-9]/g, ''))}
						onBlur={() => setValidationPercentage(String(validationNum))}
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

			<div className="form-group switch-group">
				<div className="switch-label-container">
					<Label htmlFor="acquise">Expérience déjà acquise</Label>
					<p className="switch-description">
						Activez si vous l'avez réellement faite&nbsp;: elle comptera alors comme un
						acquis pour le RNCP. Sinon, elle reste une projection.
					</p>
				</div>
				<Switch id="acquise" checked={dejaAcquise} onCheckedChange={setDejaAcquise} />
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
