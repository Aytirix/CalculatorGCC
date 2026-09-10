import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { setupService } from '../services/setup.service';
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
 * Règle: si l'utilisateur possède un JWT, l'application est forcément déjà
 * configurée (sinon le backend refuserait toute requête authentifiée). Dans
 * ce cas on ne touche jamais /setup/status. La route n'est interrogée qu'une
 * seule fois, lors de la toute première visite anonyme.
 */
export function useSetupCheck() {
  const hasToken = backendAuthService.isAuthenticated();
  const [isConfigured, setIsConfigured] = useState<boolean | null>(hasToken ? true : null);
  const [isChecking, setIsChecking] = useState(!hasToken);
  // `null` = on ne sait pas (pas encore demandé, réseau muet, ou instance
  // principale antérieure au contrôle). Seul un `false` explicite bloque.
  const [originAllowed, setOriginAllowed] = useState<boolean | null>(null);

  const location = useLocation();

  // Revérifié à chaque changement de route tant qu'on croit l'instance NON
  // configurée. Sans ça, le drapeau était figé pour toute la vie de l'onglet :
  // après avoir renseigné les identifiants 42 depuis le panneau, revenir à
  // l'accueil réaffichait « Ce site n'a pas encore reçu ses identifiants » —
  // une affirmation devenue fausse, au terme même du parcours qu'elle guide.
  // Une fois `true`, on ne redemande plus rien : l'état ne revient pas en arrière.
  useEffect(() => {
    if (isConfigured === true) return;
    checkSetupStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const checkSetupStatus = useCallback(async () => {
    // Token présent → app configurée par construction, aucune requête nécessaire
    if (backendAuthService.isAuthenticated()) {
      setIsConfigured(true);
      setIsChecking(false);
      return;
    }

    try {
      const status = await setupService.getStatus();
      setIsConfigured(status.configured);

      if (status.origin_allowed === false) {
        // Un refus ne coupe l'affichage que sur un MIROIR, et seulement après
        // preuve positive (`/api/health` répond `mode: mirror`, ce que seul un
        // miroir fait). Sur l'instance principale, ce même refus veut dire que
        // son APP_DOMAIN ne correspond pas au domaine réellement servi : sa
        // connexion 42 est cassée, mais tout le reste marche — noircir la page
        // serait un remède pire que le mal. C'est le cas du dev de ce dépôt,
        // servi sur :3000 avec un APP_DOMAIN en :3100.
        setOriginAllowed((await setupService.estMiroir()) ? false : null);
      } else {
        // Champ absent = instance principale antérieure à ce contrôle. On reste
        // dans l'inconnu : bloquer sur une absence de réponse ferait tomber tout
        // miroir pointé sur une principale pas encore à jour.
        setOriginAllowed(status.origin_allowed === true ? true : null);
      }
    } catch (error: any) {
      // « Le serveur DIT qu'il n'est pas configuré » et « le serveur ne répond
      // pas » sont deux choses différentes, et on les confondait toutes les deux
      // en `false`. Depuis qu'un écran affirme « Ce site n'a pas encore reçu ses
      // identifiants 42 », cette confusion fait mentir l'application à chaque
      // hoquet du backend. On ne conclut donc que sur une réponse explicite ;
      // sinon on reste dans l'inconnu (`null`) et l'application suit son cours.
      if (error?.response?.data?.setupRequired || error?.response?.data?.configured === false) {
        setIsConfigured(false);
      } else {
        setIsConfigured(null);
      }
    } finally {
      setIsChecking(false);
    }
  }, []);

  return { isConfigured, isChecking, originAllowed, checkSetupStatus };
}
