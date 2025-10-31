// Helper pour construire les URLs avec le bon protocole
const buildUrl = (hostname: string, port: number, useSSL: boolean, path: string = ''): string => {
  const protocol = useSSL ? 'https' : 'http';
  return `${protocol}://${hostname}:${port}${path}`;
};

// Récupérer les valeurs de l'environnement
const hostname = import.meta.env.VITE_HOSTNAME || 'localhost';
const enableSSL = import.meta.env.VITE_ENABLE_SSL === 'true';

// Environment configuration
export const config = {
  hostname,
  enableSSL,
  

  backendUrl: '/api',
  
  
  // URL de base de l'application (pour les redirections, etc.)
  appUrl: buildUrl(hostname, 3000, enableSSL),
  
  // API 42 URL
  api42Url: 'https://api.intra.42.fr',
};
