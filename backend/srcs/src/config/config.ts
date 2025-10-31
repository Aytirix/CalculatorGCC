import dotenv from 'dotenv';

dotenv.config();

// Helper pour construire les URLs avec le bon protocole
const buildUrl = (hostname: string, port: number, useSSL: boolean): string => {
  const protocol = useSSL ? 'https' : 'http';
  return `${protocol}://${hostname}:${port}`;
};

// Récupérer les valeurs de l'environnement
const hostname = process.env.HOSTNAME || 'localhost';
const enableSSL = process.env.ENABLE_SSL === 'true';

export const config = {
  port: parseInt(process.env.PORT || '7000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  hostname,
  enableSSL,
  // Construction automatique de l'URL frontend
  frontendUrl: buildUrl(hostname, 3000, enableSSL),

  oauth42: {
    clientId: process.env.CLIENT_ID_42!,
    clientSecret: process.env.CLIENT_SECRET_42!,
    // Construction automatique de l'URI de redirection si non fournie
    redirectUri: `${buildUrl(hostname, 3000, enableSSL)}/api/auth/callback`,
    authUrl: 'https://api.intra.42.fr/oauth/authorize',
    tokenUrl: 'https://api.intra.42.fr/oauth/token',
    apiUrl: 'https://api.intra.42.fr/v2',
  },
  
  jwt: {
    secret: process.env.JWT_SECRET!,
    expiresIn: '7d',
  },
  
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_TIMEWINDOW || '60000', 10),
  },
};

// Validate required environment variables
function validateConfig() {
  const required = [
    'CLIENT_ID_42',
    'CLIENT_SECRET_42',
    'JWT_SECRET',
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // Log des URLs construites pour debug
  console.log('🔧 Configuration:');
  console.log(`   Frontend URL: ${config.frontendUrl}`);
  console.log(`   Redirect URI: ${config.oauth42.redirectUri}`);
  console.log(`   SSL: ${config.enableSSL ? 'enabled' : 'disabled'}`);
}

validateConfig();
