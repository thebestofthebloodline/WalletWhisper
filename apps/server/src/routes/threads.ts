import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { canonicalThreadPair } from '@walletwhisper/shared';

const OpenThreadBodySchema = z.object({
  peerWalletAddress: z.string().min(1),
});

const ThreadIdParamSchema = z.object({
  threadId: z.string().uuid(),
});

const PaginationQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export default async function threadsRoutes(app: FastifyInstance): Promise<void> {
  // POST /threads/open — create or return existing thread between two wallets
  app.post('/open', { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = OpenThreadBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Bad Request', details: parsed.error.flatten() });
    }

    const { walletAddress } = request.user;
    const { peerWalletAddress } = parsed.data;

    if (walletAddress === peerWalletAddress) {
      return reply.code(400).send({ error: 'Cannot open a thread with yourself' });
    }

    const [participantA, participantB] = canonicalThreadPair(walletAddress, peerWalletAddress);

    // Try to find an existing thread
    let thread = await prisma.thread.findUnique({
      where: {
        participantA_participantB: { participantA, participantB },
      },
    });

    if (!thread) {
      // Create the thread and both ThreadState records in a transaction
      // The opener's side is auto-accepted
      thread = await prisma.$transaction(async (tx) => {
        const newThread = await tx.thread.create({
          data: { participantA, participantB },
        });

        await tx.threadState.createMany({
          data: [
            { threadId: newThread.id, walletAddress: participantA, isAccepted: participantA === walletAddress },
            { threadId: newThread.id, walletAddress: participantB, isAccepted: participantB === walletAddress },
          ],
        });

        return newThread;
      });
    } else {
      // Thread already exists — make sure the opener's side is accepted
      await prisma.threadState.updateMany({
        where: { threadId: thread.id, walletAddress },
        data: { isAccepted: true },
      });
    }

    return reply.send({ threadId: thread.id });
  });

  // GET /threads — list threads for the authenticated wallet
  app.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const { walletAddress } = request.user;

    // Find all threads where this wallet is a participant
    const threads = await prisma.thread.findMany({
      where: {
        OR: [
          { participantA: walletAddress },
          { participantB: walletAddress },
        ],
      },
      orderBy: {
        lastMessageAt: { sort: 'desc', nulls: 'last' },
      },
      include: {
        states: {
          where: { walletAddress },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const summaries = await Promise.all(
      threads.map(async (thread) => {
        const peerWalletAddress =
          thread.participantA === walletAddress
            ? thread.participantB
            : thread.participantA;

        const state = thread.states[0];
        const lastMessage = thread.messages[0] || null;

        // Count unread messages (messages created after lastReadAt)
        const unreadCount = state
          ? await prisma.message.count({
              where: {
                threadId: thread.id,
                createdAt: { gt: state.lastReadAt },
                fromWallet: { not: walletAddress },
              },
            })
          : 0;

        return {
          id: thread.id,
          peerWalletAddress,
          lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
          lastMessageCiphertext: lastMessage?.ciphertextBase64 ?? null,
          lastMessageNonce: lastMessage?.nonceBase64 ?? null,
          lastMessageFromWallet: lastMessage?.fromWallet ?? null,
          unreadCount,
          isAccepted: state?.isAccepted ?? false,
          createdAt: thread.createdAt.toISOString(),
        };
      }),
    );

    return reply.send({ threads: summaries });
  });

  // POST /threads/:threadId/accept — accept a thread (move from requests to inbox)
  app.post('/:threadId/accept', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsParsed = ThreadIdParamSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      return reply.code(400).send({ error: 'Bad Request', details: paramsParsed.error.flatten() });
    }

    const { threadId } = paramsParsed.data;
    const { walletAddress } = request.user;

    // Verify the thread exists and the user is a participant
    const thread = await prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread) {
      return reply.code(404).send({ error: 'Thread not found' });
    }
    if (thread.participantA !== walletAddress && thread.participantB !== walletAddress) {
      return reply.code(403).send({ error: 'Not a participant of this thread' });
    }

    await prisma.threadState.updateMany({
      where: { threadId, walletAddress },
      data: { isAccepted: true },
    });

    return reply.code(204).send();
  });

  // GET /threads/:threadId/messages — get messages for a thread (paginated)
  app.get('/:threadId/messages', { preHandler: [authenticate] }, async (request, reply) => {
    const paramsParsed = ThreadIdParamSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      return reply.code(400).send({ error: 'Bad Request', details: paramsParsed.error.flatten() });
    }

    const queryParsed = PaginationQuerySchema.safeParse(request.query);
    if (!queryParsed.success) {
      return reply.code(400).send({ error: 'Bad Request', details: queryParsed.error.flatten() });
    }

    const { threadId } = paramsParsed.data;
    const { cursor, limit } = queryParsed.data;
    const { walletAddress } = request.user;

    // Verify the thread exists and the user is a participant
    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      return reply.code(404).send({ error: 'Thread not found' });
    }

    if (thread.participantA !== walletAddress && thread.participantB !== walletAddress) {
      return reply.code(403).send({ error: 'Not a participant of this thread' });
    }

    // Fetch messages with cursor-based pagination (newest first)
    const messages = await prisma.message.findMany({
      where: {
        threadId,
        ...(cursor ? { createdAt: { lt: (await prisma.message.findUnique({ where: { id: cursor } }))?.createdAt } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const data = messages.map((msg) => ({
      id: msg.id,
      threadId: msg.threadId,
      fromWallet: msg.fromWallet,
      toWallet: msg.toWallet,
      nonceBase64: msg.nonceBase64,
      ciphertextBase64: msg.ciphertextBase64,
      createdAt: msg.createdAt.toISOString(),
    }));

    const nextCursor = messages.length === limit ? messages[messages.length - 1].id : null;

    return reply.send({ messages: data, nextCursor });
  });
}
