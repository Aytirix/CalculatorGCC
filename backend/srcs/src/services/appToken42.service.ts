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
/**
 * Scope demandé au départ. `projects` n'est nécessaire qu'à `/v2/project_data`
 * (le layout du Holy Graph) ; tout le reste — catalogue du cursus, sessions,
 * compétences, inscriptions — se contente de `public`.
 *
 * Toutes les applications 42 ne se voient pas accorder `projects` : le demander
 * fait alors répondre 401 `invalid_scope` et AUCUN token n'est délivré. On se
 * rabat donc sur `public`, quitte à perdre le seul endpoint concerné, plutôt
 * que de laisser toute l'application sans données de référence.
 */
const PREFERRED_SCOPE = 'public projects';
const FALLBACK_SCOPE = 'public';

/** Scope réellement obtenu, une fois la négociation faite. */
let grantedScope: string | null = null;
// Marge avant expiration réelle, pour ne pas émettre une requête avec un token
// qui expire en vol (les tokens 42 durent ~2h).
const REFRESH_MARGIN_MS = 60_000;
const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;

let cached: { token: string; expiresAt: number } | null = null;
// Une seule demande de token en vol : `/oauth/token` a un anti-spam côté 42,
// deux appels concurrents se font jeter en 429.
let inflight: Promise<string> | null = null;

async function askToken(scope: string) {
	return axios.post<{ access_token: string; expires_in?: number; scope?: string }>(
		config.oauth42.tokenUrl,
		{
			grant_type: 'client_credentials',
			client_id: config.oauth42.clientId,
			client_secret: config.oauth42.clientSecret,
			scope,
		},
		{ timeout: 15_000 }
	);
}

async function requestToken(): Promise<string> {
	// Une fois le scope négocié, on ne retente plus le plus large : inutile de
	// refaire un aller-retour en 401 à chaque renouvellement.
	const scope = grantedScope ?? PREFERRED_SCOPE;
	let response;
	try {
		response = await askToken(scope);
	} catch (error: any) {
		const isScopeRefused =
			scope !== FALLBACK_SCOPE && error?.response?.data?.error === 'invalid_scope';
		if (!isScopeRefused) throw error;

		console.warn(
			`[API42] L'application 42 n'a pas le scope « projects » : repli sur « ${FALLBACK_SCOPE} ». ` +
			'Tout fonctionne sauf le layout du Holy Graph (/v2/project_data). ' +
			"Pour le rétablir, demander ce scope sur l'application dans l'intra."
		);
		response = await askToken(FALLBACK_SCOPE);
	}

	const token = response.data.access_token;
	if (!token) throw new Error('Aucun access_token applicatif renvoyé par 42');

	grantedScope = response.data.scope ?? scope;
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

	/** Le scope `projects` est-il accordé ? `null` tant qu'aucun token n'a été demandé. */
	hasProjectsScope(): boolean | null {
		return grantedScope === null ? null : grantedScope.includes('projects');
	},
};
