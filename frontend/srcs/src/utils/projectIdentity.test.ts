import { describe, expect, it, vi } from 'vitest';
import type { Project42 } from '@/services/backend-api42.service';
import type { RNCP } from '@/types/rncp.types';
import { apiStatusOf, createProjectLookup, findValidated, finalMarkOf, indexApiProjects, resolveValidated } from './projectIdentity';

/**
 * Rapprochement d'un projet du référentiel avec l'intra : par IDENTIFIANT 42.
 * Le nom n'est qu'un dernier recours, exact et sans ambiguïté — mesuré sur la
 * production, il ne trouvait rien de plus que l'identifiant et ratait les
 * projets au nom court.
 */

let n = 0;
const entry = (id: number, name: string, slug: string, over: Partial<Project42> = {}): Project42 =>
	({ id: ++n, final_mark: null, status: 'in_progress', validated: false, marked_at: null, created_at: '2026-01-01', project: { id, name, slug }, ...over }) as unknown as Project42;
const done = (id: number, name: string, slug: string, mark = 100) =>
	entry(id, name, slug, { validated: true, status: 'finished', final_mark: mark } as Partial<Project42>);

describe('par identifiant', () => {
	it('un projet validé est trouvé par son identifiant, quel que soit son nom', () => {
		const index = indexApiProjects([done(1463, 'Zappy (nouveau nom)', '42cursus-zappy-v2', 112)]);
		expect(findValidated(index, { id: '42-1463', name: 'zappy', slug: 'zappy' })).not.toBeNull();
		expect(finalMarkOf(index, { id: '42-1463' })).toBe(112);
	});

	it('plus de « contient » : ft_nm n’est pas validé par ft_nmap, Open Project pas par une de ses étapes', () => {
		const index = indexApiProjects([
			done(1000, 'ft_nmap', '42cursus-ft_nmap'),
			done(2000, 'Open Project - Complete the project', 'open-project-open-project-complete-the-project'),
		]);
		expect(findValidated(index, { id: '42-1001', name: 'ft_nm', slug: 'ft_nm' })).toBeNull();
		expect(findValidated(index, { id: '42-2001', name: 'Open Project', slug: 'open-project' })).toBeNull();
	});

	it('noms courts : « rt », « war » sont trouvés en cours (le nom les ratait)', () => {
		const index = indexApiProjects([entry(1855, 'rt', '42cursus-rt'), entry(1856, 'war', 'war')]);
		expect(apiStatusOf(index, { id: '42-1855', name: 'rt', slug: 'rt' })).toBe('in_progress');
		expect(apiStatusOf(index, { id: '42-1856', name: 'war', slug: 'war' })).toBe('in_progress');
	});

	it('plusieurs inscriptions : la meilleure note', () => {
		const index = indexApiProjects([done(10, 'x', 'x', 80), done(10, 'x', 'x', 115)]);
		expect(finalMarkOf(index, { id: '42-10' })).toBe(115);
	});

	it('raté puis en cours : le statut dit « en cours »', () => {
		const index = indexApiProjects([entry(11, 'y', 'y', { status: 'finished', final_mark: 40 } as Partial<Project42>), entry(11, 'y', 'y')]);
		expect(apiStatusOf(index, { id: '42-11' })).toBe('in_progress');
	});
});

describe('dernier recours : nom exact et unique', () => {
	it('identifiant différent mais nom identique (variante) : trouvé, et signalé', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const index = indexApiProjects([done(9999, 'minishell', 'minishell-d972f7c4')]);
		expect(findValidated(index, { id: '42-1331', name: 'minishell', slug: 'minishell' })).not.toBeNull();
		expect(warn).toHaveBeenCalledOnce();
		warn.mockRestore();
	});

	it('deux projets portent ce nom : on ne devine pas', () => {
		const index = indexApiProjects([done(1, 'push_swap', '42cursus-push_swap'), done(2, 'push_swap', '42next-push_swap')]);
		expect(findValidated(index, { id: '42-3', name: 'push_swap', slug: 'push_swap' })).toBeNull();
	});
});

describe('resolveValidated — ce que reçoit la validation RNCP', () => {
	const rncp = [{
		id: 'r', name: 'R', level: 0, requiredEvents: 0, requiredProfessionalExperience: 0,
		categories: [{
			id: 'c', name: 'C', requiredCount: 1, requiredXP: 0,
			projects: [
				{ id: '42-1', name: 'a', slug: 'a', xp: 1 },
				{ id: '42-9', name: 'Pool', slug: 'pool', xp: 2, subProjects: [{ id: '42-91', name: 'm0', slug: 'm0', xp: 1 }, { id: '42-92', name: 'm1', slug: 'm1', xp: 1 }] },
			],
		}],
	}] as unknown as RNCP[];

	it('identifiants des projets et modules validés, avec leur note ; une piscine ne l’est pas par son entrée', () => {
		const index = indexApiProjects([done(1, 'a', 'a', 110), done(91, 'm0', 'm0'), done(9, 'Pool', 'pool', 90)]);
		const { ids, marks } = resolveValidated(rncp, index);
		expect(ids.sort()).toEqual(['42-1', '42-91']);
		expect(marks).toMatchObject({ '42-1': 110, '42-91': 100, '42-9': 90 });
	});
});

describe('createProjectLookup', () => {
	it('départage plusieurs inscriptions selon la règle donnée', () => {
		const older = entry(5, 'z', 'z', { created_at: '2025-01-01' } as Partial<Project42>);
		const newer = entry(5, 'z', 'z', { created_at: '2026-06-01' } as Partial<Project42>);
		const lookup = createProjectLookup([newer, older], (c, cur) => Date.parse(c.created_at ?? '') >= Date.parse(cur.created_at ?? ''));
		expect(lookup.find({ id: '42-5' })).toBe(newer);
	});
});
