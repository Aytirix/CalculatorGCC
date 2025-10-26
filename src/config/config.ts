// Environment configuration
export const config = {
  // Backend API - Gère l'authentification OAuth 42 et les appels à l'API 42
  backendUrl: import.meta.env.VITE_BACKEND_URL || 'http://localhost:7000',
};
