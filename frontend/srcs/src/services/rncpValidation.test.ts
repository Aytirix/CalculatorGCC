import { describe, it, expect } from 'vitest';
import { xpService } from './xp.service';
import type { RNCP } from '@/types/rncp.types';

/**
 * Séparation entre ce qui est ACQUIS et ce qui est SIMULÉ.
 *
 * Toute la lisibilité du simulateur en dépend : une barre et un libellé
 * « validé » nourris par le total annoncent comme acquis ce qui n'est qu'une
 * intention. Et l'erreur ne se voit pas — elle affiche juste un vert rassurant.
 */

const rncp = (requiredCount: number, requiredXP: number): RNCP =>
  ({
    id: 'rncp-test',
    name: 'RNCP test',
    level: 0,
    requiredEvents: 0,
    requiredProfessionalExperience: 0,
    categories: [
      {
        id: 'cat',
        name: 'Catégorie',
        requiredCount,
        requiredXP,
        projects: [
          { id: 'projet-1', name: 'Projet 1', slug: 'projet-1', xp: 10_000 },
          { id: 'projet-2', name: 'Projet 2', slug: 'projet-2', xp: 10_000 },
        ],
      },
    ],
  }) as unknown as RNCP;

/** `validateRNCP(rncp, niveau, événements, expérience, validés, simulés)` */
const validate = (completed: string[], simulated: string[], requiredCount = 1, requiredXP = 10_000) =>
  xpService.validateRNCP(
    rncp(requiredCount, requiredXP),
    0,
    0,
    0,
    completed,
    simulated,
    undefined,
    undefined,
    undefined,
    undefined,
    { level: 0, professionalExp: 0 }
  ).categoriesValidation[0];

describe('acquis et simulé sont comptés séparément', () => {
  it("ne compte aucun XP réel quand tout n'est que simulé", () => {
    const cat = validate([], ['projet-1', 'projet-2']);
    // La projection voit les deux projets…
    expect(cat.currentCount).toBe(2);
    expect(cat.currentXP).toBe(20_000);
    // …mais rien n'est acquis.
    expect(cat.realCount).toBe(0);
    expect(cat.realXP).toBe(0);
  });

  it('compte comme réel ce qui est réellement validé', () => {
    const cat = validate(['projet-1'], ['projet-2']);
    expect(cat.realCount).toBe(1);
    expect(cat.realXP).toBe(10_000);
    expect(cat.currentCount).toBe(2);
    expect(cat.currentXP).toBe(20_000);
  });

  it("l'acquis n'excède jamais la projection", () => {
    for (const [done, sim] of [
      [[], []],
      [['projet-1'], []],
      [[], ['projet-1']],
      [['projet-1'], ['projet-2']],
      [['projet-1', 'projet-2'], ['projet-1', 'projet-2']],
    ] as [string[], string[]][]) {
      const cat = validate(done, sim);
      expect(cat.realXP).toBeLessThanOrEqual(cat.currentXP);
      expect(cat.realCount).toBeLessThanOrEqual(cat.currentCount);
    }
  });
});

describe('« validé » ne se dit que d’un acquis', () => {
  it("n'est pas réellement validé quand seule la simulation satisfait la catégorie", () => {
    const cat = validate([], ['projet-1']);
    // C'est précisément le cas qui faisait verdir la barre à tort.
    expect(cat.isValid).toBe(true);
    expect(cat.isRealValid).toBe(false);
  });

  it('est réellement validé dès que les projets validés suffisent', () => {
    const cat = validate(['projet-1'], []);
    expect(cat.isValid).toBe(true);
    expect(cat.isRealValid).toBe(true);
  });

  it("n'est validé d'aucune façon quand rien n'atteint le seuil", () => {
    const cat = validate([], [], 2, 20_000);
    expect(cat.isValid).toBe(false);
    expect(cat.isRealValid).toBe(false);
  });

  it('exige le nombre de projets ET l’XP, pour le réel comme pour la projection', () => {
    // Un seul projet validé : l'XP suffit, le compte non.
    const cat = validate(['projet-1'], ['projet-2'], 2, 10_000);
    expect(cat.realXP).toBeGreaterThanOrEqual(10_000);
    expect(cat.isRealValid).toBe(false); // 1 projet sur 2 exigés
    expect(cat.isValid).toBe(true); // la projection en a bien 2
  });
});

describe('validation globale du RNCP', () => {
  it("distingue le RNCP réellement obtenu de celui qui n'est que projeté", () => {
    const args = [undefined, undefined, undefined, undefined, { level: 0, professionalExp: 0 }] as const;

    const projected = xpService.validateRNCP(rncp(1, 10_000), 0, 0, 0, [], ['projet-1'], ...args);
    expect(projected.overallValid).toBe(true);
    expect(projected.overallRealValid).toBe(false);

    const real = xpService.validateRNCP(rncp(1, 10_000), 0, 0, 0, ['projet-1'], [], ...args);
    expect(real.overallValid).toBe(true);
    expect(real.overallRealValid).toBe(true);
  });

  it("un RNCP réellement obtenu l'est forcément aussi en projection", () => {
    const v = xpService.validateRNCP(
      rncp(1, 10_000), 0, 0, 0, ['projet-1'], ['projet-2'],
      undefined, undefined, undefined, undefined, { level: 0, professionalExp: 0 }
    );
    if (v.overallRealValid) expect(v.overallValid).toBe(true);
  });
});

describe('les sources de la projection ne contaminent pas l’acquis', () => {
  /** Un projet qui vaut 10 000 XP, réellement validé à 100 %. */
  const withInputs = (
    projectPercentages?: Record<string, number>,
    coalitionBoosts?: Record<string, boolean>
  ) =>
    xpService.validateRNCP(
      rncp(1, 10_000),
      0,
      0,
      0,
      ['projet-1'],
      [],
      projectPercentages,
      undefined,
      coalitionBoosts,
      undefined,
      { level: 0, professionalExp: 0 }
    ).categoriesValidation[0];

  it("ignore un pourcentage de simulation resté sur un projet validé", () => {
    // Ces pourcentages sont prioritaires dans le calcul : s'ils atteignaient la
    // passe réelle, un résidu de simulation amputerait l'XP réellement acquis.
    expect(withInputs({ 'projet-1': 25 }).realXP).toBe(10_000);
  });

  it('ignore un boost de coalition resté sur un projet validé', () => {
    expect(withInputs(undefined, { 'projet-1': true }).realXP).toBe(10_000);
  });
});

describe('les sous-projets réellement validés comptent dans l’acquis', () => {
  const piscine = {
    id: 'rncp-test',
    name: 'RNCP test',
    level: 0,
    requiredEvents: 0,
    requiredProfessionalExperience: 0,
    categories: [
      {
        id: 'cat',
        name: 'Catégorie',
        requiredCount: 1,
        requiredXP: 10_000,
        projects: [
          {
            id: 'piscine',
            name: 'Piscine',
            slug: 'piscine',
            // Une piscine porte la somme de ses modules (voir `rncp.service.ts`).
            xp: 12_000,
            subProjects: [
              { id: 'mod-1', name: 'Module 1', xp: 6_000 },
              { id: 'mod-2', name: 'Module 2', xp: 6_000 },
            ],
          },
        ],
      },
    ],
  } as unknown as RNCP;

  it("compte l'XP d'une piscine réellement terminée", () => {
    // Le cas qui affichait « 0 XP acquis » sur des modules réellement validés :
    // la passe réelle ne recevait aucun sous-projet.
    const cat = xpService.validateRNCP(
      piscine, 0, 0, 0, [], [], undefined, undefined, undefined,
      { piscine: ['mod-1', 'mod-2'] },
      { level: 0, professionalExp: 0, subProjects: { piscine: ['mod-1', 'mod-2'] } }
    ).categoriesValidation[0];
    expect(cat.realXP).toBe(12_000);
    expect(cat.isRealValid).toBe(true);
  });

  it("ne compte pas comme acquis une piscine seulement cochée", () => {
    const cat = xpService.validateRNCP(
      piscine, 0, 0, 0, [], [], undefined, undefined, undefined,
      { piscine: ['mod-1', 'mod-2'] },
      { level: 0, professionalExp: 0, subProjects: {} }
    ).categoriesValidation[0];
    expect(cat.currentXP).toBe(12_000);
    expect(cat.realXP).toBe(0);
  });
});

describe('le niveau et l’expérience « réels » ne viennent pas de la projection', () => {
  it("ne déclare pas un RNCP obtenu sur un niveau seulement projeté", () => {
    // Niveau projeté 21 (suffisant), niveau réel 15 (insuffisant).
    const v = xpService.validateRNCP(
      { ...rncp(1, 10_000), level: 21 } as RNCP,
      21, 0, 0, ['projet-1'], [], undefined, undefined, undefined, undefined,
      { level: 15, professionalExp: 0 }
    );
    expect(v.overallValid).toBe(true);
    expect(v.overallRealValid).toBe(false);
  });

  it("ne déclare pas un RNCP obtenu sur un stage seulement en cours", () => {
    const v = xpService.validateRNCP(
      { ...rncp(1, 10_000), requiredProfessionalExperience: 1 } as RNCP,
      0, 0, 1, ['projet-1'], [], undefined, undefined, undefined, undefined,
      { level: 0, professionalExp: 0 }
    );
    expect(v.overallValid).toBe(true);
    expect(v.overallRealValid).toBe(false);
  });
});

describe('une piscine ne vaut que si tous ses modules sont validés', () => {
  const piscineRncp = {
    id: 'rncp-test',
    name: 'RNCP test',
    level: 0,
    requiredEvents: 0,
    requiredProfessionalExperience: 0,
    categories: [
      {
        id: 'cat',
        name: 'Catégorie',
        requiredCount: 1,
        requiredXP: 1_000,
        projects: [
          {
            // Le slug de la piscine est un PRÉFIXE de celui de ses modules,
            // exactement comme « mobile » et « mobile-0-… » dans le référentiel.
            id: 'piscine-mobile',
            name: 'Piscine Mobile',
            slug: 'mobile',
            xp: 12_000,
            subProjects: [
              { id: 'mobile-0', name: 'Module 0', slug: 'mobile-0-basic', xp: 4_000 },
              { id: 'mobile-1', name: 'Module 1', slug: 'mobile-1-basic', xp: 4_000 },
              { id: 'mobile-2', name: 'Module 2', slug: 'mobile-2-basic', xp: 4_000 },
            ],
          },
        ],
      },
    ],
  } as unknown as RNCP;

  const run = (completed: string[], subs: Record<string, string[]>) =>
    xpService.validateRNCP(
      piscineRncp, 0, 0, 0, completed, [], undefined, undefined, undefined, subs,
      { level: 0, professionalExp: 0, subProjects: subs }
    ).categoriesValidation[0];

  it("ne compte que le module validé, pas la piscine entière", () => {
    // Le rapprochement permissif faisait matcher « mobile » avec
    // « mobile-0-basic » : la piscine passait pour acquise avec ses 12 000 XP.
    // Un module validé vaut bien son XP — mais lui seul.
    const cat = run(['mobile-0-basic'], { 'piscine-mobile': ['mobile-0'] });
    expect(cat.realXP).toBe(4_000);
    expect(cat.realCount).toBe(0); // la piscine n'est pas un projet acquis
    expect(cat.isRealValid).toBe(false);
  });

  it('compte la piscine quand tous ses modules sont validés', () => {
    const cat = run(
      ['mobile-0-basic', 'mobile-1-basic', 'mobile-2-basic'],
      { 'piscine-mobile': ['mobile-0', 'mobile-1', 'mobile-2'] }
    );
    expect(cat.realXP).toBe(12_000);
    expect(cat.isRealValid).toBe(true);
  });
});
