import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Tests unitaires du frontend.
 *
 * Volontairement limité aux FONCTIONS PURES : calculs RNCP, XP, expériences
 * professionnelles, classification des erreurs de session. C'est là que se
 * cachent les bugs coûteux de ce projet — un calcul faux n'affiche pas d'erreur,
 * il affiche un mauvais chiffre, et personne ne le voit.
 *
 * Pas de jsdom ni de testing-library : les tests de rendu React coûtent cher à
 * écrire et à maintenir, et n'attraperaient pas cette classe de bugs. Si le
 * besoin apparaît un jour, il suffira d'ajouter `environment: 'jsdom'`.
 */
export default defineConfig({
  resolve: {
    // Même alias que vite.config.ts : les modules testés importent via « @/ ».
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
