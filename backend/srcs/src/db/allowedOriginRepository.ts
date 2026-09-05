import { prisma } from './connection.js';
import { config } from '../config/config.js';

/**
 * Origines web autorisées à consommer cette API.
 *
 * Sert aux déploiements « miroir » : une autre instance (celle de l'école, par
 * exemple) n'héberge que le frontend et proxifie `/api` vers ce backend. Il n'y
 * a alors qu'une seule base, qu'un seul backend, et aucun secret partagé —
 * l'owner autorise ou révoque une origine depuis le panneau admin sans jamais
 * donner d'accès direct à la base.
 *
 * Une origine, c'est schéma + hôte + port, et rien d'autre : la comparaison est
 * EXACTE. Un `startsWith` laisserait passer `https://monsite.fr.attaquant.com`,
 * et comme le jeton de session transite par l'URL de retour, ce serait un vol
 * de session en règle.
 */

export interface AllowedOriginEntry {
	id: number;
	origin: string;
	label: string | null;
	createdAt: Date;
}

/**
 * Normalise une origine saisie à la main : on n'en garde que le schéma, l'hôte
 * et le port. Renvoie `null` si ce n'est pas une URL http(s) exploitable.
 */
export function normalizeOrigin(raw: string): string | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	try {
		const url = new URL(trimmed);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
		return url.origin;
	} catch {
		return null;
	}
}

/** Une origine locale (poste de développement), jamais un déploiement public. */
function isLoopback(origin: string): boolean {
	try {
		const { hostname } = new URL(origin);
		return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
	} catch {
		return false;
	}
}

/**
 * Cache mémoire : la liste est lue à chaque requête CORS et à chaque connexion,
 * mais ne change qu'à la main depuis le panneau admin.
 */
let cached: Set<string> | null = null;

async function loadCache(): Promise<Set<string>> {
	if (cached) return cached;
	const rows = await prisma.allowedOrigin.findMany({ select: { origin: true } });
	cached = new Set(rows.map((row) => row.origin));
	return cached;
}

export const allowedOriginRepository = {
	async list(): Promise<AllowedOriginEntry[]> {
		return prisma.allowedOrigin.findMany({ orderBy: { createdAt: 'asc' } });
	},

	async add(origin: string, label: string | null): Promise<AllowedOriginEntry> {
		const entry = await prisma.allowedOrigin.upsert({
			where: { origin },
			create: { origin, label },
			update: { label },
		});
		cached = null;
		return entry;
	},

	async remove(origin: string): Promise<boolean> {
		const result = await prisma.allowedOrigin.deleteMany({ where: { origin } });
		cached = null;
		return result.count > 0;
	},

	/**
	 * L'origine est-elle autorisée ? Le domaine de l'instance elle-même l'est
	 * toujours, sans avoir à l'inscrire.
	 *
	 * Sauf en production, où un `localhost` ne peut jamais être auto-autorisé :
	 * si `APP_DOMAIN` venait à manquer, `frontendUrl` retomberait sur
	 * `http://localhost:3000` et l'autoriserait en silence sur un serveur
	 * public. Il reste possible de l'inscrire explicitement si besoin.
	 */
	async isAllowed(origin: string): Promise<boolean> {
		const normalized = normalizeOrigin(origin);
		if (!normalized) return false;

		const self = normalizeOrigin(config.frontendUrl);
		if (normalized === self && !(config.nodeEnv === 'production' && isLoopback(normalized))) {
			return true;
		}
		return (await loadCache()).has(normalized);
	},

	/** Oublie le cache (utile en test). */
	invalidateCache(): void {
		cached = null;
	},
};
