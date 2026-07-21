import axios from 'axios';
import { config } from '../config/config';
import { storage } from '@/utils/storage';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

// Auth admin autonome (découplée d'OAuth 42). La session owner est un token opaque
// émis par le backend, gardé séparément du JWT 42 et envoyé via l'en-tête dédié
// X-Admin-Session (jamais le Bearer 42).

const api = axios.create({
  baseURL: config.backendUrl,
  // Sans timeout, un backend qui ne répond jamais laisse l'écran d'accès admin figé
  // sur « Chargement… » sans aucune voie de secours. 30 s couvre la validation des
  // credentials auprès de 42 (2 appels × 10 s côté serveur) avec de la marge.
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

const ADMIN_TOKEN_KEY = 'gcc_admin_session';

function getAdminToken(): string | null {
  return storage.get(ADMIN_TOKEN_KEY);
}
function setAdminToken(token: string): void {
  storage.set(ADMIN_TOKEN_KEY, token);
}
function clearAdminToken(): void {
  storage.remove(ADMIN_TOKEN_KEY);
}
function authHeader(): Record<string, string> {
  const t = getAdminToken();
  return t ? { 'X-Admin-Session': t } : {};
}

export interface AdminStatus {
  passkey_enrolled: boolean;
  passkey_count: number;
}
export interface AdminConfig {
  configured: boolean;
  client_id: string | null;
  current_secret_set: boolean;
  next_secret_set: boolean;
  credentials_invalid: boolean;
  credentials_invalid_since: string | null;
}
export interface PasskeyInfo {
  id: number;
  label: string | null;
  transports: string | null;
  created_at: string;
  last_used_at: string | null;
}
export interface DelegateInfo {
  login: string;
  created_at: string;
}

export const adminService = {
  isAuthenticated(): boolean {
    return !!getAdminToken();
  },
  getToken: getAdminToken,
  clearToken: clearAdminToken,

  async getStatus(): Promise<AdminStatus> {
    return (await api.get<AdminStatus>('/admin/status')).data;
  },

  /** Bootstrap / recovery : échange le token console (logs serveur) contre une session. */
  async loginWithConsoleToken(token: string): Promise<void> {
    const res = await api.post<{ admin_token: string }>('/admin/session/console', { token });
    setAdminToken(res.data.admin_token);
  },

  /** Authentification par passkey (cérémonie WebAuthn complète). */
  async loginWithPasskey(): Promise<void> {
    const opt = (await api.post<{ flow_id: string; options: any }>('/admin/webauthn/auth/options')).data;
    const assertion = await startAuthentication({ optionsJSON: opt.options });
    const res = await api.post<{ admin_token: string }>('/admin/webauthn/auth/verify', {
      flow_id: opt.flow_id,
      response: assertion,
    });
    setAdminToken(res.data.admin_token);
  },

  /** Enrôlement d'une passkey (owner déjà authentifié). */
  async enrollPasskey(label?: string): Promise<void> {
    const opt = (await api.post<{ flow_id: string; options: any }>(
      '/admin/webauthn/register/options', {}, { headers: authHeader() },
    )).data;
    const attestation = await startRegistration({ optionsJSON: opt.options });
    await api.post('/admin/webauthn/register/verify',
      { flow_id: opt.flow_id, response: attestation, label },
      { headers: authHeader() },
    );
  },

  async logout(): Promise<void> {
    try {
      await api.post('/admin/logout', {}, { headers: authHeader() });
    } catch {
      /* ignore */
    }
    clearAdminToken();
  },

  // ----- Secrets 42 -----
  async getConfig(): Promise<AdminConfig> {
    return (await api.get<AdminConfig>('/admin/config', { headers: authHeader() })).data;
  },
  async updateSecrets(payload: {
    client_id: string;
    client_secret: string;
    client_secret_next?: string;
  }): Promise<void> {
    await api.put('/admin/config/secrets', payload, { headers: authHeader() });
  },

  // ----- Passkeys -----
  async listPasskeys(): Promise<PasskeyInfo[]> {
    return (await api.get<{ credentials: PasskeyInfo[] }>('/admin/credentials', { headers: authHeader() })).data.credentials;
  },
  async deletePasskey(id: number): Promise<{ sessions_revoked?: number }> {
    return (await api.delete(`/admin/credentials/${id}`, { headers: authHeader() })).data;
  },

  // ----- Délégués -----
  async listDelegates(): Promise<DelegateInfo[]> {
    return (await api.get<{ delegates: DelegateInfo[] }>('/admin/delegates', { headers: authHeader() })).data.delegates;
  },
  async addDelegate(login: string): Promise<void> {
    await api.post('/admin/delegates', { login }, { headers: authHeader() });
  },
  async removeDelegate(login: string): Promise<void> {
    await api.delete(`/admin/delegates/${encodeURIComponent(login)}`, { headers: authHeader() });
  },
};
