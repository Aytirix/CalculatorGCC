import axios from 'axios';
import { config } from '../config/config.js';
import { userToken42Repository, StoredToken42 } from '../db/userToken42Repository.js';

// On rafraîchit un peu avant l'expiration réelle pour absorber la latence réseau
// et éviter d'émettre une requête avec un token qui expire pendant le vol.
const REFRESH_MARGIN_MS = 60_000;
// Défaut si 42 n'a pas renvoyé `expires_in` (les tokens 42 durent ~2h).
const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;

// Un refresh en cours par utilisateur : le refresh_token 42 tourne à chaque
// usage, donc deux refresh concurrents en brûleraient un et invalideraient la
// session. On mutualise la même promesse pour tous les appelants simultanés.
const inflight = new Map<number, Promise<string | null>>();

export const token42Service = {
	/**
	 * Amorce le store depuis le JWT de l'appelant, pour les sessions déjà
	 * ouvertes avant le déploiement de cette fonctionnalité (leur token/refresh
	 * vit encore dans le JWT). No-op si le store est déjà rempli ou si le JWT
	 * ne porte pas de refresh_token.
	 */
	async ensureStored(
		userId42: number,
		jwt: { api_token?: string; refresh_token?: string; token_expires_at?: number }
	): Promise<void> {
		if (!jwt?.api_token || !jwt?.refresh_token) return;
		await userToken42Repository.seedIfAbsent(userId42, {
			accessToken: jwt.api_token,
			refreshToken: jwt.refresh_token,
			expiresAt: new Date(jwt.token_expires_at ?? Date.now()),
		});
	},

	/**
	 * Renvoie un access_token 42 valide (rafraîchi si nécessaire), ou null si une
	 * reconnexion est requise (aucun token stocké, ou refresh_token mort).
	 */
	async getValidAccessToken(userId42: number): Promise<string | null> {
		const stored = await userToken42Repository.get(userId42);
		if (!stored) return null;

		if (stored.expiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) {
			return stored.accessToken;
		}

		const existing = inflight.get(userId42);
		if (existing) return existing;

		const p = this.refresh(userId42, stored).finally(() => inflight.delete(userId42));
		inflight.set(userId42, p);
		return p;
	},

	/** Échange le refresh_token contre un nouvel access_token et persiste le tout. */
	async refresh(userId42: number, stored: StoredToken42): Promise<string | null> {
		try {
			const resp = await axios.post(
				config.oauth42.tokenUrl,
				{
					grant_type: 'refresh_token',
					client_id: config.oauth42.clientId,
					client_secret: config.oauth42.clientSecret,
					refresh_token: stored.refreshToken,
				},
				{ timeout: config.api42.requestTimeoutMs }
			);

			const { access_token, refresh_token, expires_in } = resp.data;
			if (!access_token) {
				console.error(`[Token42] Réponse de refresh sans access_token pour ${userId42}`);
				return null;
			}
			await userToken42Repository.save(userId42, {
				accessToken: access_token,
				// 42 fait tourner le refresh_token : on garde le nouveau (ou l'ancien à défaut).
				refreshToken: refresh_token || stored.refreshToken,
				expiresAt: new Date(Date.now() + (expires_in ? expires_in * 1000 : DEFAULT_TTL_MS)),
			});
			console.log(`[Token42] Access token 42 rafraîchi pour ${userId42}`);
			return access_token;
		} catch (error: any) {
			const status = error?.response?.status;
			console.error(`[Token42] Échec du refresh pour ${userId42} (status ${status ?? '?'}) — re-auth requise`);
			// invalid_grant (refresh_token révoqué/expiré) : purge pour forcer une reconnexion propre.
			if (status === 400 || status === 401) {
				await userToken42Repository.remove(userId42);
			}
			return null;
		}
	},
};
