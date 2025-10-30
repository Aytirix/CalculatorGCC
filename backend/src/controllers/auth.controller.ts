import { FastifyReply, FastifyRequest } from 'fastify';
import axios from 'axios';
import { config } from '../config/config.js';

export class AuthController {
  /**
   * Redirige vers la page d'authentification 42
   */
  static initiateOAuth(reply: FastifyReply) {
    const authUrl = new URL(config.oauth42.authUrl);
    authUrl.searchParams.append('client_id', config.oauth42.clientId);
    authUrl.searchParams.append('redirect_uri', config.oauth42.redirectUri);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'public');

    return reply.redirect(authUrl.toString());
  }

  /**
   * Callback OAuth 42 - échange le code contre un token et crée un JWT
   */
  static async handleCallback(request: any, reply: FastifyReply) {
    const { code } = request.query as { code?: string };

    if (!code) {
      return reply.code(400).send({ error: 'Missing authorization code' });
    }

    try {
      // Échanger le code contre un access token
      const tokenResponse = await axios.post(config.oauth42.tokenUrl, {
        grant_type: 'authorization_code',
        client_id: config.oauth42.clientId,
        client_secret: config.oauth42.clientSecret,
        code,
        redirect_uri: config.oauth42.redirectUri,
      });

      const { access_token, expires_in, refresh_token } = tokenResponse.data;

      // Récupérer les informations utilisateur
      const userResponse = await axios.get(`${config.oauth42.apiUrl}/me`, {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      const userData = userResponse.data;

      // Générer un JWT contenant le token de l'API 42 et les infos utilisateur
      const payload = {
        api_token: access_token,
        refresh_token: refresh_token,
        token_expires_at: expires_in ? Date.now() + expires_in * 1000 : null,
        user_id_42: userData.id,
        login: userData.login,
        email: userData.email,
        image_url: userData.image?.link || userData.image?.versions?.medium,
      };
      
      console.log('[Auth Controller] Generating JWT with payload:', {
        user_id_42: payload.user_id_42,
        login: payload.login,
        email: payload.email,
      });
      
      const token = request.server.jwt.sign(payload);
      console.log('[Auth Controller] JWT generated, length:', token.length);
      console.log('[Auth Controller] JWT preview:', token.substring(0, 50) + '...');

      // Rediriger vers le frontend avec le token JWT
      const redirectUrl = new URL(`${config.frontendUrl}/callback`);
      redirectUrl.searchParams.append('token', token);

      console.log('[Auth Controller] Redirecting to:', redirectUrl.toString().substring(0, 100) + '...');
      return reply.redirect(redirectUrl.toString());
    } catch (error: any) {
      console.error('OAuth error:', error.response?.data || error.message);
      
      const errorUrl = new URL(config.frontendUrl);
      errorUrl.searchParams.append('error', 'authentication_failed');
      
      return reply.redirect(errorUrl.toString());
    }
  }

  /**
   * Récupère les informations de l'utilisateur connecté depuis le JWT
   */
  static async getMe(request: FastifyRequest) {
    console.log('[Auth Controller] getMe called');
    const user = request.user;
    console.log('[Auth Controller] User from JWT:', user);

    return {
      user_id_42: user.user_id_42,
      login: user.login,
      email: user.email,
      image_url: user.image_url,
      api_token: user.api_token,
    };
  }

  /**
   * Déconnexion (côté client, suppression du token)
   */
  static async logout() {
    return { message: 'Logged out successfully' };
  }
}
