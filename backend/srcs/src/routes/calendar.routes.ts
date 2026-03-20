import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '../middlewares/auth.middleware.js';
import { CalendarController } from '../controllers/calendar.controller.js';

export async function calendarRoutes(fastify: FastifyInstance) {
	fastify.get('/calendar', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return CalendarController.get(request, reply);
	});

	fastify.put('/calendar', {
		preHandler: authenticate,
	}, async (request: FastifyRequest, reply: FastifyReply) => {
		return CalendarController.save(request, reply);
	});
}
