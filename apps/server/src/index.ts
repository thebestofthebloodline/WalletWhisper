import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { createServer } from 'node:http';
import { env } from './env.js';
import { prisma } from './db.js';
import { setupSocket } from './socket/index.js';
import authRoutes from './routes/auth.js';
import keysRoutes from './routes/keys.js';
import threadsRoutes from './routes/threads.js';
import messagesRoutes from './routes/messages.js';
import moderationRoutes from './routes/moderation.js';
import adminRoutes from './routes/admin.js';

async function main() {
  // Create a raw HTTP server so we can share it between Fastify and Socket.IO
  const httpServer = createServer();

  const app = Fastify({
    serverFactory: (handler) => {
      httpServer.on('request', handler);
      return httpServer;
    },
    logger: {
      level: 'info',
    },
  });

  // ─── Plugins ───

  await app.register(cors, {
    origin: env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true,
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // ─── Routes ───

  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(keysRoutes, { prefix: '/keys' });
  await app.register(threadsRoutes, { prefix: '/threads' });
  await app.register(messagesRoutes, { prefix: '/messages' });
  await app.register(moderationRoutes, { prefix: '/moderation' });
  await app.register(adminRoutes, { prefix: '/admin' });

  // ─── Health check ───

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // ─── Socket.IO ───

  setupSocket(httpServer, app, env.CORS_ORIGINS);

  // ─── Start server ───

  await app.ready();

  httpServer.listen(env.PORT, env.HOST, () => {
    app.log.info(`Server listening on http://${env.HOST}:${env.PORT}`);
  });

  // ─── Graceful shutdown ───

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);

    // Close Socket.IO connections
    const { getIO } = await import('./socket/index.js');
    try {
      getIO().close();
    } catch {
      // Socket.IO may not be initialized
    }

    // Close HTTP server
    httpServer.close();

    // Close Fastify
    await app.close();

    // Disconnect Prisma
    await prisma.$disconnect();

    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
