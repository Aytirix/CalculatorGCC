import { describe, it, expect } from 'vitest';
import { resoudreExperiences } from './experienceLoad';
import type { ProfessionalExperience } from '@/types/professionalExperience.types';

/**
 * La décision du chargement, celle qui a produit « j'enregistre, j'actualise, je
 * perds l'information » et chacune de ses rechutes. Chaque test ci-dessous
 * correspond à une régression réellement vécue.
 */

const exp = (id: string): ProfessionalExperience => ({
	id, type: 'stage', startDate: '', duration: 6, validationPercentage: 115,
	coalitionBoost: 0, isSimulation: true, simulationExplicite: true, xpEarned: 10_000,
});

const distante = [exp('base')];
const locale = [exp('navigateur')];

describe('resoudreExperiences', () => {
	it('la BASE fait autorité dans le cas courant', () => {
		const v = resoudreExperiences({ viewingOther: false, distantes: distante, locales: locale, dejaSynchronise: true });
		expect(v.afficher).toEqual(distante);
		expect(v.ecrireLocal).toBe(true);
		expect(v.monter).toBeNull();
	});

	it('applique une liste VIDE venue du serveur', () => {
		// La règle d'avant ne l'appliquait jamais : une suppression faite sur un
		// appareil ressuscitait au chargement d'un autre resté ouvert, puis repartait
		// en base — le geste était annulé définitivement.
		const v = resoudreExperiences({ viewingOther: false, distantes: [], locales: locale, dejaSynchronise: true });
		expect(v.afficher).toEqual([]);
		expect(v.ecrireLocal).toBe(true);
		expect(v.marquerSynchronise).toBe(true);
	});

	it('fait MONTER le local à la première synchronisation', () => {
		// Avant la persistance, ces expériences ne vivaient qu'ici : les effacer
		// parce que la base est vide, c'est les perdre.
		const v = resoudreExperiences({ viewingOther: false, distantes: [], locales: locale, dejaSynchronise: false });
		expect(v.afficher).toEqual(locale);
		expect(v.monter).toEqual(locale);
	});

	it('n’annonce PAS la synchronisation avant que la montée ait réussi', () => {
		// Le drapeau posé d'office après une promesse non attendue transformait une
		// panne réseau en perte définitive : au chargement suivant, la base encore
		// vide faisait autorité et vidait le stockage local.
		const v = resoudreExperiences({ viewingOther: false, distantes: [], locales: locale, dejaSynchronise: false });
		expect(v.marquerSynchronise).toBe(false);
		expect(v.ecrireLocal).toBe(false);
	});

	it('ne monte rien une fois la première synchronisation faite', () => {
		const v = resoudreExperiences({ viewingOther: false, distantes: [], locales: locale, dejaSynchronise: false });
		expect(v.monter).not.toBeNull();
		const apres = resoudreExperiences({ viewingOther: false, distantes: [], locales: locale, dejaSynchronise: true });
		expect(apres.monter).toBeNull();
		expect(apres.afficher).toEqual([]);
	});

	it('ne monte rien quand la base a déjà quelque chose', () => {
		const v = resoudreExperiences({ viewingOther: false, distantes: distante, locales: locale, dejaSynchronise: false });
		expect(v.monter).toBeNull();
		expect(v.afficher).toEqual(distante);
	});

	it('n’écrit RIEN en consultant le profil d’un autre', () => {
		// Le localStorage est global au navigateur : y écrire les expériences d'un
		// ami écrase les miennes, et les afficher chez lui fausse SON niveau projeté.
		const v = resoudreExperiences({ viewingOther: true, distantes: distante, locales: [], dejaSynchronise: false });
		expect(v.afficher).toEqual(distante);
		expect(v.ecrireLocal).toBe(false);
		expect(v.marquerSynchronise).toBe(false);
		expect(v.monter).toBeNull();
	});

	it('affiche une liste vide pour un profil qui n’a aucune expérience', () => {
		const v = resoudreExperiences({ viewingOther: true, distantes: [], locales: locale, dejaSynchronise: false });
		expect(v.afficher).toEqual([]);
		expect(v.monter).toBeNull();
	});
});
