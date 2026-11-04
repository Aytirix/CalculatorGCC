import { describe, it, expect } from 'vitest';
import {
	addDays, diffDays, startOfWeek, formatDateKey, parseDateKey,
	getTimelineGrid, getMonthSegments, getHolidayMarks, getHolidayName,
	packLanes, getProjectStatus,
	classifyAlternanceColor, getAlternanceRuns, countSchoolDays, readableTextColor,
	ALTERNANCE_COLORS, normalizeAlternanceDays, unknownAlternanceColors, alternanceKindsPresent,
	moveProject, resizeProject, setProjectDuration, defaultPlacementDate, newPlacedProject,
	normalizeView, deserializeProjects, serializeProjects, parseDateRange,
	sanitizeAlternanceDays, validateDateRange, MAX_ALTERNANCE_DAYS,
	type PlacedProject,
} from './calendarModel';

const d = (s: string) => parseDateKey(s);
const P = (id: string, start: string, end: string, row = 0): PlacedProject => ({
	id, projectId: id, name: id, xp: 1000, startDate: d(start), endDate: d(end), row,
});
const legend = { ecole: '#0000FF', entreprise: '#FF8800', distanciel: '#00AA88' };

describe('dates', () => {
	it('startOfWeek renvoie le lundi, même un dimanche', () => {
		expect(formatDateKey(startOfWeek(d('2026-11-08')))).toBe('2026-11-02');
		expect(formatDateKey(startOfWeek(d('2026-11-02')))).toBe('2026-11-02');
	});
	it('diffDays ignore le changement d’heure (25 oct. 2026)', () => {
		expect(diffDays(d('2026-10-24'), d('2026-10-26'))).toBe(2);
		expect(diffDays(d('2026-03-28'), d('2026-03-30'))).toBe(2);
	});
	it('diffDays ignore l’heure de la journée', () => {
		expect(diffDays(new Date(2026, 0, 1, 23, 0), new Date(2026, 0, 2, 1, 0))).toBe(1);
	});
});

describe('grille', () => {
	it('couvre la période de lundi en lundi', () => {
		const g = getTimelineGrid({ start: d('2026-10-07'), end: d('2026-10-20') });
		expect(formatDateKey(g.gridStart)).toBe('2026-10-05');
		expect(g.weekCount).toBe(3);
		expect(g.totalDays).toBe(21);
	});
	it('ne descend jamais sous une semaine', () => {
		expect(getTimelineGrid({ start: d('2026-10-07'), end: d('2026-10-07') }).weekCount).toBe(1);
	});
	it('découpe les mois au jour près', () => {
		const segs = getMonthSegments(d('2026-10-26'), 14);
		expect(segs.map(s => [s.startDay, s.days])).toEqual([[0, 6], [6, 8]]);
		expect(segs[0].label).toBe('Octobre 2026');
		expect(segs.reduce((a, s) => a + s.days, 0)).toBe(14);
	});
	it('repère les jours fériés, Pâques compris', () => {
		expect(getHolidayName(d('2026-04-06'))).toBe('Lundi de Pâques');
		expect(getHolidayName(d('2026-11-11'))).toBe('Armistice');
		expect(getHolidayName(d('2026-11-12'))).toBeNull();
		const marks = getHolidayMarks(d('2026-11-02'), 14);
		expect(marks.map(m => m.day)).toEqual([9]);
	});
});

describe('packLanes', () => {
	it('ne met jamais deux projets qui se chevauchent sur la même ligne', () => {
		const projects = [
			P('a', '2026-10-01', '2026-10-15'),
			P('b', '2026-10-10', '2026-10-20'),
			P('c', '2026-10-12', '2026-10-30'),
			P('d', '2026-10-15', '2026-10-18'),
		];
		const { lanes, laneCount } = packLanes(projects);
		for (const x of projects) for (const y of projects) {
			if (x === y || lanes.get(x.id) !== lanes.get(y.id)) continue;
			expect(x.startDate < y.endDate && x.endDate > y.startDate).toBe(false);
		}
		expect(lanes.get('d')).toBe(0); // réutilise la ligne de « a » (fin exclusive)
		expect(laneCount).toBe(3);
	});
	it('garde au moins le nombre minimal de lignes', () => {
		expect(packLanes([]).laneCount).toBe(3);
		expect(packLanes([], 1).laneCount).toBe(1);
	});
	it('est stable quel que soit l’ordre d’entrée', () => {
		const a = [P('x', '2026-10-01', '2026-10-10'), P('y', '2026-10-01', '2026-10-10')];
		expect([...packLanes(a).lanes]).toEqual([...packLanes([...a].reverse()).lanes].sort((p, q) => p[1] - q[1]));
	});
});

describe('statut', () => {
	const p = P('a', '2026-10-19', '2026-11-10');
	it('en cours avec J-x et avancement', () => {
		const s = getProjectStatus(p, d('2026-11-04'));
		expect(s.status).toBe('active');
		expect(s.daysLeft).toBe(6);
		expect(s.progress).toBe(73);
	});
	it('terminé le jour de fin (fin exclusive)', () => {
		expect(getProjectStatus(p, d('2026-11-10')).status).toBe('done');
	});
	it('à venir avant le début', () => {
		const s = getProjectStatus(p, d('2026-10-17'));
		expect(s.status).toBe('upcoming');
		expect(s.daysUntilStart).toBe(2);
		expect(s.progress).toBe(0);
	});
});

describe('alternance', () => {
	const days = {
		'2026-11-02': '#0000FF', '2026-11-03': '#0000FF', '2026-11-04': '#00AA88',
		'2026-11-05': '#FF8800', '2026-11-09': '#FF8800',
	};
	it('reconnaît la couleur sans tenir compte de la casse', () => {
		expect(classifyAlternanceColor('#0000ff', legend)).toBe('ecole');
		expect(classifyAlternanceColor('#123456', legend)).toBeNull();
		expect(classifyAlternanceColor('#0000ff', null)).toBeNull();
	});
	it('regroupe les jours consécutifs de même couleur', () => {
		const runs = getAlternanceRuns(days, legend, d('2026-11-02'), 14);
		expect(runs.map(r => [r.startDay, r.days, r.kind])).toEqual([
			[0, 2, 'ecole'], [2, 1, 'distanciel'], [3, 1, 'entreprise'], [7, 1, 'entreprise'],
		]);
	});
	it('compte les jours d’école (présentiel + distanciel) sur [from, to)', () => {
		expect(countSchoolDays(days, legend, d('2026-11-03'), d('2026-11-10'))).toBe(2);
		expect(countSchoolDays(days, null, d('2026-11-01'), d('2026-11-30'))).toBeNull();
		// Seule l'entreprise est connue : 0 jour d'école (et non « inconnu »).
		expect(countSchoolDays(days, { ecole: null, distanciel: null, entreprise: '#FF8800' }, d('2026-11-01'), d('2026-11-30'))).toBe(0);
	});
	it('choisit un texte lisible sur n’importe quel fond', () => {
		expect(readableTextColor('#FFFF00')).toBe('#000000');
		// Rouge Excel : le noir pur passe 4,5:1, un gris très foncé non.
		expect(readableTextColor('#FF0000')).toBe('#000000');
		expect(readableTextColor('#1D3F99')).toBe('#ffffff');
		expect(readableTextColor('pas-une-couleur')).toBe('#000000');
	});
});

describe('édition', () => {
	const p = P('a', '2026-11-02', '2026-11-05');
	it('déplace sans changer la durée', () => {
		const m = moveProject(p, 3);
		expect(formatDateKey(m.startDate)).toBe('2026-11-05');
		expect(diffDays(m.startDate, m.endDate)).toBe(3);
		expect(moveProject(p, 0)).toBe(p);
	});
	it('ne laisse jamais la durée sous 1 jour', () => {
		expect(diffDays(resizeProject(p, 'start', 10).startDate, p.endDate)).toBe(1);
		const r = resizeProject(p, 'end', -10);
		expect(diffDays(r.startDate, r.endDate)).toBe(1);
		expect(diffDays(setProjectDuration(p, 0).startDate, setProjectDuration(p, 0).endDate)).toBe(1);
		expect(diffDays(p.startDate, setProjectDuration(p, 21).endDate)).toBe(21);
	});
	it('place aujourd’hui si la période le contient, sinon à son début', () => {
		const range = { start: d('2026-10-01'), end: d('2026-12-31') };
		expect(formatDateKey(defaultPlacementDate(new Date(2026, 10, 4, 15), range))).toBe('2026-11-04');
		expect(formatDateKey(defaultPlacementDate(d('2027-02-01'), range))).toBe('2026-10-01');
	});
	it('crée un projet de 14 jours démarrant à minuit', () => {
		const n = newPlacedProject({ id: 'webserv', name: 'webserv', xp: 21630 }, new Date(2026, 10, 4, 15), 42);
		expect(n.id).toBe('webserv-42');
		expect(n.startDate.getHours()).toBe(0);
		expect(diffDays(n.startDate, n.endDate)).toBe(14);
	});
});

describe('vue mémorisée', () => {
	it('migre l’ancienne vue semaine vers mois', () => {
		expect(normalizeView('semaine', false)).toBe('mois');
	});
	it('garde une vue valide et choisit selon l’écran sinon', () => {
		expect(normalizeView('agenda', false)).toBe('agenda');
		expect(normalizeView(null, true)).toBe('agenda');
		expect(normalizeView('n’importe', false)).toBe('chronologie');
	});
});

describe('sérialisation', () => {
	it('aller-retour sans perte, row = ligne calculée et bornée', () => {
		const projects = [P('a', '2026-11-02', '2026-11-10', 7), P('b', '2026-11-04', '2026-11-20', 7)];
		const data = serializeProjects(projects);
		expect(data.map(x => x.row)).toEqual([0, 1]);
		const back = deserializeProjects(JSON.parse(JSON.stringify(data)));
		expect(back.map(x => [x.id, formatDateKey(x.startDate), formatDateKey(x.endDate)])).toEqual([
			['a', '2026-11-02', '2026-11-10'], ['b', '2026-11-04', '2026-11-20'],
		]);
	});
	it('écarte les entrées corrompues au lieu de planter', () => {
		const back = deserializeProjects([
			null, 'x', { id: 'a' },
			{ id: 'b', projectId: 'b', name: 'b', xp: 1, startDate: 'nope', endDate: 'nope', row: 0 },
			{ id: 'c', projectId: 'c', name: 'c', xp: 1, startDate: '2026-11-05T00:00:00', endDate: '2026-11-02T00:00:00', row: 0 },
			{ id: 'd', projectId: 'd', name: 'd', startDate: '2026-11-02T00:00:00', endDate: '2026-11-05T00:00:00' },
		]);
		expect(back.map(x => x.id)).toEqual(['d']);
		expect(back[0].xp).toBe(0);
		expect(deserializeProjects({})).toEqual([]);
	});
	it('refuse une période inversée ou illisible', () => {
		expect(parseDateRange({ start: '2026-12-01', end: '2026-11-01' })).toBeNull();
		expect(parseDateRange({ start: 'x', end: '2026-11-01' })).toBeNull();
		expect(parseDateRange(null)).toBeNull();
		const r = parseDateRange({ start: '2026-11-01', end: '2026-11-01' });
		expect(r && formatDateKey(addDays(r.end, 0))).toBe('2026-11-01');
	});
});

describe('robustesse des données (un payload refusé bloquerait tous les enregistrements)', () => {
	it('écarte ids/noms vides et doublons, plafonne l\u2019XP', () => {
		const ok = { projectId: 'x', name: 'x', startDate: '2026-11-02T00:00:00', endDate: '2026-11-05T00:00:00', row: 0 };
		const back = deserializeProjects([
			{ ...ok, id: '' },
			{ ...ok, id: 'a', name: '' },
			{ ...ok, id: 'b', xp: 250000 },
			{ ...ok, id: 'b', xp: 1 },
			{ ...ok, id: 'c', startDate: 123 as unknown as string },
		]);
		expect(back.map(p => p.id)).toEqual(['b']);
		expect(back[0].xp).toBe(100000);
		expect(serializeProjects([{ ...back[0], xp: -3.4 }])[0].xp).toBe(0);
	});

	it('ne garde que des jours « YYYY-MM-DD » → « #RRGGBB », bornés à la limite du backend', () => {
		expect(sanitizeAlternanceDays({ '2026-11-02': '#0000FF', '2026-11-03': 'red', 'demain': '#000000', '2026-11-04': '#zzzzzz' }))
			.toEqual({ '2026-11-02': '#0000FF' });
		expect(sanitizeAlternanceDays(null)).toEqual({});
		expect(sanitizeAlternanceDays(['#000000'])).toEqual({});
		const many = Object.fromEntries(Array.from({ length: MAX_ALTERNANCE_DAYS + 50 }, (_, i) =>
			[formatDateKey(addDays(d('2026-01-01'), i)), '#000000']));
		expect(Object.keys(sanitizeAlternanceDays(many))).toHaveLength(MAX_ALTERNANCE_DAYS);
	});

	it('année sur 4 chiffres même avant l\u2019an 1000', () => {
		const old = new Date(2026, 0, 1);
		old.setFullYear(999);
		expect(formatDateKey(old)).toBe('0999-01-01');
	});
});

describe('bornes de la période', () => {
	it('refuse une période géante, hors 2000–2100, ou inversée', () => {
		expect(validateDateRange(d('2026-07-01'), d('2027-12-31'))).toBeNull();
		expect(validateDateRange(d('2026-01-01'), d('2037-01-01'))).toMatch(/10 ans/);
		expect(validateDateRange(d('1999-01-01'), d('2026-01-01'))).toMatch(/2000/);
		expect(validateDateRange(d('2027-01-01'), d('2026-01-01'))).toMatch(/après/);
		expect(parseDateRange({ start: '1000-01-01', end: '9999-12-31' })).toBeNull();
	});
});

describe('couleurs de l\u2019app pour le rythme (plus celles du .xlsx)', () => {
	const xlsxLegend = { ecole: '#0000FF', entreprise: '#FF8800', distanciel: '#00AA88' };

	it('convertit les couleurs du fichier en couleurs de l\u2019app via la légende', () => {
		const out = normalizeAlternanceDays({ '2026-11-02': '#0000ff', '2026-11-03': '#FF8800', '2026-11-04': '#00AA88' }, xlsxLegend);
		expect(out).toEqual({
			'2026-11-02': ALTERNANCE_COLORS.ecole,
			'2026-11-03': ALTERNANCE_COLORS.entreprise,
			'2026-11-04': ALTERNANCE_COLORS.distanciel,
		});
	});

	it('sans légende : la couleur la plus fréquente devient Entreprise, puis École, puis Distanciel', () => {
		const days = { a: '#F08000', b: '#f08000', c: '#f08000', d: '#2000E0', e: '#2000E0', f: '#00A000' };
		expect(normalizeAlternanceDays(days, null)).toEqual({
			a: ALTERNANCE_COLORS.entreprise, b: ALTERNANCE_COLORS.entreprise, c: ALTERNANCE_COLORS.entreprise,
			d: ALTERNANCE_COLORS.ecole, e: ALTERNANCE_COLORS.ecole,
			f: ALTERNANCE_COLORS.distanciel,
		});
	});

	it('légende partielle : les couleurs restantes prennent les types encore libres', () => {
		const out = normalizeAlternanceDays({ a: '#0000FF', b: '#999999', c: '#999999' }, { ecole: '#0000FF', entreprise: null, distanciel: null });
		expect(out).toEqual({ a: ALTERNANCE_COLORS.ecole, b: ALTERNANCE_COLORS.entreprise, c: ALTERNANCE_COLORS.entreprise });
	});

	it('au-delà de trois couleurs, la plus rare est ignorée', () => {
		const days = { a: '#111111', b: '#111111', c: '#222222', d: '#222222', e: '#333333', f: '#333333', g: '#444444' };
		const out = normalizeAlternanceDays(days, null);
		expect(Object.keys(out)).toHaveLength(6);
		expect(out.g).toBeUndefined();
	});

	it('reconnaît le type SANS légende une fois converti (autre appareil, lecture seule)', () => {
		expect(classifyAlternanceColor(ALTERNANCE_COLORS.distanciel, null)).toBe('distanciel');
		const days = normalizeAlternanceDays({ '2026-11-02': '#0000FF', '2026-11-05': '#FF8800' }, xlsxLegend);
		expect(countSchoolDays(days, null, d('2026-11-01'), d('2026-11-30'))).toBe(1);
		expect(alternanceKindsPresent(days)).toEqual(['ecole', 'entreprise']);
	});

	it('rien à convertir : renvoie le même objet (pas de rendu ni d\u2019enregistrement inutile)', () => {
		const days = { '2026-11-02': ALTERNANCE_COLORS.ecole };
		expect(normalizeAlternanceDays(days, xlsxLegend)).toBe(days);
	});

	it('liste les couleurs inconnues, des plus fréquentes aux plus rares', () => {
		expect(unknownAlternanceColors({
			a: '#111111', b: '#222222', c: '#222222', e: ALTERNANCE_COLORS.ecole,
		})).toEqual([{ color: '#222222', days: 2 }, { color: '#111111', days: 1 }]);
	});
});
