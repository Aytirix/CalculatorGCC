import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { setupService } from '../services/setup.service';
import { lireVerdictSetup, prochainConfigured } from '../services/setupVerdict';
import { backendAuthService } from '../services/backend-auth.service';

/**
 * Hook qui vérifie que ce frontend peut travailler contre son backend.
 *
 * Deux questions, une requête : l'instance est-elle configurée, et reconnaît-elle
 * l'origine d'où on l'interroge ? La seconde ne concerne que les miroirs, dont le
 * `/api` est relayé vers l'instance principale : elle seule sait si ce miroir est
 * déclaré chez elle, et sans cette déclaration la connexion 42 y renvoie les
 * visiteurs sans un mot.
 *
 * La DÉCISION vit dans `lireVerdictSetup`, testable sans DOM ; il ne reste ici que
 * le cycle de vie React.
 */

/**
 * Intervalle minimal entre deux interrogations.
 *
 * La version précédente ne redemandait plus JAMAIS rien dès qu'une réponse
 * « configurée » était arrivée, ni même une première fois quand un jeton était
 * présent. Une origine révoquée n'était donc jamais vue. À l'inverse, interroger à
 * chaque clic ferait payer une requête par navigation à tout le monde. Trente
 * secondes : une révocation est prise en compte au changement de page suivant, et
 * un parcours normal n'émet qu'une poignée d'appels.
 */
const INTERVALLE_MIN_MS = 30_000;

export function useSetupCheck() {
	const hasToken = backendAuthService.isAuthenticated();
	const [isConfigured, setIsConfigured] = useState<boolean | null>(hasToken ? true : null);
	const [isChecking, setIsChecking] = useState(!hasToken);
	const [originAllowed, setOriginAllowed] = useState<boolean | null>(null);

	const location = useLocation();
	// Numéro d'ordre : une réponse lente d'un appel périmé ne doit pas écraser
	// celle d'un appel plus récent. Sans cela, un `false` arrivé en retard figeait
	// un avertissement que la réponse suivante avait déjà levé.
	const dernierAppel = useRef(0);
	const dernierInstant = useRef(0);

	const checkSetupStatus = useCallback(async (forcer = false) => {
		const maintenant = Date.now();
		if (!forcer && maintenant - dernierInstant.current < INTERVALLE_MIN_MS) return;
		dernierInstant.current = maintenant;

		const numero = ++dernierAppel.current;
		const verdict = await lireVerdictSetup(() => setupService.getStatus());
		// Relâché AVANT la garde d'ancienneté : sinon une réponse périmée sortait
		// sans jamais lever l'écran de chargement, et « Loading… » restait à vie.
		setIsChecking(false);
		if (numero !== dernierAppel.current) return;

		// `configured` ne revient JAMAIS en arrière — et cette fois le code le fait
		// vraiment. La version précédente n'écartait que `null`, si bien qu'un
		// `false` explicite remplaçait l'application entière par « non configurée »
		// en pleine session. Le trou est né de ce commit : avant, un porteur de
		// jeton n'interrogeait jamais cette route, et deux chemins renvoient
		// pourtant ce `false` — une instance en miroir applicatif, qui n'a par
		// conception aucun credential 42, et une instance dont les credentials ne
		// déchiffrent plus. Forme fonctionnelle pour ne pas lire un état périmé
		// depuis la fermeture du `useCallback`.
		// Forme fonctionnelle : ne pas lire un état périmé depuis la fermeture du
		// `useCallback`, dont les dépendances sont vides.
		setIsConfigured((precedent) => prochainConfigured(precedent, verdict.configured));
		setOriginAllowed(verdict.originAllowed);
	}, []);

	// Revérifié à chaque changement de route, y compris une fois l'instance connue
	// configurée, et y compris avec un jeton en poche.
	//
	// La version précédente sortait sur `if (isConfigured === true) return`, et
	// n'interrogeait rien du tout quand un jeton était présent. Le contrôle
	// d'origine, greffé sur le même effet, héritait des deux court-circuits : une
	// origine révoquée n'était donc jamais vue — ni par un visiteur connecté, ni
	// par un anonyme après sa première réponse. C'est pourtant le porteur de jeton
	// qui subit le plus la panne : il se déconnecte dans l'onglet, reclique
	// « Se connecter », et repart chez l'autre instance.
	useEffect(() => {
		checkSetupStatus();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [location.pathname]);

	return { isConfigured, isChecking, originAllowed, checkSetupStatus };
}
