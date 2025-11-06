import axios from 'axios';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  created_at: number;
}

/**
 * Valide les credentials API 42 en testant l'authentification
 * et en faisant une requête test vers /v2/campus/41
 * 
 * @param clientId - L'ID client de l'application 42
 * @param clientSecret - Le secret client de l'application 42
 * @returns true si les credentials sont valides, false sinon
 */
export async function validateApi42Credentials(
  clientId: string,
  clientSecret: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    console.log('🔍 Validation des credentials API 42...');
    
    // Étape 1: Obtenir un access token
    const tokenResponse = await axios.post<TokenResponse>(
      'https://api.intra.42.fr/oauth/token',
      {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }
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
    
    // Erreurs d'authentification
    if (error.response?.status === 401) {
      return {
        valid: false,
        error: 'Invalid credentials: Client ID or Client Secret is incorrect'
      };
    }

    // Erreurs de permissions
    if (error.response?.status === 403) {
      return {
        valid: false,
        error: 'Access forbidden: Check your application permissions'
      };
    }

    // Erreur réseau ou API indisponible
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return {
        valid: false,
        error: 'Cannot reach 42 API: Network error'
      };
    }

    // Autres erreurs
    return {
      valid: false,
      error: `Validation failed: ${error.message}`
    };
  }
}
