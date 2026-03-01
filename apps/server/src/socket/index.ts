import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';

let io: SocketIOServer | null = null;

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.IO not initialized — call setupSocket first');
  }
  return io;
}

export function emitToWallet(walletAddress: string, event: string, data: unknown): void {
  if (!io) return;
  io.to(walletAddress).emit(event, data);
}

export function setupSocket(httpServer: HTTPServer, app: FastifyInstance, corsOrigins: string): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigins === '*' ? true : corsOrigins.split(',').map((s) => s.trim()),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Authentication middleware — verify JWT on connection
  io.use(async (socket, next) => {
    try {
      // Accept token from query param or auth header
      const token =
        (socket.handshake.query.token as string) ||
        socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication required'));
      }

      // Verify the JWT using Fastify's jwt instance
      const payload = app.jwt.verify<{ walletAddress: string; chain: string }>(token);
      socket.data.walletAddress = payload.walletAddress;
      socket.data.chain = payload.chain;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const walletAddress = socket.data.walletAddress as string;

    // Join a room named after the wallet address for targeted messaging
    socket.join(walletAddress);

    // Handle marking threads as read
    socket.on('threads:markRead', async (data: { threadId: string }) => {
      if (!data?.threadId) return;

      try {
        await prisma.threadState.update({
          where: {
            threadId_walletAddress: {
              threadId: data.threadId,
              walletAddress,
            },
          },
          data: {
            lastReadAt: new Date(),
          },
        });
      } catch {
        // ThreadState may not exist — ignore silently
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      socket.leave(walletAddress);
    });
  });

  return io;
}
