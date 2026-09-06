import { describe, it, expect } from 'vitest';
import { professionalExperienceMath } from './professionalExperienceStorage';
import type { ProfessionalExperience } from '@/pages/ProfessionalExperience/ProfessionalExperience';

/**
 * XP des expériences professionnelles.
 *
 * Ces sommes alimentent le niveau projeté affiché en haut du Dashboard. Une
 * erreur ici ne provoque aucune exception : elle affiche un mauvais niveau, ce
 * que personne ne peut détecter à l'œil — d'où ces tests.
 */

const exp = (over: Partial<ProfessionalExperience>): ProfessionalExperience =>
  ({
    id: Math.random().toString(36),
    type: 'stage',
    startDate: '2026-01-01',
    duration: 6,
    xpEarned: 0,
    isSimulation: false,
    ...over,
  }) as ProfessionalExperience;

describe('professionalExperienceMath', () => {
  it('rend zéro sur une liste vide plutôt que NaN', () => {
    expect(professionalExperienceMath.totalXP([])).toBe(0);
    expect(professionalExperienceMath.realXP([])).toBe(0);
    expect(professionalExperienceMath.simulatedXP([])).toBe(0);
    expect(professionalExperienceMath.realMonths([])).toBe(0);
    expect(professionalExperienceMath.realCount([])).toBe(0);
  });

  it('sépare bien XP réel et XP simulé', () => {
    const list = [
      exp({ xpEarned: 10_000, isSimulation: false }),
      exp({ xpEarned: 4_000, isSimulation: true }),
    ];
    expect(professionalExperienceMath.realXP(list)).toBe(10_000);
    expect(professionalExperienceMath.simulatedXP(list)).toBe(4_000);
    // Le total additionne les deux : c'est ce qui nourrit le niveau projeté.
    expect(professionalExperienceMath.totalXP(list)).toBe(14_000);
  });

  it('compte une alternance en années et un stage en mois', () => {
    const list = [
      exp({ type: 'stage', duration: 6 }),
      exp({ type: 'alternance', duration: 2 }),
    ];
    expect(professionalExperienceMath.realMonths(list)).toBe(6 + 24);
  });

  it("compte une alternance pour son nombre d'années", () => {
    // Règle du référentiel RNCP, et celle appliquée aux expériences venues de
    // l'API 42 : N années d'alternance valent N expériences professionnelles.
    expect(professionalExperienceMath.realCount([exp({ type: 'alternance', duration: 1 })])).toBe(1);
    expect(professionalExperienceMath.realCount([exp({ type: 'alternance', duration: 2 })])).toBe(2);
    // Le formulaire ne propose que 1 ou 2 ans aujourd'hui, mais la règle est
    // générale : la tester au-delà empêche de la réécrire en « 2 ou 1 », qui
    // coïnciderait sur le domaine actuel et divergerait au premier élargissement.
    expect(professionalExperienceMath.realCount([exp({ type: 'alternance', duration: 3 })])).toBe(3);
  });

  it("compte un stage pour une expérience, quelle que soit sa durée", () => {
    expect(professionalExperienceMath.realCount([exp({ type: 'stage', duration: 6 })])).toBe(1);
    expect(professionalExperienceMath.realCount([exp({ type: 'stage', duration: 4 })])).toBe(1);
  });

  it('exclut les simulations des mois et du compte réels', () => {
    const list = [
      exp({ type: 'stage', duration: 6, isSimulation: true }),
      exp({ type: 'stage', duration: 4, isSimulation: false }),
    ];
    expect(professionalExperienceMath.realMonths(list)).toBe(4);
    expect(professionalExperienceMath.realCount(list)).toBe(1);
  });
});
