import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { minioClient, BUCKET } from '../services/minio';
import { redis } from '../services/redis';

export default async function uploadRoutes(fastify: FastifyInstance) {
  fastify.post('/upload', async (request, reply) => {
    // Аутентификация
    await request.jwtVerify();
    const { userId } = request.user as { userId: number };
    
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No file uploaded' });
    }
    
    const originalFilename = data.filename;
    const fileBuffer = await data.toBuffer();
    const minioPath = `uploads/${randomUUID()}-${originalFilename}`;
    
    // Загружаем в MinIO
    await minioClient.putObject(BUCKET, minioPath, fileBuffer);
    
    // Создаём задачу в БД
    const { rows } = await fastify.pg.query(
      `INSERT INTO tasks (user_id, filename, original_filename, status, minio_path)
       VALUES ($1, $2, $3, 'pending', $4)
       RETURNING id`,
      [userId, minioPath, originalFilename, minioPath]
    );
    const taskId = rows[0].id;
    
    // Отправляем сообщение в Redis Stream
    await redis.xadd('file:uploaded', '*', 
      'task_id', taskId.toString(),
      'user_id', userId.toString(),
      'minio_path', minioPath,
      'original_filename', originalFilename
    );
    
    return { taskId, status: 'pending' };
  });
}
