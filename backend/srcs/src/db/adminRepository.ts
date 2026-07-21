import { prisma } from './connection.js';

// Accès DB aux tables d'authentification admin autonome. Aucune donnée n'est
// chiffrée ici : clé PUBLIQUE WebAuthn, login délégué et journal ne sont pas secrets.

// ===== Passkeys (AdminCredential) =====

export async function countCredentials(): Promise<number> {
  return prisma.adminCredential.count();
}

export async function listCredentials() {
  return prisma.adminCredential.findMany({
    select: {
      id: true,
      credentialId: true,
      label: true,
      transports: true,
      createdAt: true,
      lastUsedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getCredentialByCredentialId(credentialId: string) {
  return prisma.adminCredential.findUnique({ where: { credentialId } });
}

export async function addCredential(data: {
  credentialId: string;
  publicKey: string;
  counter: number;
  transports?: string | null;
  label?: string | null;
}) {
  return prisma.adminCredential.create({ data });
}

export async function updateCredentialCounter(credentialId: string, counter: number): Promise<void> {
  await prisma.adminCredential.update({
    where: { credentialId },
    data: { counter, lastUsedAt: new Date() },
  });
}

export async function deleteCredential(id: number): Promise<void> {
  await prisma.adminCredential.delete({ where: { id } });
}

// ===== Délégués (AdminDelegate) : logins 42 autorisés à éditer les SEULS secrets 42 =====

export async function listDelegates() {
  return prisma.adminDelegate.findMany({ orderBy: { createdAt: 'asc' } });
}

export async function isDelegate(login42: string): Promise<boolean> {
  const row = await prisma.adminDelegate.findUnique({ where: { login42 } });
  return !!row;
}

export async function addDelegate(login42: string) {
  return prisma.adminDelegate.upsert({
    where: { login42 },
    update: {},
    create: { login42 },
  });
}

export async function removeDelegate(login42: string): Promise<void> {
  await prisma.adminDelegate.deleteMany({ where: { login42 } });
}

// ===== Journal d'audit (AdminAuditEvent) =====

export async function logAdminEvent(actor: string, action: string, detail?: string): Promise<void> {
  try {
    await prisma.adminAuditEvent.create({
      // `actor` peut valoir `owner:<credentialId>` et dépasser VARCHAR(128) selon
      // l'authenticator : on tronque plutôt que de perdre l'événement en silence
      // (l'insert échouerait et le catch ci-dessous l'avalerait).
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
