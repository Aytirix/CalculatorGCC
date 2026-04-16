// Environment configuration
export const config = {
  backendUrl: '/api',

  // URL de base de l'application (pour les redirections, etc.)
  appUrl: import.meta.env.VITE_APP_DOMAIN || 'http://localhost:3000',

  // API 42 URL
  api42Url: 'https://api.intra.42.fr',
};
