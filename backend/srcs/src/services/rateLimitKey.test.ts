import { describe, it, expect } from 'vitest';
import { cleRateLimit, identiteDepuisJwt, type EntreeCle } from './rateLimitKey.js';

/**
 * Clé de comptage du rate-limit.
 *
 * Deux propriétés à tenir, et la seconde est la plus importante :
 *  1. compter par personne quand on en connaît une — sinon le NAT d'une école fait
 *     partager un quota unique à tout le monde ;
 *  2. n'accepter une identité QUE si la signature du JWT est valide — sinon
 *     l'appelant choisit sa propre clé en éditant trois caractères de base64, et
 *     le quota ne limite plus rien.
 */

/** Vérificateur factice : n'accepte qu'un jeton précis, comme le ferait une signature. */
const verificateur = (valides: Record<string, unknown>) => (token: string) => {
	if (!(token in valides)) throw new Error('signature invalide');
	return valides[token];
};

/** Sessions owner réellement ouvertes côté serveur. */
const sessionOuverte = (ouvertes: string[]) => (token: string) => ouvertes.includes(token);
/** Aucune session ouverte : le cas de loin le plus courant. */
const aucuneSession = () => false;

const base: EntreeCle = { ip: '10.0.0.7' };

describe('identiteDepuisJwt', () => {
	const v = verificateur({ bon: { user_id_42: 42 } });

	it("tire l'identifiant d'un jeton correctement signé", () => {
		expect(identiteDepuisJwt('Bearer bon', v)).toBe(42);
	});

	it('REFUSE un jeton dont la signature ne passe pas', () => {
		// Le cas qui compte : un payload forgé ne doit jamais devenir une clé.
		expect(identiteDepuisJwt('Bearer forge', v)).toBeNull();
	});

	it('refuse un jeton expiré', () => {
		// Un vérificateur réel lève sur l'expiration ; on doit retomber sur l'IP.
		const expire = () => { throw new Error('jwt expired'); };
		expect(identiteDepuisJwt('Bearer perime', expire)).toBeNull();
	});

	it("refuse un en-tête mal formé ou absent", () => {
		for (const entete of [undefined, '', 'bon', 'Bearer', 'Bearer   ', 'Basic bon']) {
			expect(identiteDepuisJwt(entete, v)).toBeNull();
		}
	});

	it("refuse un payload dont l'identifiant n'est pas un nombre exploitable", () => {
		const bizarres = verificateur({
			a: {}, b: null, c: { user_id_42: '42' }, d: { user_id_42: NaN },
			e: { user_id_42: Infinity }, f: { user_id_42: { toString: () => '42' } },
		});
		for (const t of ['a', 'b', 'c', 'd', 'e', 'f']) {
			expect(identiteDepuisJwt(`Bearer ${t}`, bizarres)).toBeNull();
		}
	});

	it('tolère les espaces autour du jeton', () => {
		// Un en-tête recopié à la main en porte facilement. Sans `trim()`, on
		// retomberait sur l'IP au lieu de la clé utilisateur — pas un trou de
		// sécurité, mais un quota partagé sans raison.
		expect(identiteDepuisJwt('Bearer  bon ', v)).toBe(42);
		expect(identiteDepuisJwt('Bearer bon', v)).toBe(42);
	});

	it('ne laisse jamais échapper une exception du vérificateur', () => {
		const explose = () => { throw new Error('boum'); };
		// Le comptage ne doit JAMAIS rejeter une requête : ce n'est pas son rôle,
		// ce sont les gardes d'authentification qui décident.
		expect(() => identiteDepuisJwt('Bearer x', explose)).not.toThrow();
	});
});

describe('cleRateLimit', () => {
	const v = verificateur({ bon: { user_id_42: 1337 } });

	it("compte par personne dès qu'une identité est vérifiée", () => {
		expect(cleRateLimit({ ...base, authorization: 'Bearer bon' }, v, aucuneSession)).toBe('user:1337');
	});

	it("donne la MÊME clé au même utilisateur depuis deux adresses", () => {
		const a = cleRateLimit({ authorization: 'Bearer bon', ip: '1.1.1.1' }, v, aucuneSession);
		const b = cleRateLimit({ authorization: 'Bearer bon', ip: '2.2.2.2' }, v, aucuneSession);
		expect(a).toBe(b);
	});

	it('donne des clés DIFFÉRENTES à deux utilisateurs derrière la même IP', () => {
		// Le cœur du problème : école ou entreprise derrière un NAT.
		const v2 = verificateur({ x: { user_id_42: 1 }, y: { user_id_42: 2 } });
		const nat = { ip: '203.0.113.9', xRealIp: '203.0.113.9' };
		expect(cleRateLimit({ ...nat, authorization: 'Bearer x' }, v2, aucuneSession))
			.not.toBe(cleRateLimit({ ...nat, authorization: 'Bearer y' }, v2, aucuneSession));
	});

	it('retombe sur l’IP quand le jeton est forgé', () => {
		const cle = cleRateLimit({ ...base, authorization: 'Bearer forge' }, v, aucuneSession);
		expect(cle).toBe('ip:10.0.0.7');
	});

	it('préfère X-Real-IP à l’adresse de connexion', () => {
		expect(cleRateLimit({ ip: '172.17.0.1', xRealIp: '203.0.113.5' }, v, aucuneSession)).toBe('ip:203.0.113.5');
		// En-tête vide : on retombe sur l'adresse réelle plutôt que sur une clé vide.
		expect(cleRateLimit({ ip: '172.17.0.1', xRealIp: '' }, v, aucuneSession)).toBe('ip:172.17.0.1');
	});

	it('distingue la session admin owner, sans la stocker en clair', () => {
		const cle = cleRateLimit(
			{ ...base, adminSession: 'jeton-opaque-secret' }, v, sessionOuverte(['jeton-opaque-secret'])
		);
		expect(cle).toMatch(/^owner:[0-9a-f]{16}$/);
		// Le jeton ne doit pas se retrouver dans la clé : elle sert d'index en mémoire.
		expect(cle).not.toContain('jeton-opaque-secret');
	});

	it("l'identité 42 prime sur la session owner", () => {
		const cle = cleRateLimit(
			{ ...base, authorization: 'Bearer bon', adminSession: 'jeton' }, v, sessionOuverte(['jeton'])
		);
		expect(cle).toBe('user:1337');
	});

	it('préfixe toujours la clé par sa nature', () => {
		// Sans préfixe, l'identifiant 42 « 1337 » et une IP « 1337 » se confondraient.
		for (const entree of [
			{ ...base, authorization: 'Bearer bon' },
			{ ...base, adminSession: 'j' },
			base,
		]) {
			expect(cleRateLimit(entree, v, sessionOuverte(['j']))).toMatch(/^(user|owner|ip):/);
		}
	});

	it("REFUSE une session admin que le serveur ne connaît pas", () => {
		// LE défaut trouvé en audit : `x-admin-session` est choisi par le CLIENT.
		// Utilisé sans validation, il donnait une clé neuve à chaque requête —
		// quota contourné (1569 req/s contre 1,67 nominal), anti-bruteforce du
		// token console annulé, et compteurs des autres évincés du cache LRU.
		const cle = cleRateLimit({ ...base, adminSession: 'jeton-invente' }, v, aucuneSession);
		expect(cle).toBe('ip:10.0.0.7');
	});

	it("ne laisse pas fabriquer une clé neuve à chaque requête", () => {
		// Cent valeurs différentes inventées par l'appelant : une seule clé.
		const cles = new Set(
			Array.from({ length: 100 }, (_, i) =>
				cleRateLimit({ ...base, adminSession: `invente-${i}` }, v, aucuneSession)
			)
		);
		expect(cles.size).toBe(1);
		expect([...cles][0]).toBe('ip:10.0.0.7');
	});

	it('ignore une session vide sans la confondre avec une vraie', () => {
		// Sans la garde de longueur, tous les clients envoyant l'en-tête vide
		// auraient partagé le bucket `owner:<sha256("")>`.
		const accepteTout = () => true;
		expect(cleRateLimit({ ...base, adminSession: '' }, v, accepteTout)).toBe('ip:10.0.0.7');
	});

	it('rend toujours une clé non vide, quelle que soit l’entrée', () => {
		expect(cleRateLimit({ ip: '' }, v, aucuneSession)).toBe('ip:');
		expect(cleRateLimit({ ip: '::1' }, v, aucuneSession)).toBe('ip:::1');
	});
});
