// Script de test pour vérifier que le JWT fonctionne
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import dotenv from 'dotenv';

dotenv.config();

const fastify = Fastify({ logger: true });

// Enregistrer le plugin JWT avec le secret
await fastify.register(jwt, {
  secret: process.env.JWT_SECRET || 'your-secret-key',
  sign: {
    expiresIn: '7d',
  },
});

// Test de génération et vérification
const testPayload = {
  api_token: 'test_token_123',
  user_id_42: 12345,
  login: 'test_user',
  email: 'test@42.fr',
};

console.log('\n=== Test JWT ===\n');
console.log('1. Secret JWT:', process.env.JWT_SECRET ? '✓ Configuré' : '✗ Manquant');
console.log('2. Payload de test:', testPayload);

try {
  // Générer un token
  const token = fastify.jwt.sign(testPayload);
  console.log('\n3. Token généré:', token.substring(0, 50) + '...');
  console.log('   Longueur:', token.length);
  
  // Vérifier le token
  const decoded = fastify.jwt.verify(token);
  console.log('\n4. Token décodé:', decoded);
  
  console.log('\n✅ JWT fonctionne correctement!\n');
} catch (error) {
  console.error('\n❌ Erreur JWT:', error.message);
  console.error('\nVérifiez que JWT_SECRET est défini dans .env\n');
}

process.exit(0);
