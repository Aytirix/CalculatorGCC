import '@fastify/jwt';
import type { AdminSession } from '../services/adminAuth.service.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      api_token: string;
      refresh_token?: string;
      token_expires_at?: number;
      user_id_42: number;
      login: string;
      email: string;
      image_url?: string;
      first_name?: string;
      last_name?: string;
    };
    user: {
      api_token: string;
      refresh_token?: string;
      token_expires_at?: number;
      user_id_42: number;
      login: string;
      email: string;
      image_url?: string;
      first_name?: string;
      last_name?: string;
    };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Session admin owner (auth autonome), posée par requireOwner. */
    adminSession?: AdminSession;
  }
}
