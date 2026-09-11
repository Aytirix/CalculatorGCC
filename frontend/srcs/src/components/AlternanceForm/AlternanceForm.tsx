import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { ProfessionalExperience } from '@/types/professionalExperience.types';
import {
	POURCENTAGE_MAX,
	POURCENTAGE_MIN,
	bornerPourcentage,
	dejaAcquiseInitiale,
	pourcentageEffectif,
	xpAlternance,
} from '@/utils/experienceForm';
import './AlternanceForm.scss';

interface AlternanceFormProps {
	onSubmit: (experience: Omit<ProfessionalExperience, 'id'>) => void;
	onCancel: () => void;
	initialValues?: ProfessionalExperience | null;
}

const AlternanceForm: React.FC<AlternanceFormProps> = ({ onSubmit, onCancel, initialValues }) => {
	const [duration, setDuration] = useState<1 | 2>((initialValues?.duration as 1 | 2) || 1);
	const [validationPercentage, setValidationPercentage] = useState(
		String(bornerPourcentage(initialValues?.validationPercentage ?? 100))
	);
	const [coalitionBoost, setCoalitionBoost] = useState(initialValues?.coalitionBoost ? true : false);
	// Défaut : SIMULATION. Le drapeau était codé en dur et aucune interface ne
	// proposait le choix ; une expérience réellement faite mais absente de l'API 42
	// n'avait alors aucun moyen d'être déclarée acquise.
	const [dejaAcquise, setDejaAcquise] = useState(dejaAcquiseInitiale(initialValues));
	const [calculatedXP, setCalculatedXP] = useState(0);

	// Un champ VIDÉ garde la valeur précédente au lieu de tomber à 0 : « tout
	// sélectionner, effacer, regarder ailleurs » faisait sinon chuter le
	// pourcentage à 0 % et l'XP à 0. Le formulaire de stage restaure déjà la valeur
	// courante dans ce cas ; les deux se comportent enfin pareil.
	const dernierePourcentage = useRef(bornerPourcentage(initialValues?.validationPercentage ?? 100));
	const validationNum = pourcentageEffectif(validationPercentage, dernierePourcentage.current);
	dernierePourcentage.current = validationNum;

	useEffect(() => {
		setCalculatedXP(xpAlternance(duration, validationNum, coalitionBoost));
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
				<Label htmlFor="validation">Pourcentage de validation ({POURCENTAGE_MIN}% - {POURCENTAGE_MAX}%)</Label>
				<div className="percentage-input">
					<Input
						id="validation"
						/* Champ TEXTE avec clavier numérique, et non `type="number"` — c'est déjà le
						   choix fait ailleurs dans le dépôt (`ProfExpList`). Le champ numérique natif
						   apportait trois défauts : la molette modifie la valeur quand le champ a le
						   focus, les flèches et les boutons contournent le tampon de saisie (ni le
						   slider ni l'aperçu ne suivaient), et `badInput` vide `e.target.value` côté DOM
						   en laissant « 12e » VISIBLE — l'application croyait alors le champ vide. */
						type="text"
						inputMode="numeric"
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
					min={POURCENTAGE_MIN}
					max={POURCENTAGE_MAX}
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
					{/* En édition, « Ajouter » était mensonger — le formulaire de stage
					    disait déjà « Enregistrer » dans le même cas. */}
					{initialValues ? 'Enregistrer' : "Ajouter l'alternance"}
				</Button>
			</div>
		</form>
	);
};

export default AlternanceForm;
