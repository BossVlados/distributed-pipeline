import { FastifyInstance } from 'fastify';

export default async function tasksRoutes(fastify: FastifyInstance) {
  fastify.get('/tasks', async (request, reply) => {
    await request.jwtVerify();
    const { userId } = request.user as { userId: number };
    
    const { rows } = await fastify.pg.query(
      `SELECT id, original_filename, status, created_at, updated_at, result
       FROM tasks
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    
    return rows;
  });
  
  fastify.get('/tasks/:id', async (request, reply) => {
    await request.jwtVerify();
    const { userId } = request.user as { userId: number };
    const { id } = request.params as { id: string };
    
    const { rows } = await fastify.pg.query(
      `SELECT id, original_filename, status, minio_path, result, error_message, created_at, updated_at
       FROM tasks
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    
    if (rows.length === 0) {
      return reply.code(404).send({ error: 'Task not found' });
    }
    return rows[0];
  });
}
