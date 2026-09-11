import axios from 'axios';
import { config } from '../config/config';

const api = axios.create({
  baseURL: config.backendUrl,
  withCredentials: true,
  // Sans délai maximum, axios attend indéfiniment : une connexion pendue laissait
  // l'application sur « Loading… » pour toujours, puisque ce service est sur le
  // chemin du tout premier rendu. `admin.service.ts` avait déjà rencontré et
  // corrigé exactement ce piège.
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface SetupStatus {
  configured: boolean;
  message: string;
  /**
   * Cette instance reconnaît-elle l'origine d'où on l'interroge ?
   *
   * Trois valeurs, et la troisième compte autant que les deux autres :
   * `true`, `false`, et `null` quand l'instance ne fait pas autorité. Absent
   * quand elle est antérieure à ce contrôle — traité comme `null`.
   */
  origin_allowed?: boolean | null;
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
}

export const setupService = new SetupService();
