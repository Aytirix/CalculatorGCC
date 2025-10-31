import '@fastify/jwt';

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
    };
    user: {
      api_token: string;
      refresh_token?: string;
      token_expires_at?: number;
      user_id_42: number;
      login: string;
      email: string;
      image_url?: string;
    };
  }
}
