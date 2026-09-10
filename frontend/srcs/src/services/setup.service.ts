import axios from 'axios';
import { config } from '../config/config';

const api = axios.create({
  baseURL: config.backendUrl,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface SetupStatus {
  configured: boolean;
  message: string;
  /**
   * Cette instance-ci reconnaît-elle l'origine d'où on l'interroge ?
   *
   * Absent quand l'instance principale est antérieure à ce contrôle : on ne
   * conclut alors rien plutôt que de bloquer à tort. Voir `useSetupCheck`.
   */
  origin_allowed?: boolean;
}

/**
 * Il ne reste qu'une question ici : « cette instance est-elle configurée ? ».
 *
 * La reconfiguration des identifiants 42 vivait aussi dans ce service, via
 * /setup/admin/*. Ces routes doublaient la zone « Secrets 42 » du panneau, avec le
 * défaut d'exiger une session 42 valide pour réparer... la connexion 42 : quand la
 * clé était morte, cette voie ne pouvait jamais aboutir. Tout passe par /admin.
 */
class SetupService {
  /**
   * On transmet notre propre origine : sur un miroir, c'est l'instance PRINCIPALE
   * qui répond, et elle seule sait si ce miroir est déclaré chez elle. Sans cette
   * question, un miroir non déclaré paraissait fonctionner jusqu'au clic sur
   * « Se connecter », qui déposait le visiteur sur le site principal.
   */
  async getStatus(): Promise<SetupStatus> {
    const response = await api.get<SetupStatus>('/setup/status', {
      params: { origin: window.location.origin },
    });
    return response.data;
  }

  /**
   * Ce site est-il servi par un MIROIR ?
   *
   * `/api/health` est la seule route qu'un miroir traite LUI-MÊME, sans relayer :
   * son nginx y répond `{"mode":"mirror"}`, là où l'instance principale renvoie la
   * réponse de Fastify, sans ce champ. C'est donc une preuve positive, et non une
   * déduction.
   *
   * Elle sert à ne bloquer l'affichage que là où le blocage a un sens. Sans elle,
   * un `origin_allowed: false` coupait aussi une instance PRINCIPALE dont
   * l'`APP_DOMAIN` ne correspond pas au domaine réellement servi — le cas du dev
   * de ce dépôt, servi sur :3000 avec un APP_DOMAIN en :3100. Le remède aurait
   * été bien pire que le mal : site entièrement noir contre login cassé.
   *
   * Toute erreur vaut `false` : on ne bloque jamais sur une incertitude.
   */
  async estMiroir(): Promise<boolean> {
    try {
      const response = await api.get<{ mode?: string }>('/health');
      return response.data?.mode === 'mirror';
    } catch {
      return false;
    }
  }
}

export const setupService = new SetupService();
