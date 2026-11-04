import { describe, it, expect } from 'vitest';
import { CalendarDataSchema } from './calendar.validator';

const base = {
	placedProjects: [{
		id: 'webserv-1', projectId: 'webserv', name: 'webserv', xp: 21630,
		startDate: '2026-10-18T22:00:00.000Z', endDate: '2026-11-09T23:00:00.000Z', row: 0,
	}],
	dateRange: { start: '2026-07-01', end: '2027-12-31' },
	alternanceDays: { '2026-11-02': '#1D3F99' },
};

const withRange = (start: string, end: string) => ({ ...base, dateRange: { start, end } });

describe('CalendarDataSchema — période', () => {
	it('accepte une période normale (contrat de 18 mois)', () => {
		expect(CalendarDataSchema.safeParse(base).success).toBe(true);
	});

	it('refuse une période géante qui figerait le navigateur des visiteurs', () => {
		expect(CalendarDataSchema.safeParse(withRange('1000-01-01', '9999-12-31')).success).toBe(false);
	});

	it('refuse une période hors 2000–2100', () => {
		expect(CalendarDataSchema.safeParse(withRange('1999-12-31', '2000-06-01')).success).toBe(false);
		expect(CalendarDataSchema.safeParse(withRange('2100-01-01', '2101-01-01')).success).toBe(false);
	});

	it('accepte jusqu’à 3660 jours, refuse au-delà', () => {
		expect(CalendarDataSchema.safeParse(withRange('2026-01-01', '2036-01-08')).success).toBe(true); // 3659 j
		expect(CalendarDataSchema.safeParse(withRange('2026-01-01', '2036-01-12')).success).toBe(false); // 3663 j
	});

	it('refuse toujours une fin avant le début', () => {
		expect(CalendarDataSchema.safeParse(withRange('2027-01-01', '2026-01-01')).success).toBe(false);
	});
});
