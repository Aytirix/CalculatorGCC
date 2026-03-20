import { prisma } from './connection.js';
import type { CalendarData } from '../validators/calendar.validator.js';

export const calendarRepository = {
	async get(userId42: number): Promise<CalendarData | null> {
		const row = await prisma.userSimulation.findUnique({
			where: { userId42 },
			select: { calendarData: true },
		});

		if (!row?.calendarData) return null;
		return row.calendarData as unknown as CalendarData;
	},

	async save(userId42: number, login: string, data: CalendarData): Promise<CalendarData> {
		await prisma.userSimulation.upsert({
			where: { userId42 },
			update: { calendarData: data as object },
			create: {
				userId42,
				login,
				calendarData: data as object,
			},
		});
		return data;
	},
};
