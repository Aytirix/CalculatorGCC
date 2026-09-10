import { prisma } from './connection.js';
import {
  parsePermissions,
  serializePermissions,
  type AdminPermission,
} from '../services/adminPermissions.js';

// Accès DB aux tables d'administration. Aucune donnée n'est chiffrée ici : un
// login de délégué, ses permissions et le journal ne sont pas des secrets.

// ===== Délégués (AdminDelegate) : logins 42 et zones du panneau qui leur sont ouvertes =====

export async function listDelegates() {
  return prisma.adminDelegate.findMany({ orderBy: { createdAt: 'asc' } });
}

/**
 * Les permissions d'un délégué, ou `null` s'il n'en est pas un.
 *
 * `null` et `[]` disent deux choses différentes et le middleware s'en sert :
 * inconnu (401) contre connu mais sans droit sur cette zone (403).
 */
export async function getDelegatePermissions(login42: string): Promise<AdminPermission[] | null> {
  const row = await prisma.adminDelegate.findUnique({ where: { login42 } });
  if (!row) return null;
  return parsePermissions(row.permissions);
}

/**
 * Crée un délégué, ou met à jour ses zones.
 *
 * `permissions` à `undefined` signifie « ne touche pas aux zones » — à distinguer
 * d'un tableau vide, qui veut dire « retire-lui tout ». Sans cette nuance, un
 * appelant qui omet le champ effaçait les droits en silence : c'est exactement ce
 * qu'envoie un bundle resté en cache d'avant le déploiement (`{login}` seul), donc
 * au pire moment, juste après une mise en production.
 */
export async function addDelegate(login42: string, permissions?: readonly string[]) {
  const csv = permissions === undefined ? undefined : serializePermissions(permissions);
  return prisma.adminDelegate.upsert({
    where: { login42 },
    // `{}` laisse la ligne intacte : Prisma n'écrit que les champs présents.
    update: csv === undefined ? {} : { permissions: csv },
    // À la création, pas de zones demandées = aucun accès. Le compte est listé
    // dans le panneau, mais ne peut rien faire tant qu'on ne lui coche rien.
    create: { login42, permissions: csv ?? '' },
  });
}

export async function removeDelegate(login42: string): Promise<void> {
  await prisma.adminDelegate.deleteMany({ where: { login42 } });
}

// ===== Journal d'audit (AdminAuditEvent) =====

export async function logAdminEvent(actor: string, action: string, detail?: string): Promise<void> {
  try {
    await prisma.adminAuditEvent.create({
      // `actor` vaut `console` ou `delegate:<login>` : court, mais on tronque
      // quand même plutôt que de perdre l'événement en silence (l'insert
      // échouerait et le catch ci-dessous l'avalerait).
      data: {
        actor: actor.slice(0, 128),
        action: action.slice(0, 64),
        detail: detail ?? null,
      },
    });
  } catch {
    // L'audit ne doit jamais faire échouer l'action métier sous-jacente.
  }
}

export async function listAuditEvents(limit = 100) {
  return prisma.adminAuditEvent.findMany({
    orderBy: { at: 'desc' },
    take: limit,
  });
}
