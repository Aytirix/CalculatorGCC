import axios from 'axios';
import { config } from '../config/config.js';

/**
 * Token applicatif (client_credentials) pour les données de RÉFÉRENCE 42 qui
 * ne dépendent d'aucun utilisateur : catalogue des projets d'un cursus et
 * layout officiel du Holy Graph (`/v2/project_data`).
 *
 * Pourquoi un token applicatif et pas celui de l'utilisateur : `/v2/project_data`
 * exige le scope `projects`, alors que la connexion OAuth des utilisateurs ne
 * demande que `public`. Passer par le token de l'app évite de forcer TOUS les
 * utilisateurs à réautoriser l'application — et ces données étant identiques
 * pour tout le monde, elles n'ont rien de personnel.
 */
const SCOPE = 'public projects';
// Marge avant expiration réelle, pour ne pas émettre une requête avec un token
// qui expire en vol (les tokens 42 durent ~2h).
const REFRESH_MARGIN_MS = 60_000;
const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;

let cached: { token: string; expiresAt: number } | null = null;
// Une seule demande de token en vol : `/oauth/token` a un anti-spam côté 42,
// deux appels concurrents se font jeter en 429.
let inflight: Promise<string> | null = null;

async function requestToken(): Promise<string> {
	const response = await axios.post<{ access_token: string; expires_in?: number }>(
		config.oauth42.tokenUrl,
		{
			grant_type: 'client_credentials',
			client_id: config.oauth42.clientId,
			client_secret: config.oauth42.clientSecret,
			scope: SCOPE,
		},
		{ timeout: 15_000 }
	);

	const token = response.data.access_token;
	if (!token) throw new Error('Aucun access_token applicatif renvoyé par 42');

	const ttl = (response.data.expires_in ? response.data.expires_in * 1000 : DEFAULT_TTL_MS);
	cached = { token, expiresAt: Date.now() + ttl - REFRESH_MARGIN_MS };
	return token;
}

export const appToken42Service = {
	/** Token applicatif valide (mis en cache jusqu'à peu avant son expiration). */
	async get(): Promise<string> {
		if (cached && Date.now() < cached.expiresAt) return cached.token;
		if (inflight) return inflight;

		inflight = requestToken().finally(() => {
			inflight = null;
		});
		return inflight;
	},
};
