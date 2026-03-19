import * as crypto from 'crypto';
import { prisma } from './connection.js';

function getEncryptionKey(): Buffer {
	const secret = process.env.JWT_SECRET || 'temporary-secret-for-setup';
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

export async function isConfigured(): Promise<boolean> {
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

export async function loadConfigIntoEnv(): Promise<void> {
	const row = await prisma.configuration.findUnique({ where: { id: 1 } });
	if (row?.isConfigured) {
		process.env.CLIENT_ID_42 = decrypt(row.clientId42);
		process.env.CLIENT_SECRET_42 = decrypt(row.clientSecret42);
		process.env.CONFIGURED = 'true';
	}
}
