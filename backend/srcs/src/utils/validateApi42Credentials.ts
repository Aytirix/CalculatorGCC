import axios from 'axios';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  created_at: number;
}

// Sans timeout, une API 42 qui « pend » fige la requête de configuration jusqu'au
// timeout TCP par défaut (plusieurs minutes) : le panneau admin reste bloqué au
// moment précis où l'on essaie de réparer. 10 s suffisent largement à /oauth/token.
const VALIDATION_TIMEOUT_MS = 10_000;

/**
 * Valide les credentials API 42 en testant l'authentification (client_credentials)
 * puis une requête réelle vers /v2/campus/41.
 *
 * Distingue deux échecs très différents :
 *  - `valid: false` seul            → 42 a répondu et REFUSE les credentials ;
 *  - `valid: false, unreachable`    → 42 est injoignable/en panne : on ne peut pas
 *    conclure. L'appelant doit le traiter comme « réessayez », pas comme
 *    « credentials invalides » (sinon une panne de 42 bloque le recovery).
 */
export async function validateApi42Credentials(
  clientId: string,
  clientSecret: string
): Promise<{ valid: boolean; error?: string; unreachable?: boolean }> {
  try {
    console.log('🔍 Validation des credentials API 42...');

    // Étape 1: Obtenir un access token
    const tokenResponse = await axios.post<TokenResponse>(
      'https://api.intra.42.fr/oauth/token',
      {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      },
      { timeout: VALIDATION_TIMEOUT_MS }
    );

    if (!tokenResponse.data.access_token) {
      console.log('❌ Échec: Pas de token reçu');
      return {
        valid: false,
        error: 'Failed to obtain access token from 42 API'
      };
    }

    console.log('✅ Token obtenu avec succès');

    // Étape 2: Tester le token avec une requête vers /v2/campus/41
    const testResponse = await axios.get(
      'https://api.intra.42.fr/v2/campus/41',
      {
        headers: {
          Authorization: `Bearer ${tokenResponse.data.access_token}`,
        },
        timeout: VALIDATION_TIMEOUT_MS,
      }
    );

    // Si on reçoit un statut 200 et des données, les credentials sont valides
    if (testResponse.status === 200 && testResponse.data) {
      console.log('✅ Credentials validés: accès API 42 fonctionnel');
      console.log(`   Campus testé: ${testResponse.data.name || 'Campus 41'}`);
      return { valid: true };
    }

    console.log('❌ Échec: Réponse API inattendue');
    return {
      valid: false,
      error: 'Unexpected response from 42 API'
    };

  } catch (error: any) {
    console.log('❌ Erreur lors de la validation:', error.message);

    // 42 a répondu et refuse : le secret est réellement en cause.
    if (error.response?.status === 401) {
      return {
        valid: false,
        error: 'Invalid credentials: Client ID or Client Secret is incorrect'
      };
    }

    if (error.response?.status === 403) {
      return {
        valid: false,
        error: 'Access forbidden: Check your application permissions'
      };
    }

    // Tout le reste (réseau, délai dépassé, 5xx de l'intra) : on NE PEUT PAS conclure.
    // Le signaler comme « injoignable » évite d'accuser à tort les credentials et de
    // bloquer leur mise à jour pendant une panne de 42.
    return {
      valid: false,
      unreachable: true,
      error: `API 42 injoignable (${error.code || error.response?.status || 'réseau'}) — réessayez dans un moment.`,
    };
  }
}
