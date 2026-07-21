import * as crypto from 'crypto';

// Authentification admin autonome : token console (bootstrap/recovery) + sessions
// owner opaques en mémoire. Tout est volontairement NON persisté : un redémarrage
// régénère le token console (recovery toujours possible via les logs) et invalide
// les sessions (ré-authentification forcée, sain pour un panel sensible).

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

// ===== Token console (bootstrap + recovery) =====
// Généré à CHAQUE démarrage, affiché une fois dans les logs. Prouve l'accès au
// serveur (lire les logs = contrôler la machine) → seule racine de confiance pour
// créer la première passkey ou récupérer l'accès si toutes les méthodes sont perdues.
let consoleTokenHash: string | null = null;

/** Génère et mémorise un nouveau token console ; renvoyé EN CLAIR (à logger une seule fois). */
export function initConsoleToken(): string {
  const token = crypto.randomBytes(32).toString('hex');
  consoleTokenHash = sha256(token);
  return token;
}

/** Vérifie un token console fourni (comparaison à temps constant). */
export function verifyConsoleToken(token: unknown): boolean {
  if (!consoleTokenHash || typeof token !== 'string' || token.length === 0) return false;
  const a = Buffer.from(sha256(token), 'hex');
  const b = Buffer.from(consoleTokenHash, 'hex');
  // Longueurs égales par construction (sha256), mais on garde la garde par sûreté.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ===== Sessions admin owner (opaques, en mémoire, révocables) =====

export interface AdminSession {
  subject: string;   // 'console' | 'owner:<credentialId>'
  role: 'owner';
  createdAt: number;
  expiresAt: number;
}

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 heure
const sessions = new Map<string, AdminSession>(); // clé = sha256(token opaque)

function purgeExpired(now: number): void {
  for (const [key, s] of sessions) {
    if (s.expiresAt <= now) sessions.delete(key);
  }
}

/** Ouvre une session owner ; renvoie le token opaque EN CLAIR + son expiration (ms epoch). */
export function createOwnerSession(subject: string): { token: string; expiresAt: number } {
  const now = Date.now();
  purgeExpired(now);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = now + SESSION_TTL_MS;
  sessions.set(sha256(token), { subject, role: 'owner', createdAt: now, expiresAt });
  return { token, expiresAt };
}

/** Valide un token de session opaque. Renvoie la session (non expirée) ou null. */
export function verifyOwnerSession(token: string | undefined): AdminSession | null {
  if (!token) return null;
  const key = sha256(token);
  const s = sessions.get(key);
  if (!s) return null;
  if (s.expiresAt <= Date.now()) {
    sessions.delete(key);
    return null;
  }
  return s;
}

/** Révoque une session précise (logout). */
export function revokeOwnerSession(token: string | undefined): void {
  if (!token) return;
  sessions.delete(sha256(token));
}

/**
 * Révoque toutes les sessions owner SAUF celle du token fourni. Appelé quand une
 * passkey est retirée : sans ça, retirer un authenticator compromis n'invalidait
 * rien et l'attaquant gardait sa session (et pouvait en ré-enrôler une autre).
 * On épargne la session courante pour ne pas éjecter l'owner qui fait le ménage.
 * Renvoie le nombre de sessions révoquées.
 */
export function revokeOtherOwnerSessions(keepToken: string | undefined): number {
  const keepKey = keepToken ? sha256(keepToken) : null;
  let revoked = 0;
  for (const key of [...sessions.keys()]) {
    if (key !== keepKey) {
      sessions.delete(key);
      revoked++;
    }
  }
  return revoked;
}
