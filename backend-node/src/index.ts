import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyMultipart from '@fastify/multipart';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { query as pgQuery } from './services/postgres';
import authRoutes from './routes/auth';
import uploadRoutes from './routes/upload';
import tasksRoutes from './routes/tasks';

const fastify = Fastify({ logger: true });

declare module 'fastify' {
  interface FastifyInstance {
    pg: { query: typeof pgQuery };
    io: Server;
  }
}

fastify.register(fastifyJwt, { secret: process.env.JWT_SECRET! });
fastify.register(fastifyMultipart);
fastify.register(cors, { origin: '*' });

fastify.decorate('pg', { query: pgQuery });

fastify.register(authRoutes);
fastify.register(uploadRoutes);
fastify.register(tasksRoutes);

// Socket.io прикрепляем к существующему серверу fastify
const io = new Server(fastify.server, {
  cors: { origin: '*' },
  transports: ['websocket'],
});
fastify.decorate('io', io);

io.on('connection', (socket) => {
  console.log('Client connected');
  socket.on('disconnect', () => console.log('Client disconnected'));
});

export const emitTaskUpdate = (task: any) => {
  io.emit('taskUpdated', task);
};

const start = async () => {
  try {
    await fastify.listen({ port: 4000, host: '0.0.0.0' });
    console.log('Node.js BFF with WebSocket listening on port 4000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();