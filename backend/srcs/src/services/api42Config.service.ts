import {
  saveConfiguration,
  setNextClientSecret42,
  isConfigured,
  getAdminConfigStatus,
} from '../db/configRepository.js';
import { validateApi42Credentials } from '../utils/validateApi42Credentials.js';

export interface ApplyApi42Result {
  ok: boolean;
  status: number;
  error?: string;
  validationFailed?: boolean;
}

export interface Api42ConfigState {
  configured: boolean;
  client_id: string | null;
  current_secret_set: boolean;
  next_secret_set: boolean;
  credentials_invalid: boolean;
  credentials_invalid_since: Date | null;
}

/**
 * État des credentials 42 pour les écrans d'administration — SANS jamais renvoyer les
 * secrets eux-mêmes. Partagé par le panneau owner (/admin/config) et par la page de
 * reconfiguration des délégués (/setup/admin/config) : les deux doivent préremplir le
 * Client ID courant, sinon l'admin doit le retaper de mémoire pour changer un secret.
 * Le client_id est l'identifiant PUBLIC de l'application OAuth, mais il reste derrière
 * une authentification : aucune raison de le publier à un visiteur anonyme.
 */
export async function getApi42ConfigState(): Promise<Api42ConfigState> {
  const configured = await isConfigured();
  const status = await getAdminConfigStatus();
  return {
    configured,
    client_id: process.env.CLIENT_ID_42 || null,
    current_secret_set: configured,
    next_secret_set: !status.nextSecretMissing,
    credentials_invalid: status.credentialsInvalidSince !== null,
    credentials_invalid_since: status.credentialsInvalidSince,
  };
}

/**
 * Cœur commun de la configuration des credentials 42, partagé par la voie setup
 * (bootstrap) et la voie admin (panel) : valide le secret COURANT auprès de 42, le
 * sauvegarde (chiffré), puis enregistre le « Next Secret 42 » S'IL est fourni (un
 * champ vide ne purge jamais un Next déjà en place). Le Next n'est PAS validé : il
 * n'est pas encore actif côté intra (le valider renverrait invalid_client).
 */
export async function applyApi42Configuration(input: {
  clientId: string;
  clientSecret: string;
  clientSecret42Next?: string;
}): Promise<ApplyApi42Result> {
  const validation = await validateApi42Credentials(input.clientId, input.clientSecret);
  if (!validation.valid) {
    // 42 injoignable ≠ credentials refusés : on renvoie 503 (réessayable) plutôt
    // qu'un 400 « invalides » qui ferait croire à l'admin que ses secrets sont faux
    // alors que c'est l'intra qui est en panne.
    return {
      ok: false,
      status: validation.unreachable ? 503 : 400,
      error: validation.error || 'Credentials invalides ou sans accès à l\'API 42',
      validationFailed: !validation.unreachable,
    };
  }

  try {
    await saveConfiguration(input.clientId, input.clientSecret);
    const next = input.clientSecret42Next?.trim();
    if (next) {
      await setNextClientSecret42(next);
    }
    return { ok: true, status: 200 };
  } catch {
    return { ok: false, status: 500, error: 'Erreur lors de la sauvegarde de la configuration' };
  }
}
