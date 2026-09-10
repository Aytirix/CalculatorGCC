import * as crypto from 'crypto';

/**
 * Clé de comptage du rate-limit.
 *
 * L'IP est un mauvais discriminant dès qu'il y a du NAT : une école ou une
 * entreprise entière sort sur une poignée d'adresses publiques, et ses membres se
 * partageaient donc un seul quota. Même chose, en pire, derrière une instance
 * miroir : elle relaie pour tous ses visiteurs depuis une adresse unique, et
 * l'instance principale écrase de toute façon le `X-Real-IP` qu'elle transmet.
 *
 * Quand une identité VÉRIFIÉE est disponible, on compte donc par personne. L'IP ne
 * sert plus que là où il n'y a rien d'autre — au premier rang, la route de login
 * par token console, seule vraie cible de bruteforce et par nature anonyme.
 */

/** Ce dont la fonction a besoin d'une requête. Volontairement minimal : testable. */
export interface EntreeCle {
	authorization?: string;
	adminSession?: string;
	xRealIp?: string;
	/** Adresse de la connexion, quand aucun en-tête ne donne mieux. */
	ip: string;
}

/**
 * Vérifie la SIGNATURE d'un JWT et en tire l'identifiant 42.
 *
 * La vérification n'est pas optionnelle : un JWT n'est que du base64, et lire le
 * payload sans contrôler la signature laisserait n'importe qui se fabriquer une
 * clé neuve à chaque requête — le quota ne voudrait alors plus rien dire.
 *
 * Renvoie `null` sur toute anomalie (signature fausse, jeton expiré, forme
 * inattendue) : on ne refuse jamais la requête ici, ce n'est pas le rôle du
 * comptage. Ce sont les gardes d'authentification qui décident, plus loin.
 */
export function identiteDepuisJwt(
	authorization: string | undefined,
	verifier: (token: string) => unknown
): number | null {
	if (!authorization?.startsWith('Bearer ')) return null;
	const token = authorization.slice(7).trim();
	if (!token) return null;
	try {
		const payload = verifier(token) as { user_id_42?: unknown } | null;
		const id = payload?.user_id_42;
		return typeof id === 'number' && Number.isFinite(id) ? id : null;
	} catch {
		return null;
	}
}

/**
 * La clé, préfixée par sa nature.
 *
 * Le préfixe évite qu'un identifiant numérique et une adresse IP ne se confondent
 * dans le même espace de noms.
 */
export function cleRateLimit(
	entree: EntreeCle,
	verifier: (token: string) => unknown,
	sessionEstValide: (token: string) => boolean
): string {
	const id = identiteDepuisJwt(entree.authorization, verifier);
	if (id !== null) return `user:${id}`;

	// Session admin owner — VALIDÉE avant de servir de clé, exactement comme le JWT.
	//
	// `x-admin-session` est un en-tête que le client choisit. L'accepter tel quel
	// donnait une clé neuve à chaque requête : le quota devenait contournable en
	// changeant la valeur à chaque appel (mesuré : 1569 req/s contre 1,67/s
	// nominal), l'anti-bruteforce du token console tombait avec, et l'espace de
	// clés illimité évinçait les compteurs des autres du cache LRU — un attaquant
	// bloqué se débloquait lui-même en inondant.
	//
	// Validée, la session est une vraie identité et l'espace des clés redevient
	// borné : adresses IP, utilisateurs signés, sessions réellement ouvertes.
	const session = entree.adminSession;
	if (typeof session === 'string' && session.length > 0 && sessionEstValide(session)) {
		// Haché : la clé indexe une table en mémoire, inutile d'y laisser le jeton.
		return `owner:${crypto.createHash('sha256').update(session).digest('hex').slice(0, 16)}`;
	}

	// Dernier recours. `x-real-ip` est posé par nginx à partir de la vraie adresse
	// client ; `request.ip` prend le relais quand l'en-tête est absent.
	const brute = entree.xRealIp;
	return `ip:${typeof brute === 'string' && brute.length > 0 ? brute : entree.ip}`;
}
