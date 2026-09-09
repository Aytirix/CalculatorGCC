import { describe, it, expect } from 'vitest';
import { activeSubProjects, isPoolCovered, effectiveProjectXP } from './xp.service';
import type { SimulatorProject } from '@/types/rncp.types';

/**
 * Règle partagée des modules retirés.
 *
 * Elle vivait recopiée dans cinq fichiers — Dashboard, Calendar, ProjectCard,
 * xp.service à deux endroits — et elle a divergé deux fois : l'écran comptait
 * les modules retirés pendant que le calcul RNCP les ignorait, dans un sens puis
 * dans l'autre. Ces trois fonctions sont désormais la seule définition ; les
 * tester ici couvre les cinq appelants d'un coup.
 */

const pool = (mods: { id: string; xp: number; retired?: boolean }[]): SimulatorProject =>
  ({
    id: 'piscine',
    name: 'Piscine',
    slug: 'piscine',
    xp: mods.reduce((sum, m) => sum + m.xp, 0),
    subProjects: mods.map((m) => ({ id: m.id, name: m.id, slug: m.id, xp: m.xp, ...(m.retired ? { retired: true } : {}) })),
  }) as SimulatorProject;

describe('activeSubProjects', () => {
  it('écarte les modules retirés et garde les autres', () => {
    const p = pool([{ id: 'm0', xp: 10 }, { id: 'm1', xp: 10, retired: true }]);
    expect(activeSubProjects(p).map((s) => s.id)).toEqual(['m0']);
  });

  it('rend une liste vide sur un projet sans modules, sans lever', () => {
    expect(activeSubProjects({ id: 'x', name: 'x', xp: 0 } as SimulatorProject)).toEqual([]);
  });
});

describe('isPoolCovered', () => {
  const p = pool([{ id: 'm0', xp: 10 }, { id: 'm1', xp: 10, retired: true }]);

  it("n'exige pas le module retiré", () => {
    // Témoin : sans le drapeau, m0 seul ne suffit pas.
    const sans = pool([{ id: 'm0', xp: 10 }, { id: 'm1', xp: 10 }]);
    expect(isPoolCovered(sans, (id) => id === 'm0')).toBe(false);
    // Avec m1 retiré, m0 seul suffit.
    expect(isPoolCovered(p, (id) => id === 'm0')).toBe(true);
  });

  it('reste faux si le module actif manque', () => {
    expect(isPoolCovered(p, (id) => id === 'm1')).toBe(false);
  });

  it("n'offre pas gratuitement une piscine entièrement retirée", () => {
    // `every` sur une liste vide rend `true` : sans garde, elle serait acquise
    // sans qu'aucun travail existe.
    const tout = pool([{ id: 'm0', xp: 10, retired: true }, { id: 'm1', xp: 10, retired: true }]);
    expect(isPoolCovered(tout, () => true)).toBe(false);
  });
});

describe('effectiveProjectXP', () => {
  it("déduit l'XP des modules retirés", () => {
    expect(effectiveProjectXP(pool([{ id: 'm0', xp: 60 }, { id: 'm1', xp: 40, retired: true }]))).toBe(60);
  });

  it("laisse l'XP intact quand rien n'est retiré", () => {
    expect(effectiveProjectXP(pool([{ id: 'm0', xp: 60 }, { id: 'm1', xp: 40 }]))).toBe(100);
  });

  it('ne touche pas à un projet sans modules', () => {
    expect(effectiveProjectXP({ id: 'x', name: 'x', xp: 4200 } as SimulatorProject)).toBe(4200);
  });
});
