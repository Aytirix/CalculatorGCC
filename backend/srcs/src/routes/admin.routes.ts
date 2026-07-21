import { FastifyInstance } from 'fastify';
import { adminController } from '../controllers/admin.controller.js';
import { requireOwner } from '../middlewares/auth.middleware.js';

export async function adminRoutes(server: FastifyInstance) {
  // Statut public minimal : le front sait quoi proposer sur le bouton « Admin ».
  server.get('/admin/status', async (request, reply) => {
    return adminController.getStatus(request, reply);
  });

  // Bootstrap / recovery par token console → session owner. Rate-limit STRICT
  // (anti-bruteforce, en plus des 256 bits du token).
  server.post('/admin/session/console', {
    config: { rateLimit: { max: 5, timeWindow: 60_000 } },
  }, async (request, reply) => {
    return adminController.loginWithConsoleToken(request, reply);
  });

  // Déconnexion (révoque la session owner courante).
  server.post('/admin/logout', {
    preHandler: [requireOwner],
  }, async (request, reply) => {
    return adminController.logout(request, reply);
  });

  // ===== WebAuthn (passkeys) =====

  // Enrôlement : réservé à un owner déjà authentifié (bootstrap via token console,
  // ou ajout d'une passkey supplémentaire depuis une session owner existante).
  server.post('/admin/webauthn/register/options', {
    preHandler: [requireOwner],
  }, async (request, reply) => {
    return adminController.webauthnRegisterOptions(request, reply);
  });
  server.post('/admin/webauthn/register/verify', {
    preHandler: [requireOwner],
  }, async (request, reply) => {
    return adminController.webauthnRegisterVerify(request, reply);
  });

  // Authentification par passkey (public) → session owner. Rate-limit anti-abus.
  server.post('/admin/webauthn/auth/options', {
    config: { rateLimit: { max: 10, timeWindow: 60_000 } },
  }, async (request, reply) => {
    return adminController.webauthnAuthOptions(request, reply);
  });
  server.post('/admin/webauthn/auth/verify', {
    config: { rateLimit: { max: 10, timeWindow: 60_000 } },
  }, async (request, reply) => {
    return adminController.webauthnAuthVerify(request, reply);
  });

  // ===== Secrets 42 (courant + next) =====
  // Owner uniquement : les admins délégués passent par /setup/admin/configure
  // (JWT 42 + requireDelegate), pas par ce panneau.
  server.get('/admin/config', {
    preHandler: [requireOwner],
  }, async (request, reply) => {
    return adminController.getConfig(request, reply);
  });
  server.put('/admin/config/secrets', {
    preHandler: [requireOwner],
  }, async (request, reply) => {
    return adminController.updateSecrets(request, reply);
  });

  // ===== Gestion des passkeys (owner uniquement) =====
  server.get('/admin/credentials', {
    preHandler: [requireOwner],
  }, async (request, reply) => {
    return adminController.listPasskeys(request, reply);
  });
  server.delete('/admin/credentials/:id', {
    preHandler: [requireOwner],
  }, async (request, reply) => {
    return adminController.deletePasskey(request, reply);
  });

  // ===== Gestion des délégués (owner uniquement) =====
  server.get('/admin/delegates', {
    preHandler: [requireOwner],
  }, async (request, reply) => {
    return adminController.listDelegatesHandler(request, reply);
  });
  server.post('/admin/delegates', {
    preHandler: [requireOwner],
  }, async (request, reply) => {
    return adminController.addDelegateHandler(request, reply);
  });
  server.delete('/admin/delegates/:login', {
    preHandler: [requireOwner],
  }, async (request, reply) => {
    return adminController.removeDelegateHandler(request, reply);
  });

  // ===== Journal d'audit (owner uniquement) =====
  server.get('/admin/audit', {
    preHandler: [requireOwner],
  }, async (request, reply) => {
    return adminController.getAudit(request, reply);
  });
}
