import { describe, it, expect } from 'vitest';
import { HISTORY_LIMIT, projectsReducer, replayOps, type ProjectsState } from './useCalendarData';
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
