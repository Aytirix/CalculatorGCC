import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodSchema, ZodError } from 'zod';

/**
 * Crée un middleware de validation basé sur Zod
 */
export function validateRequest(schema: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    try {
      if (schema.body) {
        request.body = schema.body.parse(request.body);
      }
      if (schema.query) {
        request.query = schema.query.parse(request.query);
      }
      if (schema.params) {
        request.params = schema.params.parse(request.params);
      }
    } catch (error) {
      if (error instanceof ZodError) {
        reply.code(400).send({
          error: 'Validation Error',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      } else {
        reply.code(400).send({ error: 'Invalid request data' });
      }
    }
  };
}
