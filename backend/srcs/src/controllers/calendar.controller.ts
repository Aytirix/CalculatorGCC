import { FastifyRequest, FastifyReply } from 'fastify';
import { calendarRepository } from '../db/calendarRepository.js';
import { CalendarDataSchema } from '../validators/calendar.validator.js';
import { simulationRepository } from '../db/simulationRepository.js';

export const CalendarController = {
	async get(request: FastifyRequest, reply: FastifyReply) {
		const { user_id_42 } = request.user;
		const { view_user_id } = request.query as { view_user_id?: string };

		let targetId = user_id_42;

		if (view_user_id) {
			const parsed = parseInt(view_user_id, 10);
			if (!isNaN(parsed) && parsed > 0) {
				const pub = await simulationRepository.isPublic(parsed);
				if (!pub) return reply.code(403).send({ error: 'This profile is private' });
				targetId = parsed;
			}
		}

		const data = await calendarRepository.get(targetId);

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
