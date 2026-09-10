import { FastifyInstance } from 'fastify';
import { adminController } from '../controllers/admin.controller.js';
import { requireOwner, requirePermission, attachAdminActor } from '../middlewares/auth.middleware.js';

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

  // Qui suis-je, et quelles zones me sont ouvertes ? Sans garde : la réponse
  // dépend de l'identité présentée, et vaut « personne » quand il n'y en a pas.
  // Le panneau s'en sert pour n'afficher que ce qui est utilisable.
  server.get('/admin/me', {
    preHandler: [attachAdminActor],
  }, async (request, reply) => {
    return adminController.getMe(request, reply);
  });

  // ===== Secrets 42 (courant + next) =====
  // Owner, ou délégué portant la permission `secrets42`. Seule voie désormais :
  // /setup/admin/configure a été retirée, elle exigeait une session 42 valide pour
  // réparer la connexion 42 et ne pouvait donc jamais servir quand la clé était morte.
  server.get('/admin/config', {
    preHandler: [requirePermission('secrets42')],
  }, async (request, reply) => {
    return adminController.getConfig(request, reply);
  });
  server.put('/admin/config/secrets', {
    preHandler: [requirePermission('secrets42')],
  }, async (request, reply) => {
    return adminController.updateSecrets(request, reply);
  });

  // ===== Gestion des délégués (permission `delegates`) =====
  // Zone la plus sensible : qui la détient distribue les droits. Le contrôleur
  // interdit à un délégué de se modifier lui-même ou d'accorder plus qu'il n'a.
  server.get('/admin/delegates', {
    preHandler: [requirePermission('delegates')],
  }, async (request, reply) => {
    return adminController.listDelegatesHandler(request, reply);
  });
  server.post('/admin/delegates', {
    preHandler: [requirePermission('delegates')],
  }, async (request, reply) => {
    return adminController.addDelegateHandler(request, reply);
  });
  server.delete('/admin/delegates/:login', {
    preHandler: [requirePermission('delegates')],
  }, async (request, reply) => {
    return adminController.removeDelegateHandler(request, reply);
  });

  // ===== Origines autorisées (permission `origins`) =====
  // Déploiements miroir : une autre instance sert le frontend et proxifie /api
  // vers ce backend, sans jamais toucher à la base.
  server.get('/admin/origins', {
    preHandler: [requirePermission('origins')],
  }, async (request, reply) => {
    return adminController.listOriginsHandler(request, reply);
  });
  server.post('/admin/origins', {
    preHandler: [requirePermission('origins')],
  }, async (request, reply) => {
    return adminController.addOriginHandler(request, reply);
  });
  server.delete('/admin/origins', {
    preHandler: [requirePermission('origins')],
  }, async (request, reply) => {
    return adminController.removeOriginHandler(request, reply);
  });

  // ===== Mode miroir (permission `mirror`) =====
  server.get('/admin/mirror', {
    preHandler: [requirePermission('mirror')],
  }, async (request, reply) => {
    return adminController.getMirrorHandler(request, reply);
  });
  server.put('/admin/mirror', {
    preHandler: [requirePermission('mirror')],
  }, async (request, reply) => {
    return adminController.setMirrorHandler(request, reply);
  });

  // ===== Journal d'audit (permission `audit`) =====
  server.get('/admin/audit', {
    preHandler: [requirePermission('audit')],
  }, async (request, reply) => {
    return adminController.getAudit(request, reply);
  });

  // ===== Refresh global des données 42 (permission `refresh`) =====
  // État : en cours ? dernière exécution ? fraîcheur du cache partagé ?
  server.get('/admin/global-refresh', {
    preHandler: [requirePermission('refresh')],
  }, async (request, reply) => {
    return adminController.getGlobalRefresh(request, reply);
  });

  // Déclenchement. Rate-limit volontairement bas : l'opération est lourde et
  // ne doit pas pouvoir être relancée en rafale.
  server.post('/admin/global-refresh', {
    preHandler: [requirePermission('refresh')],
    config: { rateLimit: { max: 3, timeWindow: 60_000 } },
  }, async (request, reply) => {
    return adminController.startGlobalRefresh(request, reply);
  });

  // ===== Référentiel RNCP vs GCC (permission `referential`) =====
  // Chaque comparaison déclenche 5 appels à GCC et, au premier passage, 2 à 3 à
  // l'API 42 pour le catalogue : rate-limit bas, comme le refresh global.
  server.post('/admin/gcc-referential', {
    preHandler: [requirePermission('referential')],
    config: { rateLimit: { max: 5, timeWindow: 60_000 } },
  }, async (request, reply) => {
    return adminController.compareGccReferential(request, reply);
  });

  // ===== Référentiel RNCP en base (permission `referential`) =====
  // Modifier le référentiel change ce que valide le RNCP pour TOUS les
  // utilisateurs d'un coup : version courante, historique et retour arrière
  // sont donc au même endroit que l'application des modifications.
  server.get('/admin/referential', {
    preHandler: [requirePermission('referential')],
  }, async (request, reply) => {
    return adminController.getReferentialState(request, reply);
  });

  server.post('/admin/referential/apply', {
    preHandler: [requirePermission('referential')],
    config: { rateLimit: { max: 20, timeWindow: 60_000 } },
  }, async (request, reply) => {
    return adminController.applyReferential(request, reply);
  });

  server.post('/admin/referential/revert', {
    preHandler: [requirePermission('referential')],
    config: { rateLimit: { max: 10, timeWindow: 60_000 } },
  }, async (request, reply) => {
    return adminController.revertReferential(request, reply);
  });

  server.get('/admin/referential/export', {
    preHandler: [requirePermission('referential')],
  }, async (request, reply) => {
    return adminController.exportReferential(request, reply);
  });
}
