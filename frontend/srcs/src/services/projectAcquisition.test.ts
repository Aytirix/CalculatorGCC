import { describe, it, expect } from 'vitest';
import { isProjectAcquired } from './xp.service';
import type { SimulatorProject } from '@/types/rncp.types';

/**
 * `isProjectAcquired` — la question « ce projet est-il acquis ? ».
 *
 * Sa branche piscine était à ZÉRO test : trois mutations survivaient, dont la
 * suppression pure et simple de la garde. C'est précisément là que s'est logée
 * la régression qui empêchait les 7 piscines du référentiel de s'afficher
 * validées.
 *
 * Le pré-requis à retenir : `valides` doit contenir des identifiants de
 * granularité MODULE — les slugs bruts de l'API 42. Lui passer des slugs de
 * PROJET fait répondre `false` à toute piscine, en silence.
 */

const piscine = (modules: number): SimulatorProject =>
  ({
    id: '42-2355', name: 'Piscine Mobile', slug: 'mobile', xp: 20_000,
    subProjects: Array.from({ length: modules }, (_, i) => ({
      id: `42-235${6 + i}`, name: `Module ${i}`, slug: `mobile-${i}-machin`, xp: 10_000,
    })),
  }) as SimulatorProject;

const simple = (): SimulatorProject =>
  ({ id: '42-1463', name: 'zappy', slug: 'zappy', xp: 25_200 }) as SimulatorProject;

describe('isProjectAcquired', () => {
  it('reconnaît un projet simple par son slug, préfixe 42cursus compris', () => {
    expect(isProjectAcquired(simple(), ['42cursus-zappy'])).toBe(true);
    expect(isProjectAcquired(simple(), [])).toBe(false);
  });

  it('reconnaît un projet simple par son identifiant', () => {
    expect(isProjectAcquired(simple(), ['42-1463'])).toBe(true);
  });

  it("n'acquiert une piscine que si TOUS ses modules le sont", () => {
    const p = piscine(3);
    expect(isProjectAcquired(p, ['42cursus-mobile-0-machin'])).toBe(false);
    expect(isProjectAcquired(p, ['42cursus-mobile-0-machin', '42cursus-mobile-1-machin'])).toBe(false);
    expect(
      isProjectAcquired(p, [
        '42cursus-mobile-0-machin',
        '42cursus-mobile-1-machin',
        '42cursus-mobile-2-machin',
      ])
    ).toBe(true);
  });

  it("n'acquiert PAS une piscine sur son propre slug", () => {
    // Le slug d'une piscine est un préfixe de celui de ses modules, et le
    // rapprochement est permissif : sans la garde, « mobile » suffisait à la
    // donner pour acquise. C'est le cas qui a produit la régression.
    expect(isProjectAcquired(piscine(3), ['mobile'])).toBe(false);
    expect(isProjectAcquired(piscine(3), ['42-2355'])).toBe(false);
  });

  it("n'acquiert pas gratuitement une piscine dont tous les modules sont retirés", () => {
    // `every` sur une liste vide rend `true` : sans la garde `active.length > 0`,
    // une piscine dont l'école a retiré tous les modules serait acquise sans
    // qu'aucun travail existe.
    const p = piscine(2);
    const toutRetire = {
      ...p,
      subProjects: p.subProjects!.map((sub) => ({ ...sub, retired: true })),
    } as SimulatorProject;
    expect(isProjectAcquired(toutRetire, ['42cursus-mobile-0-machin', '42cursus-mobile-1-machin'])).toBe(false);
  });

  it("traite un projet sans sous-projets comme un projet simple", () => {
    const vide = { ...piscine(0), subProjects: [] } as SimulatorProject;
    expect(isProjectAcquired(vide, ['mobile'])).toBe(true);
  });
});
