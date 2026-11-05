import { describe, it, expect } from 'vitest';
import { HISTORY_LIMIT, mergeAfterLoad, alternanceSource, alternanceFingerprint, projectsReducer, replayOps, type ProjectsState } from './useCalendarData';
import { parseDateKey, type PlacedProject } from './calendarModel';

/**
 * Le reducer d'historique décide de ce que « Annuler » (bouton, Ctrl+Z,
 * notification) rétablit. Fonction pure : testée sans React.
 */

const P = (id: string): PlacedProject => ({
	id, projectId: id, name: id, xp: 1, row: 0,
	startDate: parseDateKey('2026-11-02'), endDate: parseDateKey('2026-11-09'),
});
const empty: ProjectsState = { projects: [], past: [] };

describe('projectsReducer', () => {
	it('une modification est annulable', () => {
		const s1 = projectsReducer(empty, { type: 'apply', fn: prev => [...prev, P('a')] });
		expect(s1.projects.map(p => p.id)).toEqual(['a']);
		const s2 = projectsReducer(s1, { type: 'undo' });
		expect(s2.projects).toEqual([]);
		expect(s2.past).toEqual([]);
	});

	it('une opération sans effet (même tableau) ne crée pas d’entrée d’historique', () => {
		const s1 = projectsReducer(empty, { type: 'apply', fn: prev => [...prev, P('a')] });
		const s2 = projectsReducer(s1, { type: 'apply', fn: prev => prev });
		expect(s2).toBe(s1);
	});

	it('garde au plus HISTORY_LIMIT annulations', () => {
		let s = empty;
		for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
			s = projectsReducer(s, { type: 'apply', fn: prev => [...prev, P(`p${i}`)] });
		}
		expect(s.past).toHaveLength(HISTORY_LIMIT);
		for (let i = 0; i < HISTORY_LIMIT; i++) s = projectsReducer(s, { type: 'undo' });
		// Les 5 plus anciennes modifications ne sont plus annulables.
		expect(s.projects).toHaveLength(5);
		expect(projectsReducer(s, { type: 'undo' })).toBe(s);
	});

	it('un rechargement depuis la base remplace les projets et vide l’historique', () => {
		const s1 = projectsReducer(empty, { type: 'apply', fn: prev => [...prev, P('local')] });
		const s2 = projectsReducer(s1, { type: 'replace', projects: [P('db')] });
		expect(s2.projects.map(p => p.id)).toEqual(['db']);
		expect(s2.past).toEqual([]);
	});

	it('annuler sur un historique vide ne change rien', () => {
		expect(projectsReducer(empty, { type: 'undo' })).toBe(empty);
	});

	it('est pur : appelé deux fois (StrictMode), il donne le même résultat', () => {
		const action = { type: 'apply' as const, fn: (prev: PlacedProject[]) => [...prev, P('a')] };
		const r1 = projectsReducer(empty, action);
		const r2 = projectsReducer(empty, action);
		expect(r1).toEqual(r2);
		expect(empty).toEqual({ projects: [], past: [] });
	});
});

describe('replayOps (modifications faites pendant le chargement)', () => {
	it('rejoue l\u2019ajout sur les données de la base au lieu de les écraser', () => {
		// Nouvel appareil : copie locale vide, 2 projets en base, 1 projet placé pendant le chargement.
		const db = [P('a'), P('b')];
		const ops = [(prev: PlacedProject[]) => [...prev, P('placé')]];
		expect(replayOps(db, ops).map(p => p.id)).toEqual(['a', 'b', 'placé']);
	});

	it('rejoue une modification par id, et ignore celle qui vise un projet absent de la base', () => {
		const moved = { ...P('a'), startDate: parseDateKey('2026-11-05') };
		const ops = [
			(prev: PlacedProject[]) => prev.map(p => (p.id === 'a' ? moved : p)),
			(prev: PlacedProject[]) => prev.map(p => (p.id === 'local-seul' ? P('x') : p)),
		];
		expect(replayOps([P('a'), P('b')], ops)).toEqual([moved, P('b')]);
	});

	it('sans modification, la base est prise telle quelle', () => {
		const db = [P('a')];
		expect(replayOps(db, [])).toBe(db);
	});
});

describe('mergeAfterLoad (ce qui est affiché ET enregistré après la réponse de la base)', () => {
	const local = {
		projects: [P('local')],
		dateRange: { start: parseDateKey('2026-11-01'), end: parseDateKey('2027-04-30') },
		alternanceDays: { '2026-11-02': '#111111' },
	};
	const db = {
		placedProjects: [
			{ id: 'db1', projectId: 'db1', name: 'db1', xp: 1, row: 0, startDate: '2026-10-01T00:00:00', endDate: '2026-10-10T00:00:00' },
		],
		dateRange: { start: '2025-09-01', end: '2027-08-31' },
		alternanceDays: { '2026-10-05': '#222222' },
	};
	const untouched = { range: false, alternance: false };

	it('nouvel appareil : jamais l\u2019état local seul — la base, plus la modification rejouée', () => {
		const ops = [(prev: PlacedProject[]) => [...prev, P('placé')]];
		const m = mergeAfterLoad(db, { ...local, projects: [P('placé')] }, ops, untouched);
		expect(m.projects.map(p => p.id)).toEqual(['db1', 'placé']);
		expect(m.dateRange.start.getFullYear()).toBe(2025);
		expect(m.alternanceDays).toEqual({ '2026-10-05': '#222222' });
	});

	it('période / planning locaux seulement si l\u2019utilisateur les a changés', () => {
		const m = mergeAfterLoad(db, local, [], { range: true, alternance: true });
		expect(m.dateRange).toBe(local.dateRange);
		expect(m.alternanceDays).toBe(local.alternanceDays);
		expect(m.projects.map(p => p.id)).toEqual(['db1']);
	});

	it('planning effacé en base : il reste effacé (la copie locale ne le ressuscite pas)', () => {
		const m = mergeAfterLoad({ ...db, alternanceDays: {} }, local, [], untouched);
		expect(m.alternanceDays).toEqual({});
	});

	it('base sans champ planning (données anciennes) : on garde la copie locale', () => {
		const { alternanceDays: _omit, ...withoutAlt } = db;
		void _omit;
		expect(mergeAfterLoad(withoutAlt, local, [], untouched).alternanceDays).toBe(local.alternanceDays);
	});

		it('base vide : la copie locale (première création)', () => {
		expect(mergeAfterLoad(null, local, [], untouched)).toBe(local);
	});

	it('période invalide en base : on garde la période locale', () => {
		const m = mergeAfterLoad({ ...db, dateRange: { start: '1000-01-01', end: '9999-12-31' } }, local, [], untouched);
		expect(m.dateRange).toBe(local.dateRange);
	});
});

describe('alternanceSource — planning de la base ou copie locale', () => {
	const plan = { '2026-11-02': '#4f7be8' };
	it('copie locale déjà envoyée (synced) : la base fait foi, même vide (effacé ailleurs)', () => {
		expect(alternanceSource({}, false, 'synced')).toBe('db');
		expect(alternanceSource(plan, false, 'synced')).toBe('db');
	});
	it('modification locale pas encore confirmée (en attente) : la copie locale prime si la base n\u2019a pas bougé', () => {
		// Effacé puis F5 < 2 s : la base contient encore le planning connu au moment de l'effacement.
		expect(alternanceSource(plan, false, { pendingBase: alternanceFingerprint(plan) })).toBe('local');
		// Import jamais envoyé, base vide inchangée.
		expect(alternanceSource({}, false, { pendingBase: alternanceFingerprint({}) })).toBe('local');
		// Base inconnue au moment de la modification (chargement en échec) : copie locale.
		expect(alternanceSource(plan, false, { pendingBase: '?' })).toBe('local');
	});
	it('en attente mais la base a changé depuis (autre appareil) : la base, plus récente, gagne', () => {
		const other = { '2026-12-01': '#ef8a3c' };
		expect(alternanceSource(other, false, { pendingBase: alternanceFingerprint(plan) })).toBe('db');
	});
	it('empreinte : indépendante de l\u2019ordre des clés, sensible au contenu', () => {
		expect(alternanceFingerprint({ a: '1', b: '2' })).toBe(alternanceFingerprint({ b: '2', a: '1' }));
		expect(alternanceFingerprint({ a: '1' })).not.toBe(alternanceFingerprint({ a: '2' }));
		expect(alternanceFingerprint({})).not.toBe(alternanceFingerprint({ a: '1' }));
	});
	it('navigateur sans marqueur : base vide → copie locale (pas de perte sans retour), sinon la base', () => {
		expect(alternanceSource({}, false, 'unknown')).toBe('local');
		expect(alternanceSource(plan, false, 'unknown')).toBe('db');
	});
	it('modifié pendant le chargement, ou champ absent : copie locale', () => {
		expect(alternanceSource(plan, true, 'synced')).toBe('local');
		expect(alternanceSource(undefined, false, 'synced')).toBe('local');
	});
	it('mergeAfterLoad applique la règle', () => {
		const local = { projects: [], dateRange: { start: new Date(2026, 0, 1), end: new Date(2026, 11, 31) }, alternanceDays: plan };
		const db = { placedProjects: [], dateRange: null, alternanceDays: {} };
		const t = { range: false, alternance: false };
		expect(mergeAfterLoad(db, local, [], t, 'synced').alternanceDays).toEqual({});
		expect(mergeAfterLoad(db, local, [], t, 'unknown').alternanceDays).toBe(plan);
		expect(mergeAfterLoad(db, local, [], t, { pendingBase: alternanceFingerprint({}) }).alternanceDays).toBe(plan);
	});
});
