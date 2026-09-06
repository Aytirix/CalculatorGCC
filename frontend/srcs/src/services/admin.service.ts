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
/** État du refresh global des données 42 partagées (owner uniquement). */
export interface GlobalRefreshState {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  startedBy: string | null;
  usersTotal: number;
  usersDone: number;
  lastError: string | null;
  cacheEntries: { key: string; fetchedAt: string }[];
}

export interface DelegateInfo {
  login: string;
  created_at: string;
}

/** Une origine web autorisée à consommer l'API depuis un autre domaine. */
export interface AllowedOriginInfo {
  origin: string;
  label: string | null;
  created_at: string;
}

export interface OriginsState {
  origins: AllowedOriginInfo[];
  /** Domaine de cette instance. */
  self: string;
  /** false si ce domaine n'est PAS auto-autorisé (localhost en production). */
  self_allowed: boolean;
  environment: string;
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

  // ----- Origines autorisées (déploiements miroir) -----
  async listOrigins(): Promise<OriginsState> {
    return (await api.get<OriginsState>('/admin/origins', { headers: authHeader() })).data;
  },
  async addOrigin(origin: string, label?: string): Promise<void> {
    await api.post('/admin/origins', { origin, label }, { headers: authHeader() });
  },
  async removeOrigin(origin: string): Promise<void> {
    // L'origine passe en query : dans le chemin, ses `/` sont décodés avant le
    // routage et la requête n'atteint jamais la route (404).
    await api.delete('/admin/origins', { params: { origin }, headers: authHeader() });
  },

  // ----- Mode miroir (relais vers une autre instance) -----
  async getMirror(): Promise<{ mirror_api_url: string | null }> {
    return (await api.get<{ mirror_api_url: string | null }>('/admin/mirror', { headers: authHeader() })).data;
  },
  /** Renvoie l'URL réellement enregistrée : le backend la normalise (`/api` ajouté). */
  async setMirror(url: string | null): Promise<string | null> {
    const { data } = await api.put<{ mirror_api_url: string | null }>(
      '/admin/mirror',
      { mirror_api_url: url },
      { headers: authHeader() }
    );
    return data.mirror_api_url;
  },

  // ----- Refresh global des données 42 -----
  async getGlobalRefresh(): Promise<GlobalRefreshState> {
    return (await api.get<GlobalRefreshState>('/admin/global-refresh', { headers: authHeader() })).data;
  },
  /** Renvoie `false` si un refresh est déjà en cours (bouton à laisser désactivé). */
  async startGlobalRefresh(): Promise<{ started: boolean; state: GlobalRefreshState }> {
    try {
      const res = await api.post<{ state: GlobalRefreshState }>('/admin/global-refresh', {}, { headers: authHeader() });
      return { started: true, state: res.data.state };
    } catch (e: any) {
      if (e?.response?.status === 409) return { started: false, state: e.response.data.state };
      throw e;
    }
  },
};
