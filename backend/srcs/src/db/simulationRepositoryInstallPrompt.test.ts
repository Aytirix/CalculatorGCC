import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Le DÉPÔT de « Ne plus me le rappeler » (bandeau d'installation) — même
 * technique que `lastSeenChangelog` : upsert de la ligne puis UPDATE brut.
 */

const prisma = vi.hoisted(() => ({
	userSimulation: { upsert: vi.fn(async (args: unknown) => { void args; return {}; }) },
	$queryRaw: vi.fn(async (..._args: unknown[]) => [] as unknown[]),
	$executeRaw: vi.fn(async (..._args: unknown[]) => 1),
}));

vi.mock('./connection.js', () => ({ prisma }));

const { simulationRepository } = await import('./simulationRepository.js');

beforeEach(() => {
	prisma.userSimulation.upsert.mockClear();
	prisma.$queryRaw.mockReset();
	prisma.$executeRaw.mockClear();
});

describe('getInstallPromptDismissed', () => {
	it('false quand l’utilisateur n’a pas encore de ligne', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);
		expect(await simulationRepository.getInstallPromptDismissed(42)).toBe(false);
	});

	it('convertit le 0/1 renvoyé par MariaDB en booléen', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([{ installPromptDismissed: 1 }]);
		expect(await simulationRepository.getInstallPromptDismissed(42)).toBe(true);
		prisma.$queryRaw.mockResolvedValueOnce([{ installPromptDismissed: 0 }]);
		expect(await simulationRepository.getInstallPromptDismissed(42)).toBe(false);
		prisma.$queryRaw.mockResolvedValueOnce([{ installPromptDismissed: true }]);
		expect(await simulationRepository.getInstallPromptDismissed(42)).toBe(true);
	});

	it('interroge la ligne de l’utilisateur demandé', async () => {
		prisma.$queryRaw.mockResolvedValueOnce([]);
		await simulationRepository.getInstallPromptDismissed(7);
		const [, ...valeurs] = prisma.$queryRaw.mock.calls[0];
		expect(valeurs).toEqual([7]);
	});
});

describe('saveInstallPromptDismissed', () => {
	it('crée la ligne au besoin puis écrit la valeur, sur l’utilisateur appelant', async () => {
		const rendu = await simulationRepository.saveInstallPromptDismissed(42, 'thmouty', null, true, 'Théo', 'Mouty');
		expect(rendu).toBe(true);

		const upsert = prisma.userSimulation.upsert.mock.calls[0][0] as { where: unknown; create: Record<string, unknown> };
		expect(upsert.where).toEqual({ userId42: 42 });
		expect(upsert.create).toMatchObject({ userId42: 42, login: 'thmouty', firstName: 'Théo', lastName: 'Mouty' });

		const [sql, ...valeurs] = prisma.$executeRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
		expect(sql.join('?')).toContain('SET installPromptDismissed = ?');
		expect(valeurs).toEqual([true, 42]);
	});

	it('écrit aussi false (annulation)', async () => {
		expect(await simulationRepository.saveInstallPromptDismissed(42, 'thmouty', null, false)).toBe(false);
		const [, ...valeurs] = prisma.$executeRaw.mock.calls[0];
		expect(valeurs).toEqual([false, 42]);
	});
});
