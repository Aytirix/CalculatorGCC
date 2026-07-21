import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import * as crypto from 'crypto';
import { config } from '../config/config.js';
import {
  listCredentials,
  getCredentialByCredentialId,
  addCredential,
  updateCredentialCounter,
} from '../db/adminRepository.js';

// Passkeys (WebAuthn) de l'owner. Le challenge de chaque cérémonie est gardé en
// mémoire entre les 2 requêtes (options → verify), identifié par un flowId opaque.

const RP_NAME = 'Calculator GCC';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

// RP ID = hostname du domaine servi ; origin = URL complète. WebAuthn exige un
// contexte sécurisé (HTTPS, localhost toléré en dev). Dérivés d'APP_DOMAIN, comme
// le redirect OAuth 42 → cohérence garantie avec l'origine réelle du navigateur.
function getRp(): { origin: string; rpID: string } {
  const origin = config.frontendUrl;
  const rpID = new URL(origin).hostname;
  return { origin, rpID };
}

function parseTransports(csv: string | null | undefined): AuthenticatorTransportFuture[] | undefined {
  if (!csv) return undefined;
  return csv.split(',').filter(Boolean) as AuthenticatorTransportFuture[];
}

interface Pending { challenge: string; expiresAt: number; }
const regChallenges = new Map<string, Pending>();
const authChallenges = new Map<string, Pending>();

function purge(map: Map<string, Pending>, now: number): void {
  for (const [k, v] of map) if (v.expiresAt <= now) map.delete(k);
}
function newFlowId(): string {
  return crypto.randomBytes(16).toString('hex');
}

// ===== Enrôlement d'une passkey (owner déjà authentifié via requireOwner) =====

export async function startRegistration() {
  const { rpID } = getRp();
  const existing = await listCredentials();
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: 'owner',
    userDisplayName: 'Administrateur',
    attestationType: 'none',
    // Empêche de ré-enrôler un authenticator déjà présent.
    excludeCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: parseTransports(c.transports),
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      // Panneau qui pilote les secrets OAuth : on exige une vérification de
      // l'utilisateur (PIN / biométrie). Sans elle, la passkey ne prouverait que la
      // POSSESSION de l'authenticator — un appareil déverrouillé suffirait.
      userVerification: 'required',
    },
  });
  const now = Date.now();
  purge(regChallenges, now);
  const flowId = newFlowId();
  regChallenges.set(flowId, { challenge: options.challenge, expiresAt: now + CHALLENGE_TTL_MS });
  return { flowId, options };
}

export async function finishRegistration(
  flowId: string,
  response: RegistrationResponseJSON,
  label?: string,
): Promise<{ credentialId: string }> {
  const pending = regChallenges.get(flowId);
  regChallenges.delete(flowId); // usage unique
  if (!pending || pending.expiresAt <= Date.now()) {
    throw new Error('Challenge expiré ou introuvable');
  }

  const { origin, rpID } = getRp();
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    // Exigée côté serveur AUSSI : demander l'UV dans les options ne garantit rien
    // si on ne vérifie pas le flag renvoyé par l'authenticator.
    requireUserVerification: true,
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Vérification WebAuthn échouée');
  }

  const cred = verification.registrationInfo.credential;
  await addCredential({
    credentialId: cred.id,
    publicKey: Buffer.from(cred.publicKey).toString('base64url'),
    counter: cred.counter,
    transports: response.response.transports?.join(',') ?? null,
    label: label && label.trim() ? label.trim().slice(0, 128) : null,
  });
  return { credentialId: cred.id };
}

// ===== Authentification par passkey (public) =====

export async function startAuthentication() {
  const { rpID } = getRp();
  const existing = await listCredentials();
  const options = await generateAuthenticationOptions({
    rpID,
    // Cohérent avec l'enrôlement : PIN / biométrie exigés à chaque connexion admin.
    userVerification: 'required',
    allowCredentials: existing.map((c) => ({
      id: c.credentialId,
      transports: parseTransports(c.transports),
    })),
  });
  const now = Date.now();
  purge(authChallenges, now);
  const flowId = newFlowId();
  authChallenges.set(flowId, { challenge: options.challenge, expiresAt: now + CHALLENGE_TTL_MS });
  return { flowId, options };
}

export async function finishAuthentication(
  flowId: string,
  response: AuthenticationResponseJSON,
): Promise<{ credentialId: string }> {
  const pending = authChallenges.get(flowId);
  authChallenges.delete(flowId); // usage unique
  if (!pending || pending.expiresAt <= Date.now()) {
    throw new Error('Challenge expiré ou introuvable');
  }

  const stored = await getCredentialByCredentialId(response.id);
  if (!stored) throw new Error('Passkey inconnue');

  const { origin, rpID } = getRp();
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    // Le flag UV renvoyé par l'authenticator est réellement contrôlé (cf. enrôlement).
    requireUserVerification: true,
    credential: {
      id: stored.credentialId,
      publicKey: Buffer.from(stored.publicKey, 'base64url'),
      counter: stored.counter,
      transports: parseTransports(stored.transports),
    },
  });
  if (!verification.verified) {
    throw new Error('Authentification WebAuthn échouée');
  }

  // Anti-rejeu : on persiste le compteur renvoyé par l'authenticator.
  await updateCredentialCounter(stored.credentialId, verification.authenticationInfo.newCounter);
  return { credentialId: stored.credentialId };
}
