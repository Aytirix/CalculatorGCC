import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Équivalent de __dirname en ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Charge le .env s'il existe
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
	dotenv.config({ path: envPath });
}

// Helper pour construire les URLs en dev (sans APP_DOMAIN)
const buildUrl = (hostname: string, port: number, useSSL: boolean): string => {
	const protocol = useSSL ? 'https' : 'http';
	const hasPort = hostname.includes(':');
	return hasPort ? `${protocol}://${hostname}` : `${protocol}://${hostname}:${port}`;
};

// Récupérer les valeurs de l'environnement de manière dynamique
// Utilise des getters pour toujours avoir les valeurs à jour de process.env
export const config = {
	get port() {
		return parseInt(process.env.PORT || '7000', 10);
	},
	get nodeEnv() {
		return process.env.NODE_ENV || 'development';
	},
	get enableSSL() {
		return process.env.ENABLE_SSL === 'true';
	},
	get frontendUrl() {
		return process.env.APP_DOMAIN || buildUrl(process.env.HOSTNAME || 'localhost', 3000, this.enableSSL);
	},

	oauth42: {
		get clientId() {
			return process.env.CLIENT_ID_42 || '';
		},
		get clientSecret() {
			return process.env.CLIENT_SECRET_42 || '';
		},
		get redirectUri() {
			const base = process.env.APP_DOMAIN || buildUrl(
				process.env.HOSTNAME || 'localhost',
				3000,
				process.env.ENABLE_SSL === 'true'
			);
			return `${base}/api/auth/callback`;
		},
		authUrl: 'https://api.intra.42.fr/oauth/authorize',
		tokenUrl: 'https://api.intra.42.fr/oauth/token',
		apiUrl: 'https://api.intra.42.fr/v2',
	},
	
	jwt: {
		expiresIn: '7d',
	},
	
	rateLimit: {
		get max() {
			return parseInt(process.env.RATE_LIMIT_MAX || '100', 10);
		},
		get timeWindow() {
			return parseInt(process.env.RATE_LIMIT_TIMEWINDOW || '60000', 10);
		},
	},

	// Débit vers l'API 42. Limites mesurées : 2 req/s et 1200 req/h (par application).
	// minDelay 550 ms => ~1.8 req/s (marge sous 2/s). Budget horaire gardé sous 1200.
	// intParam garantit un fallback si la variable d'env est absente OU non numérique
	// (sinon un NaN désactiverait silencieusement le throttle).
	api42: {
		get minDelayMs() {
			return intParam(process.env.API42_MIN_DELAY_MS, 550);
		},
		// Si le header `x-hourly-ratelimit-remaining` passe sous ce seuil, on met la file en pause.
		get hourlyReserve() {
			return intParam(process.env.API42_HOURLY_RESERVE, 50);
		},
		// Durée de pause quand le budget horaire est presque épuisé.
		get hourlyPauseMs() {
			return intParam(process.env.API42_HOURLY_PAUSE_MS, 60000);
		},
		// Nombre de retries sur 429 avant d'abandonner la requête.
		get maxRetriesOn429() {
			return intParam(process.env.API42_MAX_RETRIES_429, 4);
		},
		// Cooldown après un refresh réussi (anti-spam) : 10 min.
		get refreshCooldownMs() {
			return intParam(process.env.API42_REFRESH_COOLDOWN_MS, 10 * 60 * 1000);
		},
		// Cooldown après un refresh en ÉCHEC : court, pour retenter sans marteler l'API.
		get failureCooldownMs() {
			return intParam(process.env.API42_FAILURE_COOLDOWN_MS, 15 * 1000);
		},
		// Timeout d'une requête vers 42 : sans ça, une requête pendue bloquerait
		// toute la file (un seul traitement à la fois) jusqu'au redémarrage.
		get requestTimeoutMs() {
			return intParam(process.env.API42_REQUEST_TIMEOUT_MS, 15 * 1000);
		},
	},
};

/** parseInt tolérant : retourne `fallback` si absent ou non numérique. */
function intParam(value: string | undefined, fallback: number): number {
	if (value == null || value === '') return fallback;
	const n = parseInt(value, 10);
	return Number.isNaN(n) ? fallback : n;
}

// Validate configuration (only logs warnings if not configured yet)
function validateConfig() {
	const isSetupMode = process.env.CONFIGURED !== 'true';

	if (isSetupMode) {
		console.log('⚠️  Application in SETUP mode');
		console.log('   Configuration will be required before normal operation');
	} else {
		const required = ['CLIENT_ID_42', 'CLIENT_SECRET_42'];
		const missing = required.filter(key => !process.env[key]);
		if (missing.length > 0) {
			throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
		}
	}

	console.log('🔧 Configuration:');
	console.log(`   Frontend URL: ${config.frontendUrl}`);
	console.log(`   Redirect URI: ${config.oauth42.redirectUri}`);
	console.log(`   SSL: ${config.enableSSL ? 'enabled' : 'disabled'}`);
}

validateConfig();
