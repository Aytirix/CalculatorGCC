import { prisma } from './connection.js';
import { encryptSecret, decryptSecret } from '../utils/cryptoUtils.js';

/**
 * Tokens OAuth 42 d'un utilisateur, stockés chiffrés côté serveur.
 * Découple la session applicative (JWT 7j) du token 42 (~2h) : on peut ainsi
 * rafraîchir le token sans forcer une reconnexion.
 */
export interface StoredToken42 {
	accessToken: string;
	refreshToken: string;
	expiresAt: Date;
}

export const userToken42Repository = {
	/** Écrit/écrase les tokens (chiffrés) d'un utilisateur. */
	async save(userId42: number, token: StoredToken42): Promise<void> {
		const payload = {
			accessToken: encryptSecret(token.accessToken),
			refreshToken: encryptSecret(token.refreshToken),
			expiresAt: token.expiresAt,
		};
		await prisma.userToken42.upsert({
			where: { userId42 },
			create: { userId42, ...payload },
			update: payload,
		});
	},

	/**
	 * Tokens déchiffrés, ou null si absent OU indéchiffrable (JWT_SECRET a tourné,
	 * données altérées). Un null => l'utilisateur devra se reconnecter.
	 */
	async get(userId42: number): Promise<StoredToken42 | null> {
		const row = await prisma.userToken42.findUnique({ where: { userId42 } });
		if (!row) return null;
		try {
			return {
				accessToken: decryptSecret(row.accessToken),
				refreshToken: decryptSecret(row.refreshToken),
				expiresAt: row.expiresAt,
			};
		} catch {
			console.warn(`[Token42] Déchiffrement impossible pour ${userId42} (JWT_SECRET a changé ?) — re-auth requise`);
			return null;
		}
	},

	/** Amorce le store seulement s'il est vide (ne verrouille pas un token déjà rafraîchi). */
	async seedIfAbsent(userId42: number, token: StoredToken42): Promise<void> {
		const existing = await prisma.userToken42.findUnique({
			where: { userId42 },
			select: { userId42: true },
		});
		if (existing) return;
		await this.save(userId42, token);
	},

	/** Supprime les tokens (refresh_token mort / révoqué) pour forcer une reconnexion propre. */
	async remove(userId42: number): Promise<void> {
		await prisma.userToken42.deleteMany({ where: { userId42 } });
	},
};
