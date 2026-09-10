import { describe, it, expect } from 'vitest';
// `?raw` de Vite : les fichiers sont lus comme TEXTE. `vitest.config.ts` tourne en
// `environment: 'node'`, sans jsdom — impossible de monter le composant, qui lit
// `window.location.origin`. On vérifie donc ce qui est vérifiable ici : le
// CÂBLAGE, seul endroit où un débranchement se voit.
import appSource from '../../App.tsx?raw';
import setupServiceSource from '../../services/setup.service.ts?raw';
import hookSource from '../../hooks/useSetupCheck.ts?raw';

/**
 * Le garde-fou « ce miroir n'est pas reconnu ».
 *
 * Sans lui, un miroir non déclaré paraissait fonctionner : le site s'affichait,
 * et c'est au clic sur « Se connecter » que l'instance principale, ne trouvant
 * pas l'origine dans sa liste, retombait EN SILENCE sur son propre domaine et
 * déposait le visiteur là-bas. Constaté le 2026-09-11 sur testmirror.theomouty.fr.
 *
 * Trois maillons, et rompre n'importe lequel ramène la panne silencieuse :
 * le front envoie son origine, le hook garde la réponse, App bloque dessus.
 *
 * Reste non couvert, faute de DOM : le rendu de la page elle-même.
 */

describe('garde-fou d’origine du miroir', () => {
	it('le front ENVOIE son origine avec /setup/status', () => {
		// Sans ce paramètre, l'instance principale n'a pas de question à trancher
		// et répond `true` : le contrôle entier devient muet.
		expect(setupServiceSource).toMatch(/params:\s*\{\s*origin:\s*window\.location\.origin/);
	});

	it('le hook EXPOSE la réponse au lieu de la jeter', () => {
		expect(hookSource).toMatch(/setOriginAllowed\(/);
		expect(hookSource).toMatch(/return \{[^}]*originAllowed[^}]*\}/s);
	});

	it('le hook ne conclut PAS sur un champ absent', () => {
		// Une instance principale antérieure à ce contrôle ne renvoie rien. En
		// déduire « non autorisé » rendrait tout miroir inutilisable contre elle.
		expect(hookSource).toMatch(/status\.origin_allowed === true \? true : null/);
	});

	it('ne bloque qu’après PREUVE que ce site est un miroir', () => {
		// La régression que ce garde-fou a failli introduire : sur l'instance
		// principale, `origin_allowed: false` signifie « APP_DOMAIN ne correspond
		// pas au domaine servi » — login cassé, mais site parfaitement utilisable.
		// Bloquer là aurait noirci le dev de ce dépôt, servi sur :3000 avec un
		// APP_DOMAIN en :3100. Constaté en exécutant la route, pas en la lisant.
		expect(hookSource).toMatch(/await setupService\.estMiroir\(\)/);
		expect(hookSource).toMatch(/estMiroir\(\)\)\s*\?\s*false\s*:\s*null/);
	});

	it('la détection de miroir repose sur /health, jamais sur une déduction', () => {
		expect(setupServiceSource).toMatch(/get<\{ mode\?: string \}>\('\/health'\)/);
		expect(setupServiceSource).toMatch(/mode === 'mirror'/);
		// Toute erreur doit valoir « pas un miroir » : on ne bloque pas sur un doute.
		expect(setupServiceSource).toMatch(/catch \{\s*return false;/);
	});

	it('App BLOQUE sur la réponse, et sur `false` STRICT', () => {
		// Le mutant qui compte : débrancher la garde laissait toute la suite verte.
		expect(appSource).toMatch(/import OriginNotAllowed from/);
		expect(appSource).toMatch(/originAllowed === false/);
		expect(appSource).toMatch(/<OriginNotAllowed \/>/);
		// `if (!originAllowed)` bloquerait aussi sur `null` — donc sur un simple
		// hoquet réseau, et sur toute instance principale pas encore à jour.
		expect(appSource).not.toMatch(/if \(!originAllowed\)/);
	});

	it('épargne /admin, seule porte laissée à qui administre', () => {
		expect(appSource).toMatch(/originAllowed === false && !location\.pathname\.startsWith\('\/admin'\)/);
	});
});
