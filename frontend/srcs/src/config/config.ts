// Environment configuration
export const config = {
	backendUrl: '/api',

	// URL de base de l'application (pour les redirections, etc.)
	appUrl: import.meta.env.VITE_APP_DOMAIN || 'http://localhost:3000',

	// Port local expose sur le serveur pour le setup localhost-only
	localSetupPort: import.meta.env.VITE_LOCAL_SETUP_PORT || '3000',

	// API 42 URL
	api42Url: 'https://api.intra.42.fr',
};
