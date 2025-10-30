import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '7000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5180',
  
  oauth42: {
    clientId: process.env.CLIENT_ID_42!,
    clientSecret: process.env.CLIENT_SECRET_42!,
    redirectUri: process.env.REDIRECT_URI!,
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
    'REDIRECT_URI',
    'JWT_SECRET',
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

validateConfig();
