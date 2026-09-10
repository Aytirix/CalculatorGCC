import { defineConfig } from 'vitest/config';

/**
 * Tests unitaires du backend.
 *
 * Il n'y en avait aucun jusqu'ici. On commence par ce qui est à la fois le moins
 * cher à couvrir et le plus coûteux à casser : les FONCTIONS PURES du chemin de
 * sécurité — construction de la clé de rate-limit, lecture des permissions. Elles
 * n'ont besoin ni de base, ni de serveur, ni de mock.
 *
 * Les routes elles-mêmes demanderaient `fastify.inject()` et une base simulée :
 * un autre chantier, volontairement laissé de côté pour l'instant.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
