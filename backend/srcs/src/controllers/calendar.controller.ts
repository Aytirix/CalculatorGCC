import { FastifyRequest, FastifyReply } from 'fastify';
import { calendarRepository } from '../db/calendarRepository.js';
import { CalendarDataSchema } from '../validators/calendar.validator.js';

export const CalendarController = {
	async get(request: FastifyRequest, reply: FastifyReply) {
		const { user_id_42 } = request.user;
		const data = await calendarRepository.get(user_id_42);

		if (!data) return reply.code(204).send();
		return reply.send(data);
	},

	async save(request: FastifyRequest, reply: FastifyReply) {
		const { user_id_42, login } = request.user;

		const parsed = CalendarDataSchema.safeParse(request.body);
		if (!parsed.success) {
			return reply.code(400).send({
				error: 'Invalid calendar data',
				details: parsed.error.flatten().fieldErrors,
			});
		}

		const saved = await calendarRepository.save(user_id_42, login, parsed.data);
		return reply.send(saved);
	},
};
