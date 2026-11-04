import axios from 'axios';
import { appToken42Service } from './appToken42.service.js';

/**
 * Photos de profil 42, servies par NOTRE backend.
 *
 * Constaté le 2026-11-04 : `cdn.intra.42.fr` répond 403 à toute requête sans
 * jeton de l'API 42 (navigateur, serveur, n'importe quel réseau), et 200 avec
 * `Authorization: Bearer <token>`. Une balise <img> ne peut pas envoyer ce
 * jeton : toutes les photos d'étudiants étaient cassées dans l'application.
 * Le backend les récupère donc avec le jeton applicatif et les relaie.
 *
 * Garde-fous :
 * - SEULES les URL de photo du CDN de 42 sont acceptées (hôte exact, chemin
 *   `/users/<hash>/<fichier image>`) : sinon la route servirait de relais vers
 *   n'importe quelle adresse (SSRF) en y joignant notre jeton.
 * - Taille et délai bornés ; cache mémoire borné (les URL contiennent un hash :
 *   une photo changée a une nouvelle URL, le cache ne sert jamais de périmé).
 */

const ALLOWED_HOST = 'cdn.intra.42.fr';
const PATH_RE = /^\/users\/[a-f0-9]{32}\/[A-Za-z0-9._-]{1,128}\.(?:jpe?g|png|gif|webp)$/i;
const MAX_BYTES = 3 * 1024 * 1024;
const CACHE_MAX_ENTRIES = 400;
// Plafond en OCTETS (400 × 3 Mo aurait pu monter à 1,2 Go de mémoire).
const CACHE_MAX_BYTES = 50 * 1024 * 1024;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// Photo absente ou refusée : on ne redemande pas à 42 avant ce délai (sinon une
// même URL invalide, appelée en boucle, consommait le quota du jeton applicatif).
const NEGATIVE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
// Route publique (une <img> n'envoie pas notre JWT) : plafond GLOBAL d'appels
// vers 42, quel que soit le nombre de visiteurs — le jeton applicatif partage
// son quota (2 req/s, 1200/h) avec le reste de l'application.
const MAX_CONCURRENT_UPSTREAM = 4;
const MAX_UPSTREAM_PER_MINUTE = 120;

export interface AvatarImage {
	body: Buffer;
	contentType: string;
}

/** Trop d'appels vers 42 en ce moment : la route répond 503 (réessayer plus tard). */
export class AvatarBusyError extends Error {}

/** URL acceptée par le relais, ou null. */
export function parseAvatarUrl(raw: unknown): URL | null {
	if (typeof raw !== 'string' || raw.length > 512) return null;
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	if (url.protocol !== 'https:' || url.hostname !== ALLOWED_HOST || url.port !== '') return null;
	if (url.username || url.password || url.search || url.hash) return null;
	if (!PATH_RE.test(url.pathname)) return null;
	return url;
}

const cache = new Map<string, { image: AvatarImage; expiresAt: number }>();
const missing = new Map<string, number>(); // URL → fin du cache négatif
const inflight = new Map<string, Promise<AvatarImage | null>>();
let cacheBytes = 0;
let upstreamActive = 0;
let upstreamWindow: number[] = []; // instants des appels vers 42 (dernière minute)

function evictOldest() {
	// Le plus ancien d'abord (ordre d'insertion d'une Map).
	const oldest = cache.keys().next().value;
	if (oldest === undefined) return;
	cacheBytes -= cache.get(oldest)!.image.body.length;
	cache.delete(oldest);
}

function remember(key: string, image: AvatarImage) {
	const previous = cache.get(key);
	if (previous) { cacheBytes -= previous.image.body.length; cache.delete(key); }
	while (cache.size > 0 && (cache.size >= CACHE_MAX_ENTRIES || cacheBytes + image.body.length > CACHE_MAX_BYTES)) {
		evictOldest();
	}
	cache.set(key, { image, expiresAt: Date.now() + CACHE_TTL_MS });
	cacheBytes += image.body.length;
}

function rememberMissing(key: string) {
	if (missing.size >= CACHE_MAX_ENTRIES) {
		const oldest = missing.keys().next().value;
		if (oldest !== undefined) missing.delete(oldest);
	}
	missing.set(key, Date.now() + NEGATIVE_TTL_MS);
}

/** Réserve un appel vers 42, ou lève AvatarBusyError si le plafond global est atteint. */
function acquireUpstream(): () => void {
	const now = Date.now();
	upstreamWindow = upstreamWindow.filter(t => now - t < 60_000);
	if (upstreamActive >= MAX_CONCURRENT_UPSTREAM || upstreamWindow.length >= MAX_UPSTREAM_PER_MINUTE) {
		throw new AvatarBusyError('Too many avatar fetches');
	}
	upstreamActive++;
	upstreamWindow.push(now);
	return () => { upstreamActive--; };
}

type Fetcher = (url: string, token: string) => Promise<{ status: number; body: Buffer; contentType: string }>;

const defaultFetcher: Fetcher = async (url, token) => {
	const res = await axios.get<ArrayBuffer>(url, {
		headers: { Authorization: `Bearer ${token}` },
		responseType: 'arraybuffer',
		timeout: FETCH_TIMEOUT_MS,
		maxContentLength: MAX_BYTES,
		maxRedirects: 0,
		validateStatus: () => true,
	});
	return {
		status: res.status,
		body: Buffer.from(res.data),
		contentType: String(res.headers['content-type'] ?? ''),
	};
};

let fetcher: Fetcher = defaultFetcher;
let getToken: () => Promise<string> = () => appToken42Service.get();

/** Pour les tests : remplacer l'accès réseau et le jeton. */
export function __setAvatarDeps(deps: { fetcher?: Fetcher; getToken?: () => Promise<string> } | null) {
	fetcher = deps?.fetcher ?? defaultFetcher;
	getToken = deps?.getToken ?? (() => appToken42Service.get());
	cache.clear();
	missing.clear();
	inflight.clear();
	cacheBytes = 0;
	upstreamActive = 0;
	upstreamWindow = [];
}

/** Pour les tests : octets en cache. */
export function __avatarCacheBytes(): number {
	return cacheBytes;
}

/** Photo relayée (depuis le cache si possible), ou null si 42 ne la fournit pas. */
export async function getAvatar(url: URL): Promise<AvatarImage | null> {
	const key = url.toString();
	const hit = cache.get(key);
	if (hit && hit.expiresAt > Date.now()) return hit.image;
	const missUntil = missing.get(key);
	if (missUntil && missUntil > Date.now()) return null;

	const pending = inflight.get(key);
	if (pending) return pending;

	const release = acquireUpstream(); // peut lever AvatarBusyError
	const task = (async () => {
		const res = await fetcher(key, await getToken());
		if (res.status !== 200 || !res.contentType.startsWith('image/') || res.body.length === 0 || res.body.length > MAX_BYTES) {
			// 403 / 404 / page d'erreur : réponse définitive pour un moment.
			if (res.status >= 400 && res.status < 500 || res.status === 200) rememberMissing(key);
			return null;
		}
		const image = { body: res.body, contentType: res.contentType };
		remember(key, image);
		return image;
	})().finally(() => { release(); inflight.delete(key); });

	inflight.set(key, task);
	return task;
}
