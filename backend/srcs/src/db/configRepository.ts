import * as crypto from 'crypto';
import { prisma } from './connection.js';

function deriveKey(secret: string): Buffer {
	return crypto.scryptSync(secret, 'calculatorgcc-salt', 32);
}

function getEncryptionKey(): Buffer {
	const secret = process.env.JWT_SECRET;
	if (!secret) throw new Error('JWT_SECRET not loaded — call loadOrGenerateJwtSecret() first');
	return deriveKey(secret);
}

function encryptWithKey(text: string, key: Buffer): string {
	const iv = crypto.randomBytes(16);
	const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
	const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();
	return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptWithKey(data: string, key: Buffer): string {
	const [ivHex, authTagHex, encryptedHex] = data.split(':');
	const iv = Buffer.from(ivHex, 'hex');
	const authTag = Buffer.from(authTagHex, 'hex');
	const encrypted = Buffer.from(encryptedHex, 'hex');
	const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(authTag);
	return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}

function encrypt(text: string): string {
	return encryptWithKey(text, getEncryptionKey());
}

function decrypt(data: string): string {
	return decryptWithKey(data, getEncryptionKey());
}

export async function initConfig(): Promise<void> {
	await prisma.configuration.upsert({
		where: { id: 1 },
		update: {},
		create: { id: 1 },
	});
}

type ConfigRow = NonNullable<Awaited<ReturnType<typeof prisma.configuration.findUnique>>>;

/**
 * Promotion du « Next Secret » → « Secret » quand le secret courant a expiré.
 * Re-chiffre les credentials 42 avec la nouvelle clé (ancien secret → next),
 * puis vide le next et la date d'expiration.
 *
 * Ne s'exécute QUE si l'env JWT_SECRET n'est pas posé : sinon le secret actif
 * est celui de l'env (immuable côté app) et re-chiffrer sous le next casserait
 * le déchiffrement. Avec env posé, on log seulement que la rotation est en
 * attente.
 */
async function promoteIfExpired(row: ConfigRow): Promise<ConfigRow> {
	if (!row.jwtSecretNext || !row.jwtSecretExpiresAt) return row;
	if (Date.now() < row.jwtSecretExpiresAt.getTime()) return row;

	if (process.env.JWT_SECRET) {
		console.warn(
			'⚠️  Rotation JWT due (secret expiré) mais ignorée : JWT_SECRET (env) est prioritaire. ' +
			'Retire la variable d\'env pour activer la rotation par la base.'
		);
		return row;
	}

	console.log('🔄 Secret JWT expiré → promotion du Next Secret...');

	const nextSecret = row.jwtSecretNext;

	// Instance configurée : re-chiffrer les creds avec la nouvelle clé.
	if (row.isConfigured && row.jwtSecret) {
		const oldKey = deriveKey(row.jwtSecret);
		const newKey = deriveKey(nextSecret);
		const clientId = decryptWithKey(row.clientId42, oldKey);
		const clientSecret = decryptWithKey(row.clientSecret42, oldKey);
		await prisma.configuration.update({
			where: { id: 1 },
			data: {
				jwtSecret: nextSecret,
				jwtSecretNext: null,
				jwtSecretExpiresAt: null,
				clientId42: encryptWithKey(clientId, newKey),
				clientSecret42: encryptWithKey(clientSecret, newKey),
			},
		});
	} else {
		await prisma.configuration.update({
			where: { id: 1 },
			data: {
				jwtSecret: nextSecret,
				jwtSecretNext: null,
				jwtSecretExpiresAt: null,
			},
		});
	}

	console.log('✅ Promotion effectuée : Next Secret → Secret (Next Secret vidé)');

	return (await prisma.configuration.findUnique({ where: { id: 1 } }))!;
}

export async function loadOrGenerateJwtSecret(): Promise<void> {
	let row = await prisma.configuration.findUnique({ where: { id: 1 } });

	// 1) Promotion auto si le secret courant a expiré et qu'un Next Secret est prêt.
	if (row) row = await promoteIfExpired(row);

	// 2) env prioritaire. On le mirroite dans la DB pour que jwtSecret reflète
	//    toujours le secret actif : évite toute divergence env/DB et rend un futur
	//    retrait de l'env sûr (les creds restent déchiffrables).
	if (process.env.JWT_SECRET) {
		if (row && row.jwtSecret !== process.env.JWT_SECRET) {
			await prisma.configuration.update({
				where: { id: 1 },
				data: { jwtSecret: process.env.JWT_SECRET },
			});
		}
		return;
	}

	// 3) Sinon, secret depuis la DB.
	if (row?.jwtSecret) {
		process.env.JWT_SECRET = row.jwtSecret;
		return;
	}

	// 4) Sinon, génère un secret aléatoire (instance vierge).
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

/**
 * Programme un futur secret JWT : il sera promu automatiquement au boot une fois
 * la date d'expiration dépassée (voir promoteIfExpired). N'altère pas le secret
 * actif ni le chiffrement des creds — la rotation effective a lieu à la promotion.
 */
export async function stageNextSecret(nextSecret: string, expiresAt: Date): Promise<void> {
	await prisma.configuration.update({
		where: { id: 1 },
		data: {
			jwtSecretNext: nextSecret,
			jwtSecretExpiresAt: expiresAt,
		},
	});
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
