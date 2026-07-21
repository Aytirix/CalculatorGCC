import axios from 'axios';
import { config } from '../config/config';
import { backendAuthService } from './backend-auth.service';

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

// Reconfiguration par un admin délégué : pas de setupToken (l'auth JWT 42 en tient lieu).
// Le bootstrap d'une instance vierge ne passe plus par ici mais par /admin.
export interface AdminConfigureRequest {
  clientId: string;
  clientSecret: string;
  clientSecret42Next?: string; // Next Secret 42 de l'intra : relais automatique si le courant est révoqué
}

export interface ConfigureResponse {
  success: boolean;
  message: string;
  configured: boolean;
}

// État des credentials 42 tel que vu par un délégué : jamais les secrets eux-mêmes,
// seulement le Client ID courant (à préremplir) et ce qui est déjà en place.
export interface Api42ConfigState {
  configured: boolean;
  client_id: string | null;
  current_secret_set: boolean;
  next_secret_set: boolean;
  credentials_invalid: boolean;
}

class SetupService {
  /**
   * Vérifie l'état de configuration de l'application
   */
  async getStatus(): Promise<SetupStatus> {
    const response = await api.get<SetupStatus>('/setup/status');
    return response.data;
  }

  /**
   * État des credentials 42 pour préremplir le formulaire du délégué (JWT 42 en Bearer).
   */
  async getAdminConfig(): Promise<Api42ConfigState> {
    const token = backendAuthService.getToken();
    const response = await api.get<Api42ConfigState>('/setup/admin/config', {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    return response.data;
  }

  /**
   * Reconfiguration par un admin délégué : envoie le JWT 42 en Bearer.
   * Le backend (requireDelegate) refuse si le login n'est pas un délégué enregistré.
   */
  async configureAsAdmin(payload: AdminConfigureRequest): Promise<ConfigureResponse> {
    const token = backendAuthService.getToken();
    const response = await api.post<ConfigureResponse>('/setup/admin/configure', payload, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    return response.data;
  }
}

export const setupService = new SetupService();
