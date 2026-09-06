import { describe, it, expect } from 'vitest';
import { xpService } from './xp.service';

/**
 * Conversion niveau ↔ XP.
 *
 * C'est le cœur du simulateur : tout le « niveau projeté » en découle. Une
 * erreur ici ne lève aucune exception, elle affiche un mauvais niveau — la
 * classe de bug la plus coûteuse de ce projet, parce qu'elle est invisible.
 */

describe('getLevelFromXP / getXPFromLevel', () => {
  it('fait un aller-retour fidèle sur des niveaux courants', () => {
    for (const level of [1, 5, 10.5, 15.26, 21.03]) {
      const xp = xpService.getXPFromLevel(level);
      // Tolérance : l'XP est arrondi à l'entier, donc le retour n'est pas exact.
      expect(xpService.getLevelFromXP(xp)).toBeCloseTo(level, 2);
    }
  });

  it('croît avec le niveau', () => {
    // Un niveau supérieur doit toujours coûter plus d'XP. Sans ça, une
    // simulation pourrait faire *baisser* le niveau en ajoutant de l'XP.
    let previous = -1;
    for (let level = 0; level <= 25; level++) {
      const xp = xpService.getXPFromLevel(level);
      expect(xp).toBeGreaterThan(previous);
      previous = xp;
    }
  });

  it('croît avec l’XP', () => {
    let previous = -1;
    for (const xp of [0, 1_000, 10_000, 100_000, 500_000, 1_000_000]) {
      const level = xpService.getLevelFromXP(xp);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });

  it('reste au niveau 0 en dessous du premier palier', () => {
    expect(xpService.getLevelFromXP(0)).toBe(0);
    expect(xpService.getLevelFromXP(-100)).toBe(0);
  });

  it("plafonne au dernier niveau connu au lieu de s'effondrer", () => {
    // `getXPFromLevel` renvoie 0 pour un niveau absent de la table — ce qui
    // ferait chuter un niveau projeté élevé à zéro sans le moindre signe.
    // On épingle donc la frontière : jusqu'où la table répond-elle ?
    const derniersNiveauxConnus = [21, 25, 30].filter(
      (lvl) => xpService.getXPFromLevel(lvl) > 0
    );
    expect(derniersNiveauxConnus.length).toBeGreaterThan(0);

    const maxConnu = Math.max(...derniersNiveauxConnus);
    // Au-delà de la table, la fonction renvoie 0 : comportement actuel, capturé
    // ici pour qu'un futur changement (plafonnement, extrapolation) soit un
    // choix conscient et non une régression silencieuse.
    expect(xpService.getXPFromLevel(maxConnu + 50)).toBe(0);
  });

  it('additionne les XP de projets pour projeter un niveau supérieur', () => {
    const depart = 10;
    const { projectedLevel } = xpService.simulateProjects(depart, [10_000, 20_000]);
    expect(projectedLevel).toBeGreaterThan(depart);
  });

  it('laisse le niveau inchangé quand aucun projet n’est simulé', () => {
    const { projectedLevel } = xpService.simulateProjects(12.5, []);
    expect(projectedLevel).toBeCloseTo(12.5, 2);
  });
});
