// Environment configuration
export const config = {
  oauth: {
    clientId: import.meta.env.VITE_42_CLIENT_ID || '',
    clientSecret: import.meta.env.VITE_42_CLIENT_SECRET || '',
    redirectUri: import.meta.env.VITE_42_REDIRECT_URI || 'http://localhost:5173/callback',
    authUrl: 'https://api.intra.42.fr/oauth/authorize',
    tokenUrl: 'https://api.intra.42.fr/oauth/token',
    apiUrl: 'https://api.intra.42.fr/v2',
  },
};
