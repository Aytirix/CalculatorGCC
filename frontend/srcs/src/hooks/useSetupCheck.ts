import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { setupService } from '../services/setup.service';
import { rafraichirStatut } from '../services/setupVerdict';
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
 * Il ne reste ici QUE du cycle de vie React. Toute la politique — faut-il
 * interroger, que garder de la réponse, que faire d'une réponse périmée — vit
 * dans `rafraichirStatut`, testable par son résultat. Ce découpage n'est pas un
 * goût : un audit par mutation a montré que tant que la décision restait dans le
 * hook, `setOriginAllowed(null)` rétablissait la panne d'origine sans faire
 * tomber un seul test.
 */
export function useSetupCheck() {
	const hasToken = backendAuthService.isAuthenticated();
	const [isConfigured, setIsConfigured] = useState<boolean | null>(hasToken ? true : null);
	const [isChecking, setIsChecking] = useState(!hasToken);
	const [originAllowed, setOriginAllowed] = useState<boolean | null>(null);

	const location = useLocation();
	// Numéro d'ordre : une réponse lente d'un appel périmé ne doit pas écraser
	// celle d'un appel plus récent.
	const dernierAppel = useRef(0);
	const dernierInstant = useRef(0);

	const checkSetupStatus = useCallback(async (forcer = false) => {
		const numero = ++dernierAppel.current;
		const maintenant = Date.now();
		const aInterroge = await rafraichirStatut({
			maintenant,
			dernierInstant: dernierInstant.current,
			forcer,
			lire: () => setupService.getStatus(),
			estPerime: () => numero !== dernierAppel.current,
			setters: { setIsChecking, setIsConfigured, setOriginAllowed },
		});
		if (aInterroge) dernierInstant.current = maintenant;
	}, []);

	// Revérifié à chaque changement de route, y compris une fois l'instance connue
	// configurée, et y compris avec un jeton en poche.
	//
	// La version d'origine sortait sur `if (isConfigured === true) return`, et
	// n'interrogeait rien du tout quand un jeton était présent. Le contrôle
	// d'origine, greffé sur le même effet, héritait des deux court-circuits : une
	// origine révoquée n'était donc jamais vue. C'est pourtant le porteur de jeton
	// qui subit le plus la panne — il se déconnecte dans l'onglet, reclique
	// « Se connecter », et repart chez l'autre instance.
	useEffect(() => {
		checkSetupStatus();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [location.pathname]);

	return { isConfigured, isChecking, originAllowed, checkSetupStatus };
}
