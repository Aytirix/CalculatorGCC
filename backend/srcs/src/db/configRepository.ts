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

export async function loadOrGenerateJwtSecret(): Promise<void> {
	const row = await prisma.configuration.findUnique({ where: { id: 1 } });

	// env prioritaire : on le mirroite dans la DB pour que jwtSecret reflète
	// toujours le secret actif (évite toute divergence env/DB et rend un futur
	// retrait de l'env sûr — les creds restent déchiffrables).
	if (process.env.JWT_SECRET) {
		if (row && row.jwtSecret !== process.env.JWT_SECRET) {
			await prisma.configuration.update({
				where: { id: 1 },
				data: { jwtSecret: process.env.JWT_SECRET },
			});
		}
		return;
	}

	// Sinon, secret depuis la DB.
	if (row?.jwtSecret) {
		process.env.JWT_SECRET = row.jwtSecret;
		return;
	}

	// Sinon, génère un secret aléatoire (instance vierge).
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

export async function saveConfiguration(clientId: string, clientSecret: string): Promise<void> {
	await prisma.configuration.update({
		where: { id: 1 },
		data: {
			clientId42: encrypt(clientId),
			clientSecret42: encrypt(clientSecret),
			isConfigured: true,
			// Credentials fraîchement (re)validés par 42 → on lève le drapeau d'alerte.
			credentialsInvalidSince: null,
		},
	});
	process.env.CLIENT_ID_42 = clientId;
	process.env.CLIENT_SECRET_42 = clientSecret;
	process.env.CONFIGURED = 'true';
	delete process.env.SETUP_TOKEN;
}

/**
 * Enregistre le « Next Secret 42 » : le prochain client_secret OAuth affiché par
 * l'intra 42, gardé chiffré sous la clé courante. Il sera essayé automatiquement
 * en relais dès que le secret courant sera refusé (voir requestOAuth42Token).
 * N'accepte qu'une valeur non vide — la purge d'un Next se fait par promotion
 * (rotation) ou remplacement, jamais par un champ laissé vide (cf. applyConfiguration).
 */
export async function setNextClientSecret42(secret: string): Promise<void> {
	await prisma.configuration.update({
		where: { id: 1 },
		data: { clientSecret42Next: encrypt(secret) },
	});
}

/** Renvoie le « Next Secret 42 » en clair, ou null s'il n'y en a pas / indéchiffrable. */
export async function getNextClientSecret42(): Promise<string | null> {
	const row = await prisma.configuration.findUnique({ where: { id: 1 } });
	if (!row?.clientSecret42Next) return null;
	try {
		return decrypt(row.clientSecret42Next);
	} catch {
		// Indéchiffrable (JWT_SECRET différent de celui du chiffrement) : on l'ignore
		// plutôt que de crasher — la bannière admin invitera à re-saisir les creds.
		return null;
	}
}

/**
 * Promeut le « Next Secret 42 » en secret courant : la valeur chiffrée est déjà
 * sous la clé courante, on la recopie donc telle quelle puis on vide le next et
 * on lève le drapeau d'alerte. Met aussi à jour process.env pour l'usage runtime.
 * Renvoie le nouveau secret en clair, ou null s'il n'y avait pas de next.
 */
export async function promoteClientSecret42Next(): Promise<string | null> {
	const row = await prisma.configuration.findUnique({ where: { id: 1 } });
	if (!row?.clientSecret42Next) return null;

	const newSecretPlain = decrypt(row.clientSecret42Next);
	// On met à jour process.env AVANT de vider la colonne Next en base : ainsi une
	// requête concurrente qui verrait déjà `clientSecret42Next = null` (DB commit)
	// verra forcément aussi le nouveau secret courant en env → son re-test anti-race
	// (requestOAuth42Token) réussit au lieu de condamner à tort. Ordre inverse =
	// fenêtre où Next=null mais env encore périmé (faux positif de course).
	process.env.CLIENT_SECRET_42 = newSecretPlain;
	await prisma.configuration.update({
		where: { id: 1 },
		data: {
			clientSecret42: row.clientSecret42Next, // déjà chiffré, même clé
			clientSecret42Next: null,
			credentialsInvalidSince: null,
		},
	});
	return newSecretPlain;
}

/** Marque les credentials 42 comme invalides (aucun secret ne fonctionne). Idempotent. */
export async function markCredentialsInvalid(): Promise<void> {
	const row = await prisma.configuration.findUnique({ where: { id: 1 } });
	if (row?.credentialsInvalidSince) return; // déjà marqué : pas de réécriture
	await prisma.configuration.update({
		where: { id: 1 },
		data: { credentialsInvalidSince: new Date() },
	});
}

/**
 * Lève le drapeau d'alerte SI il est posé — appelé sur tout appel OAuth réussi avec
 * le secret courant. Évite qu'un `invalid_client` transitoire laisse la bannière
 * admin allumée en permanence une fois le service rétabli. No-op (hors lecture) si
 * le drapeau n'est pas posé, pour ne pas écrire en base à chaque login/refresh.
 */
export async function clearCredentialsInvalidIfSet(): Promise<void> {
	const row = await prisma.configuration.findUnique({ where: { id: 1 } });
	if (!row?.credentialsInvalidSince) return;
	await prisma.configuration.update({
		where: { id: 1 },
		data: { credentialsInvalidSince: null },
	});
}

/**
 * État de configuration destiné à l'admin, en une seule lecture :
 *  - `credentialsInvalidSince` : non-null si plus aucun secret 42 ne fonctionne ;
 *  - `nextSecretMissing` : true si aucun « Next Secret 42 » n'est en attente
 *    (→ inviter l'admin à en préparer un pour la prochaine rotation).
 */
export async function getAdminConfigStatus(): Promise<{
	credentialsInvalidSince: Date | null;
	nextSecretMissing: boolean;
}> {
	const row = await prisma.configuration.findUnique({ where: { id: 1 } });
	return {
		credentialsInvalidSince: row?.credentialsInvalidSince ?? null,
		nextSecretMissing: !row?.clientSecret42Next,
	};
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
