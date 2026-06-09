import { FastifyInstance } from 'fastify';

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/login', async (request, reply) => {
    const { email } = request.body as { email: string };
    
    // Упрощённо: создаём или находим пользователя по email
    const { rows } = await fastify.pg.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id',
      [email, 'mock_hash']
    );
    const userId = rows[0].id;
    
    const token = fastify.jwt.sign({ userId, email });
    return { token };
  });
}
