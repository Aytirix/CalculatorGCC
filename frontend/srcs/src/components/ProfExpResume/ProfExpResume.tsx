import React from 'react';
import type { ProfessionalExperience } from '@/types/professionalExperience.types';
import { professionalExperienceMath } from '@/utils/professionalExperienceStorage';
import './ProfExpResume.scss';

/**
 * Le récapitulatif XP des expériences professionnelles : total, acquis, simulé.
 *
 * Il existait sur la page « Expérience professionnelle », supprimée parce
 * qu'aucun lien n'y menait — et avec elle avait disparu le SEUL endroit qui
 * montrait la part simulée. Or `isSimulation` vient enfin de devenir décisif :
 * une expérience simulée gonfle le niveau projeté sans compter dans les acquis
 * du RNCP. Ne plus afficher cette part revenait à cacher la moitié du calcul.
 *
 * Le décompte suit la règle métier — une alternance de deux ans vaut DEUX
 * expériences — et non la longueur du tableau, qui en annonçait une seule.
 */
const ProfExpResume: React.FC<{ experiences: ProfessionalExperience[] }> = ({ experiences }) => {
	if (experiences.length === 0) return null;

	const total = professionalExperienceMath.totalXP(experiences);
	const reel = professionalExperienceMath.realXP(experiences);
	const simule = professionalExperienceMath.simulatedXP(experiences);
	const nombre = professionalExperienceMath.count(experiences);
	const nombreSimule = professionalExperienceMath.simulatedCount(experiences);

	return (
		<div className="prof-exp-resume">
			<div className="prof-exp-resume__carte">
				<span className="prof-exp-resume__label">Total</span>
				<span className="prof-exp-resume__valeur">{total.toLocaleString('fr-FR')} XP</span>
				<span className="prof-exp-resume__detail">
					{nombre} expérience{nombre > 1 ? 's' : ''}
				</span>
			</div>
			<div className="prof-exp-resume__carte prof-exp-resume__carte--reel">
				<span className="prof-exp-resume__label">Acquis</span>
				<span className="prof-exp-resume__valeur">{reel.toLocaleString('fr-FR')} XP</span>
				<span className="prof-exp-resume__detail">
					{nombre - nombreSimule} expérience{nombre - nombreSimule > 1 ? 's' : ''}
				</span>
			</div>
			<div className="prof-exp-resume__carte prof-exp-resume__carte--simule">
				<span className="prof-exp-resume__label">🔮 Simulé</span>
				<span className="prof-exp-resume__valeur">{simule.toLocaleString('fr-FR')} XP</span>
				<span className="prof-exp-resume__detail">
					{nombreSimule} expérience{nombreSimule > 1 ? 's' : ''}
				</span>
			</div>
		</div>
	);
};

export default ProfExpResume;
