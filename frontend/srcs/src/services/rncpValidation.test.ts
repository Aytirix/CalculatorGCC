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
            // `id` ET `slug` DIFFÉRENTS, délibérément.
            //
            // Ce fixture les avait égaux, et c'est la seule forme où l'on ne voit
            // pas que `simulatedSubProjects` est indexé par IDENTIFIANT : une
            // mutation qui l'indexait par slug passait les 81 tests. C'est
            // exactement la classe de bug qui a produit quatre Bloquants d'affilée.
            id: '42-2189',
            name: 'Piscine',
            slug: 'piscine',
            // Une piscine porte la somme de ses modules (voir `rncp.service.ts`).
            xp: 12_000,
            subProjects: [
              { id: '42-2190', name: 'Module 1', slug: 'mod-1', xp: 6_000 },
              { id: '42-2191', name: 'Module 2', slug: 'mod-2', xp: 6_000 },
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
      { '42-2189': ['42-2190', '42-2191'] },
      { level: 0, professionalExp: 0, subProjects: { '42-2189': ['42-2190', '42-2191'] } }
    ).categoriesValidation[0];
    expect(cat.realXP).toBe(12_000);
    expect(cat.isRealValid).toBe(true);
  });

  it("ne compte pas comme acquis une piscine seulement cochée", () => {
    const cat = xpService.validateRNCP(
      piscine, 0, 0, 0, [], [], undefined, undefined, undefined,
      { '42-2189': ['42-2190', '42-2191'] },
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

/**
 * Projet marqué `retired` : l'école ne le compte plus dans cette catégorie.
 *
 * C'est ce qui remplace la SUPPRESSION d'une ligne du référentiel — supprimer
 * l'identifiant le ferait disparaître des simulations existantes. Le drapeau
 * doit donc réellement neutraliser le projet dans les totaux, sinon on n'a rien
 * gagné : on l'affiche autrement mais il continue de valider le RNCP.
 */
describe('projets hors référentiel', () => {
  const withRetired = (retiredId: string): RNCP =>
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
          requiredCount: 2,
          requiredXP: 20_000,
          projects: [
            { id: 'projet-1', name: 'Projet 1', slug: 'projet-1', xp: 10_000 },
            {
              id: 'projet-2',
              name: 'Projet 2',
              slug: 'projet-2',
              xp: 10_000,
              ...(retiredId === 'projet-2' ? { retired: true } : {}),
            },
          ],
        },
      ],
    }) as unknown as RNCP;

  const run = (rncpData: RNCP, completed: string[], simulated: string[]) =>
    xpService.validateRNCP(
      rncpData,
      0, 0, 0,
      completed,
      simulated,
      // pourcentages, pourcentages des acquis, boosts de coalition, sous-projets
      undefined, undefined, undefined, undefined,
      { level: 0, professionalExp: 0 }
    ).categoriesValidation[0];

  it('exclut du comptage un projet retiré, même réellement validé', () => {
    // Témoin : sans le drapeau, les deux projets valident la catégorie.
    const sans = run(withRetired('aucun'), ['projet-1', 'projet-2'], []);
    expect(sans.realCount).toBe(2);
    expect(sans.realXP).toBe(20_000);
    expect(sans.isRealValid).toBe(true);

    // Avec le drapeau, le second ne compte plus — et la catégorie n'est plus
    // validée, ce qui est bien le comportement voulu : le jury ne le compte pas.
    const avec = run(withRetired('projet-2'), ['projet-1', 'projet-2'], []);
    expect(avec.realCount).toBe(1);
    expect(avec.realXP).toBe(10_000);
    expect(avec.isRealValid).toBe(false);
  });

  it('exclut aussi un projet retiré qui est simulé', () => {
    const cat = run(withRetired('projet-2'), [], ['projet-1', 'projet-2']);
    expect(cat.currentCount).toBe(1);
    expect(cat.currentXP).toBe(10_000);
  });
});

/**
 * `retired` sur un MODULE de piscine.
 *
 * C'est le cas d'usage le plus probable du drapeau — l'école retire un module
 * d'une piscine — et c'était le trou : la règle « piscine validée si TOUS les
 * modules le sont » gardait le module retiré dans le `every`, rendant la piscine
 * définitivement invalidable. Un drapeau censé débloquer qui verrouille.
 */
describe('sous-projets hors référentiel', () => {
  const pool = (retiredIds: string[]): RNCP =>
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
          requiredCount: 1,
          requiredXP: 10_000,
          projects: [
            {
              id: 'piscine',
              name: 'Piscine',
              slug: 'piscine',
              xp: 20_000,
              subProjects: [
                { id: 'm0', name: 'Module 0', slug: 'm0', xp: 10_000,
                  ...(retiredIds.includes('m0') ? { retired: true } : {}) },
                { id: 'm1', name: 'Module 1', slug: 'm1', xp: 10_000,
                  ...(retiredIds.includes('m1') ? { retired: true } : {}) },
              ],
            },
          ],
        },
      ],
    }) as unknown as RNCP;

  const run = (
    rncpData: RNCP,
    completed: string[],
    subs: Record<string, string[]>
  ) =>
    xpService.validateRNCP(
      rncpData,
      0, 0, 0,
      completed,
      [],
      undefined, undefined, undefined,
      subs,
      { level: 0, professionalExp: 0, subProjects: subs }
    ).categoriesValidation[0];

  it('valide la piscine quand seul un module retiré manque', () => {
    // Témoin : sans drapeau, m1 manquant empêche la piscine de compter.
    const sans = run(pool([]), ['m0'], {});
    expect(sans.realCount).toBe(0);

    // Avec m1 retiré, m0 seul suffit — l'utilisateur n'a aucun moyen de valider
    // un module que l'école ne propose plus.
    const avec = run(pool(['m1']), ['m0'], {});
    expect(avec.realCount).toBe(1);
    expect(avec.isRealValid).toBe(true);
  });

  it('ne valide pas une piscine dont tous les modules sont retirés', () => {
    // `every` sur une liste vide rend `true` : sans garde explicite, la piscine
    // serait acquise gratuitement, sans qu'aucun travail existe.
    const cat = run(pool(['m0', 'm1']), [], {});
    expect(cat.realCount).toBe(0);
    expect(cat.isRealValid).toBe(false);
  });

  it("n'ajoute pas l'XP des modules d'une piscine elle-même retirée", () => {
    // La piscine retirée est déjà exclue des projets validés, donc elle passe
    // dans la boucle des sous-projets « partiellement cochés » : sans garde, ses
    // modules y versaient leur XP à la catégorie qu'elle a justement quittée.
    const retiredPool = (): RNCP => {
      const data = pool([]) as any;
      data.categories[0].projects[0].retired = true;
      return data as RNCP;
    };
    const sans = run(pool([]), [], { piscine: ['m0'] });
    expect(sans.currentXP).toBe(10_000);

    const avec = run(retiredPool(), [], { piscine: ['m0'] });
    expect(avec.currentXP).toBe(0);
  });

  it("n'ajoute pas l'XP d'un module retiré coché en simulation", () => {
    // Témoin : sans drapeau, cocher m1 seul apporte ses 10 000 XP à la catégorie
    // (la piscine n'est pas acquise, mais son module partiel compte).
    const sans = run(pool([]), [], { piscine: ['m1'] });
    expect(sans.currentXP).toBe(10_000);

    // Avec m1 retiré, plus rien : la carte annonce « n'entre pas dans l'XP »,
    // le total doit dire la même chose.
    const avec = run(pool(['m1']), [], { piscine: ['m1'] });
    expect(avec.currentXP).toBe(0);
  });
});

/**
 * Cohérence des DEUX chemins de calcul d'XP d'une piscine.
 *
 * L'XP du parent est la somme de ses modules, calculée en amont : elle inclut
 * donc encore les modules retirés. La boucle des modules partiellement cochés,
 * elle, les exclut. Sans retrait explicite, une piscine validée rapportait l'XP
 * d'un module que l'école ne compte plus — et les deux chemins se contredisaient.
 */
describe("XP d'une piscine dont un module est retiré", () => {
  const pool = (retired: boolean): RNCP =>
    ({
      id: 'rncp-test', name: 'RNCP test', level: 0,
      requiredEvents: 0, requiredProfessionalExperience: 0,
      categories: [{
        id: 'cat', name: 'Catégorie', requiredCount: 1, requiredXP: 10_000,
        projects: [{
          id: 'piscine', name: 'Piscine', slug: 'piscine', xp: 20_000,
          subProjects: [
            { id: 'm0', name: 'Module 0', slug: 'm0', xp: 10_000 },
            { id: 'm1', name: 'Module 1', slug: 'm1', xp: 10_000,
              ...(retired ? { retired: true } : {}) },
          ],
        }],
      }],
    }) as unknown as RNCP;

  const run = (data: RNCP, completed: string[]) =>
    xpService.validateRNCP(
      data, 0, 0, 0, completed, [],
      undefined, undefined, undefined, {},
      { level: 0, professionalExp: 0, subProjects: {} }
    ).categoriesValidation[0];

  it("ne compte pas l'XP du module retiré dans une piscine validée", () => {
    // Témoin : piscine complète, les deux modules comptent.
    const sans = run(pool(false), ['m0', 'm1']);
    expect(sans.realCount).toBe(1);
    expect(sans.realXP).toBe(20_000);

    // m1 retiré, m0 validé : la piscine compte, mais pour 10 000 XP seulement.
    const avec = run(pool(true), ['m0']);
    expect(avec.realCount).toBe(1);
    expect(avec.realXP).toBe(10_000);
  });
});


/**
 * Identifiant et slug ne coïncident plus.
 *
 * Le référentiel est passé aux identifiants de 42 : un projet porte `42-1854`
 * comme identifiant et `42sh` comme slug. Les projets VALIDÉS arrivent de l'API
 * 42, donc par slug ; les projets SIMULÉS viennent de nos écrans, donc par
 * identifiant. Tant que les deux étaient égaux, les confondre marchait par
 * accident — et TOUS les tests d'origine utilisent des fixtures `id === slug`,
 * la seule forme où le défaut est invisible. D'où ces cas, écrits à la forme
 * réelle.
 */
describe('identifiant et slug distincts', () => {
  const rncp = (): RNCP =>
    ({
      id: 'r', name: 'RNCP', level: 0, requiredEvents: 0, requiredProfessionalExperience: 0,
      categories: [{
        id: 'c', name: 'Cat', requiredCount: 1, requiredXP: 10_000,
        projects: [{ id: '42-1854', name: '42sh', slug: '42sh', xp: 21_000 }],
      }],
    }) as unknown as RNCP;

  const run = (completed: string[], simulated: string[]) =>
    xpService.validateRNCP(
      rncp(), 0, 0, 0, completed, simulated,
      undefined, undefined, undefined, {},
      { level: 0, professionalExp: 0, subProjects: {} }
    ).categoriesValidation[0];

  it("compte un projet simulé par son IDENTIFIANT", () => {
    const cat = run([], ['42-1854']);
    expect(cat.currentCount).toBe(1);
    expect(cat.currentXP).toBe(21_000);
  });

  it("compte toujours un projet validé par son SLUG", () => {
    // C'est la forme que renvoie l'API 42 : elle ne connaît pas nos identifiants.
    const cat = run(['42sh'], []);
    expect(cat.realCount).toBe(1);
    expect(cat.realXP).toBe(21_000);
  });

  it("ne compte pas deux fois un projet à la fois validé et simulé", () => {
    const cat = run(['42sh'], ['42-1854']);
    expect(cat.currentCount).toBe(1);
    expect(cat.currentXP).toBe(21_000);
  });
});

/**
 * Le rapprochement PERMISSIF, et la garde des piscines.
 *
 * `matchesIdOrSlug` a deux moitiés : une comparaison exacte sur l'identifiant,
 * et un rapprochement normalisé sur le slug. Un test de mutation a montré que la
 * seconde moitié n'était exercée par aucun des 74 tests — remplacer
 * `isProjectCompleted` par un simple `includes` les laissait tous passer. Or
 * c'est précisément cette moitié qui gère le préfixe `42cursus-` de l'API 42, et
 * c'est elle qui faisait passer une piscine pour acquise sur un seul module.
 */
describe('rapprochement permissif', () => {
  const projet = (): RNCP =>
    ({
      id: 'r', name: 'RNCP', level: 0, requiredEvents: 0, requiredProfessionalExperience: 0,
      categories: [{
        id: 'c', name: 'Cat', requiredCount: 1, requiredXP: 1,
        projects: [{ id: '42-1463', name: 'zappy', slug: 'zappy', xp: 25_200 }],
      }],
    }) as unknown as RNCP;

  const piscine = (): RNCP =>
    ({
      id: 'r', name: 'RNCP', level: 0, requiredEvents: 0, requiredProfessionalExperience: 0,
      categories: [{
        id: 'c', name: 'Cat', requiredCount: 1, requiredXP: 1,
        projects: [{
          id: '42-2355', name: 'Piscine Mobile', slug: 'mobile', xp: 20_000,
          subProjects: [
            { id: '42-2356', name: 'Mobile 0', slug: 'mobile-0-basic', xp: 10_000 },
            { id: '42-2357', name: 'Mobile 1', slug: 'mobile-1-structure', xp: 10_000 },
          ],
        }],
      }],
    }) as unknown as RNCP;

  const run = (data: RNCP, completed: string[]) =>
    xpService.validateRNCP(
      data, 0, 0, 0, completed, [],
      undefined, undefined, undefined, {},
      { level: 0, professionalExp: 0, subProjects: {} }
    ).categoriesValidation[0];

  it("reconnaît un slug préfixé par « 42cursus- », comme l'API 42 le renvoie", () => {
    // C'est la forme réelle : l'API 42 dit « 42cursus-zappy », notre slug dit
    // « zappy ». Une comparaison exacte échouerait.
    expect(run(projet(), ['42cursus-zappy']).realCount).toBe(1);
  });

  it("ne valide PAS une piscine sur un seul de ses modules", () => {
    // Le slug de la piscine (« mobile ») est un préfixe de celui de ses modules :
    // sans la garde, le rapprochement permissif la donnait pour acquise, avec ses
    // 20 000 XP, dès le premier module validé.
    const un = run(piscine(), ['42cursus-mobile-0-basic']);
    expect(un.realCount).toBe(0);
    // L'XP d'un module VALIDÉ n'entre dans la catégorie que si la piscine est
    // complète — seuls les modules COCHÉS en simulation comptent partiellement.
    // Comportement d'origine, indépendant de la garde testée ici.
    expect(un.realXP).toBe(0);

    const tous = run(piscine(), ['42cursus-mobile-0-basic', '42cursus-mobile-1-structure']);
    expect(tous.realCount).toBe(1);
  });
});
