import * as crypto from 'crypto';
import { prisma } from './connection.js';

function getEncryptionKey(): Buffer {
	const secret = process.env.JWT_SECRET;
	if (!secret) throw new Error('JWT_SECRET not loaded — call loadOrGenerateJwtSecret() first');
	return crypto.scryptSync(secret, 'calculatorgcc-salt', 32);
}

function encrypt(text: string): string {
	const key = getEncryptionKey();
	const iv = crypto.randomBytes(16);
	const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
	const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();
	return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(data: string): string {
	const key = getEncryptionKey();
	const [ivHex, authTagHex, encryptedHex] = data.split(':');
	const iv = Buffer.from(ivHex, 'hex');
	const authTag = Buffer.from(authTagHex, 'hex');
	const encrypted = Buffer.from(encryptedHex, 'hex');
	const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(authTag);
	return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}

export async function initConfig(): Promise<void> {
	await prisma.configuration.upsert({
		where: { id: 1 },
		update: {},
		create: { id: 1 },
	});
}

export async function loadOrGenerateJwtSecret(): Promise<void> {
	if (process.env.JWT_SECRET) return;

	const row = await prisma.configuration.findUnique({ where: { id: 1 } });

	if (row?.jwtSecret) {
		process.env.JWT_SECRET = row.jwtSecret;
		return;
	}

	const secret = crypto.randomBytes(64).toString('hex');
	await prisma.configuration.update({
		where: { id: 1 },
		data: { jwtSecret: secret },
	});
	process.env.JWT_SECRET = secret;
	console.log('✅ JWT secret auto-generated and persisted');
}

function envOverridesDb(): boolean {
	// On n'override la DB que pour les environnements dérivés qui ont cloné la
	// prod (ex. pre-prod). En prod, le wizard de setup reste la source de
	// vérité — sinon on bypass-erait silencieusement les credentials saisis.
	return process.env.CLONE_FROM_PROD_ENABLED === 'true'
		&& !!process.env.CLIENT_ID_42
		&& !!process.env.CLIENT_SECRET_42;
}

export async function isConfigured(): Promise<boolean> {
	if (envOverridesDb()) return true;
	const row = await prisma.configuration.findUnique({ where: { id: 1 } });
	return row?.isConfigured ?? false;
}

export async function getSetupToken(): Promise<string | null> {
	const row = await prisma.configuration.findUnique({ where: { id: 1 } });
	return row?.setupToken ?? null;
}

export async function ensureSetupToken(): Promise<string> {
	const existing = await getSetupToken();
	if (existing) return existing;

	const token = crypto.randomBytes(32).toString('hex');
	await prisma.configuration.update({
		where: { id: 1 },
		data: { setupToken: token },
	});
	return token;
}

export async function saveConfiguration(clientId: string, clientSecret: string): Promise<void> {
	await prisma.configuration.update({
		where: { id: 1 },
		data: {
			clientId42: encrypt(clientId),
			clientSecret42: encrypt(clientSecret),
			isConfigured: true,
			setupToken: null,
		},
	});
	process.env.CLIENT_ID_42 = clientId;
	process.env.CLIENT_SECRET_42 = clientSecret;
	process.env.CONFIGURED = 'true';
	delete process.env.SETUP_TOKEN;
}

export async function rotateEncryptionKey(nextSecret: string): Promise<void> {
	const currentSecret = process.env.JWT_SECRET;
	if (!currentSecret) throw new Error('JWT_SECRET is required');
	if (currentSecret === nextSecret) return;

	const row = await prisma.configuration.findUnique({ where: { id: 1 } });
	if (!row?.isConfigured) {
		await prisma.configuration.update({
			where: { id: 1 },
			data: { jwtSecret: nextSecret },
		});
		process.env.JWT_SECRET = nextSecret;
		return;
	}

	console.log('🔄 Rotating encryption key...');

	const clientId = decrypt(row.clientId42);
	const clientSecret = decrypt(row.clientSecret42);

	const prevSecret = process.env.JWT_SECRET!;
	process.env.JWT_SECRET = nextSecret;

	try {
		await prisma.configuration.update({
			where: { id: 1 },
			data: {
				jwtSecret: nextSecret,
				clientId42: encrypt(clientId),
				clientSecret42: encrypt(clientSecret),
			},
		});
	} catch (err) {
		process.env.JWT_SECRET = prevSecret;
		throw err;
	}

	console.log('✅ Encryption key rotated');
}

export async function loadConfigIntoEnv(): Promise<void> {
	// Override DB depuis l'env uniquement pour les environnements clonés (pre-prod).
	// Évite que la pre-prod utilise les credentials 42 de prod copiés via DB clone.
	if (envOverridesDb()) {
		process.env.CONFIGURED = 'true';
		return;
	}

	const row = await prisma.configuration.findUnique({ where: { id: 1 } });
	if (!row?.isConfigured) return;

	try {
		process.env.CLIENT_ID_42 = decrypt(row.clientId42);
		process.env.CLIENT_SECRET_42 = decrypt(row.clientSecret42);
		process.env.CONFIGURED = 'true';
	} catch {
		// Le secret courant ne déchiffre pas les credentials (JWT_SECRET changé ou
		// régénéré). On NE crash PAS et on ne tente aucun ancien secret : on repasse
		// l'instance en mode setup pour que l'admin re-saisisse les credentials 42
		// via le wizard (ils seront re-chiffrés sous le secret courant).
		// Aucune donnée utilisateur n'est touchée : les tables user_simulation /
		// simulated_project sont indépendantes de la table configuration.
		console.error(
			'⚠️  Credentials 42 indéchiffrables (JWT_SECRET différent de celui du chiffrement). ' +
			'Passage en mode setup : re-saisie requise via /setup. Aucune donnée utilisateur perdue.'
		);
		await prisma.configuration.update({
			where: { id: 1 },
			data: { isConfigured: false },
		});
		process.env.CONFIGURED = 'false';
		delete process.env.CLIENT_ID_42;
		delete process.env.CLIENT_SECRET_42;
	}
}
