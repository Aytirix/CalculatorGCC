import { describe, it, expect } from 'vitest';
import { buildMyProjects, simulationBlocker } from './myProjects.types';
import type { RNCP } from '@/types/rncp.types';
import type { Project42 } from '@/services/backend-api42.service';

/**
 * Assemblage des lignes de « Mes projets ».
 *
 * Logique purement fonctionnelle, et pourtant la plus piégeuse de la page :
 * elle croise trois sources qui nomment les mêmes projets de trois façons
 * différentes (id RNCP, `api-<id 42>`, `catalog-<id 42>`, `42-<id 42>`). Les
 * deux défauts corrigés ici — statut de simulation écrasé, et lignes en double
 * pour un même projet — auraient été attrapés par ces quelques assertions.
 */

const rncpData = (projectId: string, name: string): RNCP[] => [
  {
    id: 'rncp-6',
    name: 'RNCP 6',
    level: 6,
    requiredLevel: 0,
    requiredEvents: 0,
    requiredProfessionalExperience: 0,
    categories: [
      {
        id: 'cat',
        name: 'Catégorie',
        requiredCount: 1,
        requiredXP: 0,
        projects: [{ id: projectId, name, slug: name.toLowerCase(), xp: 1000 }],
      },
    ],
  } as unknown as RNCP,
];

const apiEntry = (projectId42: number, name: string, over: Partial<Project42> = {}): Project42 =>
  ({
    id: projectId42 * 10,
    final_mark: null,
    status: 'in_progress',
    validated: false,
    marked_at: null,
    created_at: '2026-01-01',
    project: { id: projectId42, name, slug: name.toLowerCase() },
    ...over,
  }) as unknown as Project42;

const build = (over: Partial<Parameters<typeof buildMyProjects>[0]> = {}) =>
  buildMyProjects({
    rncpData: [],
    apiProjects: [],
    simulatedIds: [],
    percentages: {},
    customProjects: [],
    xpBySlug: new Map(),
    catalog: [],
    ...over,
  });

describe('statut et simulation sont deux informations distinctes', () => {
  it("garde « simulé » sur un projet du référentiel déjà commencé sur 42", () => {
    const rows = build({
      rncpData: rncpData('ft_transcendence', 'Transcendence'),
      apiProjects: [apiEntry(1, 'Transcendence')],
      simulatedIds: ['ft_transcendence'],
    });
    const row = rows.find((r) => r.id === 'ft_transcendence');
    // L'état 42 reste le statut principal…
    expect(row?.status).toBe('in_progress');
    // …mais l'information « il est dans ma simulation » ne doit plus être perdue.
    expect(row?.isSimulated).toBe(true);
  });

  it('conserve le pourcentage simulé même quand le projet est commencé', () => {
    const rows = build({
      rncpData: rncpData('ft_transcendence', 'Transcendence'),
      apiProjects: [apiEntry(1, 'Transcendence')],
      simulatedIds: ['ft_transcendence'],
      percentages: { ft_transcendence: 115 },
    });
    expect(rows.find((r) => r.id === 'ft_transcendence')?.simulatedPercentage).toBe(115);
  });

  it("n'invente pas de simulation sur un projet qui n'en a pas", () => {
    const rows = build({
      rncpData: rncpData('libft', 'Libft'),
      apiProjects: [apiEntry(1, 'Libft', { validated: true, status: 'finished' })],
    });
    const row = rows.find((r) => r.id === 'libft');
    expect(row?.status).toBe('validated');
    expect(row?.isSimulated).toBe(false);
  });
});

describe('un projet ne doit jamais apparaître deux fois', () => {
  it('fusionne une simulation du Holy Graph avec la ligne du parcours 42', () => {
    // Le Holy Graph enregistre la simulation sous « 42-<id 42> », alors que le
    // parcours de l'utilisateur produit « api-<id 42> » : deux noms, un projet.
    const rows = build({
      apiProjects: [apiEntry(1314, 'Libft')],
      simulatedIds: ['42-1314'],
      customProjects: [{ id: '42-1314', name: 'Libft', xp: 4200 } as never],
    });
    const libft = rows.filter((r) => r.name === 'Libft');
    expect(libft).toHaveLength(1);
    expect(libft[0].id).toBe('api-1314');
    expect(libft[0].status).toBe('in_progress');
    expect(libft[0].isSimulated).toBe(true);
  });

  it('fusionne une simulation du Holy Graph avec la ligne du catalogue', () => {
    const rows = build({
      catalog: [{ id: 1321, name: 'Get_next_line', slug: 'get_next_line', xp: 2100 }],
      simulatedIds: ['42-1321'],
      customProjects: [{ id: '42-1321', name: 'Get_next_line', xp: 2100 } as never],
    });
    const gnl = rows.filter((r) => r.name === 'Get_next_line');
    expect(gnl).toHaveLength(1);
    expect(gnl[0].isSimulated).toBe(true);
    expect(gnl[0].status).toBe('simulated');
  });

  it('conserve un projet personnalisé, qui lui ne correspond à aucun projet 42', () => {
    const rows = build({
      simulatedIds: ['custom-1'],
      customProjects: [{ id: 'custom-1', name: 'Mon projet', xp: 5000 } as never],
    });
    const row = rows.find((r) => r.id === 'custom-1');
    expect(row?.isCustom).toBe(true);
    expect(row?.isSimulated).toBe(true);
  });
});

describe('invariant de cohérence', () => {
  it("un statut « simulé » implique toujours le drapeau de simulation", () => {
    const rows = build({
      rncpData: rncpData('ft_transcendence', 'Transcendence'),
      apiProjects: [apiEntry(1, 'Autre projet')],
      catalog: [{ id: 1321, name: 'Get_next_line', slug: 'get_next_line', xp: 2100 }],
      simulatedIds: ['ft_transcendence', '42-1321'],
      customProjects: [{ id: '42-1321', name: 'Get_next_line', xp: 2100 } as never],
    });
    for (const row of rows) {
      if (row.status === 'simulated') expect(row.isSimulated).toBe(true);
    }
  });

  it('ne produit jamais deux lignes avec le même identifiant', () => {
    const rows = build({
      rncpData: rncpData('libft', 'Libft'),
      apiProjects: [apiEntry(1314, 'Libft'), apiEntry(42, 'Ft_printf')],
      catalog: [{ id: 1321, name: 'Get_next_line', slug: 'get_next_line', xp: 2100 }],
      simulatedIds: ['42-1321'],
      customProjects: [{ id: '42-1321', name: 'Get_next_line', xp: 2100 } as never],
    });
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('identifiant de simulation, pourcentage, bonus et note sur toutes les lignes', () => {
  it('projet fait hors référentiel : simId 42-<id>, pourcentage simulé enfin affiché', () => {
    const [row] = build({
      apiProjects: [apiEntry(77, 'Exam Rank 06')],
      simulatedIds: ['42-77'],
      percentages: { '42-77': 110 },
      boosts: { '42-77': true },
      notes: { '42-77': 'à repasser' },
    });
    expect(row.id).toBe('api-77');
    expect(row.simId).toBe('42-77');
    expect(row.simulatedPercentage).toBe(110);
    expect(row.coalitionBoost).toBe(true);
    expect(row.note).toBe('à repasser');
  });

  it('projet du catalogue jamais touché : simulable sous 42-<id>', () => {
    const [row] = build({ catalog: [{ id: 2551, name: 'Python DS', slug: 'python-ds', xp: 3800 }] });
    expect(row.id).toBe('catalog-2551');
    expect(row.simId).toBe('42-2551');
    expect(row.isSimulated).toBe(false);
    expect(row.coalitionBoost).toBe(false);
  });

  it('projet du référentiel : simId = son id ; bonus ignoré s’il n’est pas simulé', () => {
    const [row] = build({ rncpData: rncpData('42-1383', 'webserv'), boosts: { '42-1383': true } });
    expect(row.simId).toBe('42-1383');
    expect(row.coalitionBoost).toBe(false);
    expect(row.isPool).toBe(false);
  });

  it('piscine : simulée quand ses modules la couvrent', () => {
    const data = rncpData('pool', 'Piscine');
    (data[0].categories[0].projects[0] as { subProjects?: unknown }).subProjects = [
      { id: 'm1', name: 'M1', xp: 100 }, { id: 'm2', name: 'M2', xp: 100 },
    ];
    const partial = build({ rncpData: data, simulatedSubProjects: { pool: ['m1'] } })[0];
    const full = build({ rncpData: data, simulatedSubProjects: { pool: ['m1', 'm2'] } })[0];
    expect(partial.isPool).toBe(true);
    expect(partial.isSimulated).toBe(false);
    expect(full.isSimulated).toBe(true);
  });
});

describe('simulationBlocker — quand la case « simuler » est inactive', () => {
  const row = { isPool: false, status: 'not_started' as const, isSimulated: false };
  it('projet simulable : aucune raison', () => {
    expect(simulationBlocker(row, false)).toBeNull();
  });
  it('consultation, piscine, déjà validé : bloqué avec une raison lisible', () => {
    expect(simulationBlocker(row, true)).toMatch(/Consultation/);
    expect(simulationBlocker({ ...row, isPool: true }, false)).toMatch(/Piscine/);
    expect(simulationBlocker({ ...row, status: 'validated' }, false)).toMatch(/validé/);
  });
  it('validé mais encore coché : on peut le décocher', () => {
    expect(simulationBlocker({ ...row, status: 'validated', isSimulated: true }, false)).toBeNull();
  });
});

describe('catalogue du campus', () => {
  it('les projets administratifs (alternance, stage) n’y apparaissent pas', () => {
    const rows = build({ catalog: [
      { id: 1, name: 'Apprentissage 1 an', slug: 'apprentissage-1-an', xp: 15000 },
      { id: 2, name: 'Work Experience I', slug: 'work-experience-i', xp: 0 },
      { id: 3, name: '42run', slug: '42run', xp: 9450 },
    ] });
    expect(rows.map(r => r.name)).toEqual(['42run']);
  });
});
