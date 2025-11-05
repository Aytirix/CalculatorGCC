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

export interface SetupTokenResponse {
  setupToken: string;
  message: string;
}

export interface ConfigureRequest {
  setupToken: string;
  clientId: string;
  clientSecret: string;
}

export interface ConfigureResponse {
  success: boolean;
  message: string;
  configured: boolean;
}

class SetupService {
  /**
   * Vérifie l'état de configuration de l'application
   */
  async getStatus(): Promise<SetupStatus> {
    const response = await api.get<SetupStatus>('/api/setup/status');
    return response.data;
  }

  /**
   * Récupère le token de setup
   * Ce token est nécessaire pour configurer l'application
   */
  async getSetupToken(): Promise<string> {
    const response = await api.get<SetupTokenResponse>('/api/setup/token');
    return response.data.setupToken;
  }

  /**
   * Configure l'application avec les credentials 42 API
   */
  async configure(config: ConfigureRequest): Promise<ConfigureResponse> {
    const response = await api.post<ConfigureResponse>('/api/setup/configure', config);
    return response.data;
  }
}

export const setupService = new SetupService();
