import crypto from 'crypto';

/**
 * Paramètre `state` du flux OAuth 42.
 *
 * Il porte l'origine d'où part la connexion, pour que le retour ramène la
 * personne sur SON site : avec un frontend miroir qui proxifie `/api` vers ce
 * backend, le `redirect_uri` reste forcément celui de l'instance principale,
 * mais la redirection finale, elle, doit revenir au domaine d'origine.
 *
 * Le state est signé (HMAC) et horodaté :
 *  - signé, pour qu'on ne puisse pas y glisser une origine arbitraire (le jeton
 *    de session transite par l'URL de retour — un state falsifiable serait un
 *    vol de session) ;
 *  - horodaté, pour limiter le rejeu, et parce qu'un `state` est aussi la
 *    protection CSRF standard d'OAuth, absente jusqu'ici.
 *
 * On n'utilise volontairement PAS le JWT applicatif : un state signé avec la
 * même clé serait accepté par le middleware d'authentification, avec un
 * `user_id_42` indéfini.
 */

const MAX_AGE_MS = 10 * 60 * 1000;

function signingKey(): Buffer {
	const secret = process.env.JWT_SECRET;
	if (!secret) throw new Error('JWT_SECRET absent : impossible de signer le state OAuth');
	// Clé distincte de celle des JWT et de celle du chiffrement des credentials.
	return crypto.createHash('sha256').update(`${secret}:oauth-state`).digest();
}

function sign(payload: string): string {
	return crypto.createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

/** Construit un `state` portant l'origine de départ. */
export function createOAuthState(origin: string): string {
	const payload = Buffer.from(JSON.stringify({ o: origin, t: Date.now() })).toString('base64url');
	return `${payload}.${sign(payload)}`;
}

/**
 * Relit un `state` et renvoie l'origine qu'il porte, ou `null` s'il est absent,
 * mal signé ou périmé. L'appelant DOIT encore vérifier que cette origine est
 * autorisée : la signature prouve qu'on l'a émise, pas qu'elle l'est toujours.
 */
export function readOAuthState(state: string | undefined): string | null {
	if (!state) return null;
	const [payload, signature] = state.split('.');
	if (!payload || !signature) return null;

	const expected = sign(payload);
	const given = Buffer.from(signature);
	const wanted = Buffer.from(expected);
	if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return null;

	try {
		const { o, t } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
			o?: unknown;
			t?: unknown;
		};
		if (typeof o !== 'string' || typeof t !== 'number') return null;
		if (Date.now() - t > MAX_AGE_MS) return null;
		return o;
	} catch {
		return null;
	}
}
