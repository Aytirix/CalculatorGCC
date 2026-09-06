import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PROJECT_MAX_PERCENTAGE,
  clampPercentage,
  clampProjectPercentage,
  getProjectMaxPercentage,
} from './projectPercentage';

/**
 * Bornage du pourcentage de validation d'un projet.
 *
 * Un pourcentage hors bornes se propage directement dans l'XP simulé : il ne
 * casse rien, il fausse le niveau projeté en silence.
 */

describe('getProjectMaxPercentage', () => {
  it('retombe sur la borne par défaut quand le projet ne dit rien', () => {
    expect(getProjectMaxPercentage(undefined)).toBe(DEFAULT_PROJECT_MAX_PERCENTAGE);
    expect(getProjectMaxPercentage({ maxPercentage: undefined })).toBe(
      DEFAULT_PROJECT_MAX_PERCENTAGE
    );
  });

  it('respecte la borne propre au projet', () => {
    // Certains projets plafonnent à 100 : pas de bonus possible.
    expect(getProjectMaxPercentage({ maxPercentage: 100 })).toBe(100);
  });
});

describe('clampPercentage', () => {
  it('laisse passer une valeur déjà dans les bornes', () => {
    expect(clampPercentage(80)).toBe(80);
  });

  it('rabote au-dessus du maximum et remonte en dessous du minimum', () => {
    expect(clampPercentage(300)).toBe(DEFAULT_PROJECT_MAX_PERCENTAGE);
    expect(clampPercentage(-20)).toBe(0);
    expect(clampPercentage(10, 125, 50)).toBe(50);
  });

  it('accepte les bornes exactes', () => {
    expect(clampPercentage(125)).toBe(125);
    expect(clampPercentage(0)).toBe(0);
  });
});

describe('clampProjectPercentage', () => {
  it("applique la borne du projet plutôt que celle par défaut", () => {
    expect(clampProjectPercentage(125, { maxPercentage: 100 })).toBe(100);
  });

  it('applique le plancher demandé', () => {
    // Le panneau du Holy Graph n'autorise pas moins de 50 %.
    expect(clampProjectPercentage(10, { maxPercentage: 125 }, 50)).toBe(50);
  });
});
