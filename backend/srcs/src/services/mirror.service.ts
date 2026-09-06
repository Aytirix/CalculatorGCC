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

/** Le mode miroir est-il actif ? Raccourci synchrone sur le cache. */
export function isMirrorActiveCached(): boolean {
	return Boolean(cached?.url);
}

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

/**
 * Valide et normalise une URL d'API distante.
 *
 * Saisir le domaine seul (`https://exemple.fr`) est le réflexe naturel, mais
 * l'API vit derrière `/api` : sans ce chemin, le relais tombe sur le frontend
 * et reçoit du HTML — l'utilisateur voit une page blanche sans comprendre
 * pourquoi. On complète donc le chemin manquant.
 */
export function normalizeMirrorUrl(raw: string): string | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	try {
		const url = new URL(trimmed);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
		const path = url.pathname.replace(/\/$/, '');
		return url.origin + (path || '/api');
	} catch {
		return null;
	}
}

/**
 * Vérifie qu'une URL d'API répond bien comme un backend CalculatorGCC.
 *
 * Sans ce contrôle, une URL erronée s'enregistrait sans broncher et cassait
 * l'instance en silence : toutes les pages devenaient blanches, y compris celle
 * qui aurait permis de corriger le réglage.
 */
export async function checkMirrorApi(
	base: string,
	selfOrigin: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
	let response: Response;
	try {
		response = await fetch(`${base}/health`, {
			signal: AbortSignal.timeout(8000),
			headers: { accept: 'application/json' },
		});
	} catch (error) {
		return { ok: false, reason: `est injoignable (${(error as Error).message})` };
	}

	if (!response.ok) return { ok: false, reason: `a répondu ${response.status}` };

	const contentType = response.headers.get('content-type') ?? '';
	if (!contentType.includes('application/json')) {
		return {
			ok: false,
			reason: "a renvoyé une page web, pas l'API — il manque sans doute /api à la fin de l'URL",
		};
	}

	const body = (await response.json().catch(() => null)) as { status?: string } | null;
	if (body?.status !== 'ok') return { ok: false, reason: "ne ressemble pas à une API CalculatorGCC" };

	// Deuxième contrôle, décisif : l'instance distante accepte-t-elle de nous
	// rendre la main après une connexion 42 ? Elle ne le fera que si elle est à
	// jour ET si notre domaine figure dans ses origines autorisées. Sans ce
	// contrôle, tout semble marcher jusqu'au jour où l'utilisateur se connecte et
	// atterrit sur l'autre site.
	return checkReturnOrigin(base, selfOrigin);
}

/** L'instance distante nous renverra-t-elle bien nos utilisateurs après connexion ? */
async function checkReturnOrigin(
	base: string,
	selfOrigin: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
	try {
		const response = await fetch(`${base}/auth/42?origin=${encodeURIComponent(selfOrigin)}`, {
			redirect: 'manual',
			signal: AbortSignal.timeout(8000),
		});
		const location = response.headers.get('location');
		if (!location) return { ok: false, reason: "n'a pas démarré la connexion 42" };

		const state = new URL(location).searchParams.get('state');
		if (!state) {
			return {
				ok: false,
				reason:
					'tourne une version trop ancienne pour renvoyer les utilisateurs ici — il faut la mettre à jour',
			};
		}

		const payload = JSON.parse(Buffer.from(state.split('.')[0], 'base64url').toString()) as {
			o?: string;
		};
		if (payload.o !== selfOrigin) {
			return {
				ok: false,
				reason: `n'autorise pas encore ${selfOrigin} — ajoute ce domaine à ses origines autorisées`,
			};
		}
		return { ok: true };
	} catch (error) {
		return { ok: false, reason: `a échoué au test de connexion (${(error as Error).message})` };
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
	const path = request.url.split('?')[0];
	if (isLocalRoute(path)) return false;

	// Départ de la connexion 42 : on envoie le NAVIGATEUR sur l'instance
	// principale, on ne relaie pas. C'est elle qui détient les credentials 42 et
	// dont l'URL est la seule déclarée côté intra ; elle nous rendra la main à la
	// fin grâce à l'origine transportée dans le `state`.
	//
	// Relayer cette route côté serveur marcherait aussi, mais toute erreur de
	// configuration s'y transforme en page blanche illisible — une redirection
	// est plus simple et se diagnostique à l'œil dans la barre d'adresse.
	if (path === '/auth/42') {
		const query = request.url.slice(path.length);
		await reply.redirect(`${base}/auth/42${query}`);
		return true;
	}

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
