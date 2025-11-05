import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

// Équivalent de __dirname en ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENV_PATH = path.join(__dirname, '../../.env');

export function generateJWTSecret(): string {
	return crypto.randomBytes(32).toString('base64');
}

export function generateSetupToken(): string {
	return crypto.randomBytes(32).toString('hex');
}

export function checkAndCreateEnv(): { isConfigured: boolean; setupToken?: string } {
	// Vérifie si le fichier .env existe
	if (!fs.existsSync(ENV_PATH)) {
		console.log('No .env file found. Creating initial configuration...');
		
		const jwtSecret = generateJWTSecret();
		const setupToken = generateSetupToken();
		
		const envContent = `# Server
PORT=7000

# Configuration Status
CONFIGURED=false
SETUP_TOKEN=${setupToken}

# 42 OAuth
CLIENT_ID_42=
CLIENT_SECRET_42=

# JWT Secret
JWT_SECRET=${jwtSecret}

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_TIMEWINDOW=60000
`;
		
		fs.writeFileSync(ENV_PATH, envContent, 'utf8');
		console.log('✅ Initial .env file created successfully');
		console.log('⚠️  Setup token generated. Please complete the setup wizard.');
		
		return { isConfigured: false, setupToken };
	}
	
	// Vérifie si l'application est configurée
	const envContent = fs.readFileSync(ENV_PATH, 'utf8');
	const configuredMatch = envContent.match(/CONFIGURED=(.+)/);
	const isConfigured = configuredMatch ? configuredMatch[1].trim() === 'true' : false;
	
	if (!isConfigured) {
		const setupTokenMatch = envContent.match(/SETUP_TOKEN=(.+)/);
		const setupToken = setupTokenMatch ? setupTokenMatch[1].trim() : undefined;
		
		if (!setupToken) {
			// Génère un nouveau token si absent
			const newSetupToken = generateSetupToken();
			const updatedContent = envContent.includes('SETUP_TOKEN=')
				? envContent.replace(/SETUP_TOKEN=.*/, `SETUP_TOKEN=${newSetupToken}`)
				: envContent.replace(/CONFIGURED=false/, `CONFIGURED=false\nSETUP_TOKEN=${newSetupToken}`);
			
			fs.writeFileSync(ENV_PATH, updatedContent, 'utf8');
			console.log('⚠️  Setup token regenerated. Please complete the setup wizard.');
			return { isConfigured: false, setupToken: newSetupToken };
		}
		
		console.log('⚠️  Application not configured. Please complete the setup wizard.');
		return { isConfigured: false, setupToken };
	}
	
	console.log('✅ Application is configured');
	return { isConfigured: true };
}

export function updateEnvConfiguration(config: {
	clientId: string;
	clientSecret: string;
}): void {
	const envContent = fs.readFileSync(ENV_PATH, 'utf8');
	
	let updatedContent = envContent
		.replace(/CLIENT_ID_42=.*/, `CLIENT_ID_42=${config.clientId}`)
		.replace(/CLIENT_SECRET_42=.*/, `CLIENT_SECRET_42=${config.clientSecret}`)
		.replace(/CONFIGURED=false/, 'CONFIGURED=true')
		.replace(/SETUP_TOKEN=.*\n?/, ''); // Supprime le token de setup
	
	fs.writeFileSync(ENV_PATH, updatedContent, 'utf8');
	
	// Met à jour les variables d'environnement en direct
	process.env.CLIENT_ID_42 = config.clientId;
	process.env.CLIENT_SECRET_42 = config.clientSecret;
	process.env.CONFIGURED = 'true';
	delete process.env.SETUP_TOKEN;
	
	console.log('✅ Configuration updated successfully (live reload applied)');
}

export function isConfigured(): boolean {
	if (!fs.existsSync(ENV_PATH)) {
		return false;
	}
	
	const envContent = fs.readFileSync(ENV_PATH, 'utf8');
	const configuredMatch = envContent.match(/CONFIGURED=(.+)/);
	return configuredMatch ? configuredMatch[1].trim() === 'true' : false;
}

export function getSetupToken(): string | null {
	if (!fs.existsSync(ENV_PATH)) {
		return null;
	}
	
	const envContent = fs.readFileSync(ENV_PATH, 'utf8');
	const setupTokenMatch = envContent.match(/SETUP_TOKEN=(.+)/);
	return setupTokenMatch ? setupTokenMatch[1].trim() : null;
}
