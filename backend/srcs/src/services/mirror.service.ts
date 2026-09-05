import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db/connection.js';

/**
 * MODE MIROIR.
 *
 * Une seconde instance (celle de l'école, par exemple) peut faire tourner
 * l'application sans posséder de données : quand une URL d'API distante est
 * renseignée, ce backend cesse de servir ses propres données et relaie les
 * routes applicatives vers l'instance principale.
 *
 * Ce qui reste LOCAL, et ne part jamais au relais :
 *  - `/admin/*` : le panneau d'administration du miroir, ses passkeys et ce
 *    réglage lui-même. Sans ça, activer le mode miroir couperait l'accès qui
 *    permet de le désactiver.
 *  - `/setup*` : la configuration initiale de l'instance.
 *
 * Ce qui part au relais : tout le reste (connexion 42, données 42, simulation,
 * calendrier). L'instance principale doit avoir autorisé l'origine du miroir
 * dans sa propre liste, sans quoi elle refusera la connexion 42.
 *
 * Le réglage est stocké en base et modifiable à chaud depuis le panneau admin,
 * sans reconstruire ni redémarrer quoi que ce soit. `MIRROR_API_URL` dans
 * l'environnement sert de valeur de départ pour un déploiement automatisé.
 */

/** Préfixes qui restent servis localement, quoi qu'il arrive. */
const LOCAL_PREFIXES = ['/admin', '/setup', '/health'];

let cached: { url: string | null; at: number } | null = null;
const CACHE_MS = 5_000;

/** URL de l'API relayée, ou `null` si cette instance sert ses propres données. */
export async function getMirrorApiUrl(): Promise<string | null> {
	if (cached && Date.now() - cached.at < CACHE_MS) return cached.url;
	const row = await prisma.configuration.findUnique({
		where: { id: 1 },
		select: { mirrorApiUrl: true },
	});
	const url = row?.mirrorApiUrl?.trim() || process.env.MIRROR_API_URL?.trim() || null;
	cached = { url: url || null, at: Date.now() };
	return cached.url;
}

/** Enregistre (ou efface) l'API relayée. `null` remet l'instance en mode normal. */
export async function setMirrorApiUrl(url: string | null): Promise<void> {
	await prisma.configuration.update({ where: { id: 1 }, data: { mirrorApiUrl: url } });
	cached = null;
}

/** Valide et normalise une URL d'API distante. */
export function normalizeMirrorUrl(raw: string): string | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	try {
		const url = new URL(trimmed);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
		// On garde le chemin (souvent `/api`) mais sans barre finale.
		return (url.origin + url.pathname).replace(/\/$/, '');
	} catch {
		return null;
	}
}

function isLocalRoute(path: string): boolean {
	return LOCAL_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Relaie la requête vers l'instance principale et recopie sa réponse.
 *
 * Les redirections ne sont PAS suivies (`redirect: 'manual'`) : le flux de
 * connexion 42 repose dessus, c'est au navigateur de les suivre.
 */
export async function proxyToMirror(
	request: FastifyRequest,
	reply: FastifyReply,
	base: string
): Promise<boolean> {
	if (isLocalRoute(request.url.split('?')[0])) return false;

	const target = `${base}${request.url}`;
	const headers: Record<string, string> = {};
	for (const [key, value] of Object.entries(request.headers)) {
		// `host` doit être celui de la cible ; les en-têtes de contenu sont
		// recalculés par fetch à partir du corps qu'on lui donne.
		if (['host', 'connection', 'content-length'].includes(key)) continue;
		if (typeof value === 'string') headers[key] = value;
	}

	const hasBody = !['GET', 'HEAD'].includes(request.method);
	const response = await fetch(target, {
		method: request.method,
		headers,
		body: hasBody && request.body !== undefined ? JSON.stringify(request.body) : undefined,
		redirect: 'manual',
	});

	reply.status(response.status);
	for (const [key, value] of response.headers.entries()) {
		// L'encodage et la longueur sont refaits par Fastify à l'envoi.
		if (['content-encoding', 'content-length', 'transfer-encoding'].includes(key)) continue;
		reply.header(key, value);
	}

	const buffer = Buffer.from(await response.arrayBuffer());
	await reply.send(buffer);
	return true;
}
