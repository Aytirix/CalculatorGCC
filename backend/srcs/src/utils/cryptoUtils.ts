import * as crypto from 'crypto';

export function generateJWTSecret(): string {
	return crypto.randomBytes(32).toString('base64');
}

export function generateSetupToken(): string {
	return crypto.randomBytes(32).toString('hex');
}
