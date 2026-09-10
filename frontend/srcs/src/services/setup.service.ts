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
  async getStatus(): Promise<SetupStatus> {
    const response = await api.get<SetupStatus>('/setup/status');
    return response.data;
  }
}

export const setupService = new SetupService();
