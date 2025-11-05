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

// Helper pour construire les URLs avec le bon protocole
const buildUrl = (hostname: string, port: number, useSSL: boolean): string => {
	const protocol = useSSL ? 'https' : 'http';
	return `${protocol}://${hostname}:${port}`;
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
	get hostname() {
		return process.env.HOSTNAME || 'localhost';
	},
	get enableSSL() {
		return process.env.ENABLE_SSL === 'true';
	},
	get frontendUrl() {
		return buildUrl(this.hostname, 3000, this.enableSSL);
	},

	oauth42: {
		get clientId() {
			return process.env.CLIENT_ID_42 || '';
		},
		get clientSecret() {
			return process.env.CLIENT_SECRET_42 || '';
		},
		get redirectUri() {
			const hostname = process.env.HOSTNAME || 'localhost';
			const enableSSL = process.env.ENABLE_SSL === 'true';
			return `${buildUrl(hostname, 3000, enableSSL)}/api/auth/callback`;
		},
		authUrl: 'https://api.intra.42.fr/oauth/authorize',
		tokenUrl: 'https://api.intra.42.fr/oauth/token',
		apiUrl: 'https://api.intra.42.fr/v2',
	},
	
	jwt: {
		get secret() {
			return process.env.JWT_SECRET || 'temporary-secret-for-setup';
		},
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
};

// Validate configuration (only logs warnings if not configured yet)
function validateConfig() {
	// Vérifie si on est en mode setup
	const isSetupMode = process.env.CONFIGURED !== 'true';
	
	if (isSetupMode) {
		console.log('⚠️  Application in SETUP mode');
		console.log('   Configuration will be required before normal operation');
	} else {
		// Vérifie les variables requises seulement si configuré
		const required = [
			'CLIENT_ID_42',
			'CLIENT_SECRET_42',
			'JWT_SECRET',
		];
		
		const missing = required.filter(key => !process.env[key]);
		
		if (missing.length > 0) {
			throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
		}
	}
	
	// Log des URLs construites pour debug
	console.log('🔧 Configuration:');
	console.log(`   Frontend URL: ${config.frontendUrl}`);
	console.log(`   Redirect URI: ${config.oauth42.redirectUri}`);
	console.log(`   SSL: ${config.enableSSL ? 'enabled' : 'disabled'}`);
}

validateConfig();
