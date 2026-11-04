import { config } from '@/config/config';

/**
 * Le CDN de 42 (`cdn.intra.42.fr`) refuse désormais toute requête sans jeton
 * de l'API (403) : une <img> pointant directement dessus reste cassée. Ces
 * photos passent donc par notre backend (`/api/avatar`), qui les récupère avec
 * le jeton applicatif.
 */
const CDN_PREFIX = 'https://cdn.intra.42.fr/users/';

/** URL à mettre dans `src` : relayée par le backend pour le CDN de 42, inchangée sinon. */
export function avatarSrc(url: string | null | undefined): string | null {
	if (!url) return null;
	if (url.startsWith(CDN_PREFIX)) return `${config.backendUrl}/avatar?u=${encodeURIComponent(url)}`;
	return url;
}
