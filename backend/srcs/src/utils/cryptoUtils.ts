import * as crypto from 'crypto';

export function generateJWTSecret(): string {
	return crypto.randomBytes(32).toString('base64');
}

// ---------------------------------------------------------------------------
// Chiffrement symétrique (AES-256-GCM) pour les secrets stockés en base.
// Clé dérivée de JWT_SECRET (même schéma que les credentials 42). Si JWT_SECRET
// tourne, le déchiffrement échoue : l'appelant doit traiter ça comme « secret
// perdu » (ex. re-authentification) plutôt que comme un crash.
// ---------------------------------------------------------------------------
function getSecretKey(): Buffer {
	const secret = process.env.JWT_SECRET;
	if (!secret) throw new Error('JWT_SECRET not loaded — impossible de (dé)chiffrer');
	return crypto.scryptSync(secret, 'calculatorgcc-salt', 32);
}

/** Chiffre une chaîne -> "iv:authTag:ciphertext" (hex). */
export function encryptSecret(text: string): string {
	const key = getSecretKey();
	const iv = crypto.randomBytes(16);
	const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
	const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();
	return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/** Déchiffre "iv:authTag:ciphertext". Lève si la clé a changé / données altérées. */
export function decryptSecret(data: string): string {
	const key = getSecretKey();
	const [ivHex, authTagHex, encryptedHex] = data.split(':');
	const iv = Buffer.from(ivHex, 'hex');
	const authTag = Buffer.from(authTagHex, 'hex');
	const encrypted = Buffer.from(encryptedHex, 'hex');
	const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(authTag);
	return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}
