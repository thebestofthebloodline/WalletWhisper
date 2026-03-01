import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { authenticate } from '../middleware/auth.js';
import { emitToWallet } from '../socket/index.js';

const SendMessageBodySchema = z.object({
  threadId: z.string().uuid(),
  toWallet: z.string().min(1),
  nonceBase64: z.string().min(1),
  ciphertextBase64: z.string().min(1),
});

export default async function messagesRoutes(app: FastifyInstance): Promise<void> {
  // POST /messages/send — send an encrypted message
  app.post('/send', { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = SendMessageBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Bad Request', details: parsed.error.flatten() });
    }

    const { threadId, toWallet, nonceBase64, ciphertextBase64 } = parsed.data;
    const { walletAddress: fromWallet } = request.user;

    if (fromWallet === toWallet) {
      return reply.code(400).send({ error: 'Cannot send a message to yourself' });
    }

    // Verify the thread exists and the sender is a participant
    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      return reply.code(404).send({ error: 'Thread not found' });
    }

    if (thread.participantA !== fromWallet && thread.participantB !== fromWallet) {
      return reply.code(403).send({ error: 'Not a participant of this thread' });
    }

    // Verify the recipient is also a participant
    if (thread.participantA !== toWallet && thread.participantB !== toWallet) {
      return reply.code(400).send({ error: 'Recipient is not a participant of this thread' });
    }

    // Check if the sender is blocked by the recipient
    const recipientState = await prisma.threadState.findUnique({
      where: {
        threadId_walletAddress: { threadId, walletAddress: toWallet },
      },
    });

    if (recipientState?.isBlocked) {
      return reply.code(403).send({ error: 'You have been blocked by this user' });
    }

    // Rate limiting: check new conversations per day
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Count distinct threads the sender started in the last 24 hours
    const recentThreads = await prisma.message.findMany({
      where: {
        fromWallet,
        createdAt: { gte: dayAgo },
      },
      distinct: ['threadId'],
      select: { threadId: true },
    });

    // Check if this is a new conversation (no prior messages in this thread from sender)
    const priorMessageCount = await prisma.message.count({
      where: { threadId, fromWallet },
    });

    const isNewConversation = priorMessageCount === 0;

    if (isNewConversation) {
      if (recentThreads.length >= env.MAX_NEW_CONVERSATIONS_PER_DAY) {
        return reply.code(429).send({
          error: 'Rate limit exceeded',
          message: `Maximum ${env.MAX_NEW_CONVERSATIONS_PER_DAY} new conversations per day`,
        });
      }

      // Check first-contact rate limit: how many unique wallets this sender
      // has initiated first contact with in the last 24 hours
      const firstContactThreads = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT m."threadId") as count
        FROM messages m
        WHERE m."fromWallet" = ${fromWallet}
          AND m."createdAt" >= ${dayAgo}
          AND m."threadId" NOT IN (
            SELECT m2."threadId"
            FROM messages m2
            WHERE m2."fromWallet" = ${fromWallet}
              AND m2."createdAt" < ${dayAgo}
          )
      `;

      const firstContactCount = Number(firstContactThreads[0]?.count ?? 0);
      if (firstContactCount >= env.MAX_FIRST_CONTACT_PER_DAY) {
        return reply.code(429).send({
          error: 'Rate limit exceeded',
          message: `Maximum ${env.MAX_FIRST_CONTACT_PER_DAY} first-contact conversations per day`,
        });
      }
    }

    // Create the message and update thread in a transaction
    const now = new Date();

    const message = await prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          threadId,
          fromWallet,
          toWallet,
          nonceBase64,
          ciphertextBase64,
        },
      });

      // Update thread lastMessageAt
      await tx.thread.update({
        where: { id: threadId },
        data: { lastMessageAt: now },
      });

      // Auto-create ThreadState for recipient if it doesn't exist
      await tx.threadState.upsert({
        where: {
          threadId_walletAddress: { threadId, walletAddress: toWallet },
        },
        create: {
          threadId,
          walletAddress: toWallet,
          lastReadAt: new Date(0), // epoch — everything is unread
        },
        update: {}, // no-op if it already exists
      });

      // Auto-create ThreadState for sender if it doesn't exist
      await tx.threadState.upsert({
        where: {
          threadId_walletAddress: { threadId, walletAddress: fromWallet },
        },
        create: {
          threadId,
          walletAddress: fromWallet,
          lastReadAt: now, // sender has read their own message
        },
        update: {
          lastReadAt: now, // update sender's read marker
        },
      });

      return msg;
    });

    // Emit real-time event to the recipient
    emitToWallet(toWallet, 'message:new', {
      threadId,
      messageId: message.id,
      fromWallet,
      toWallet,
      nonceBase64,
      ciphertextBase64,
      createdAt: message.createdAt.toISOString(),
    });

    // Compute total unread across all threads for the recipient
    const unreadResult = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM(sub.cnt), 0) as total
      FROM (
        SELECT COUNT(*) as cnt
        FROM messages m
        INNER JOIN thread_states ts
          ON ts."threadId" = m."threadId"
          AND ts."walletAddress" = ${toWallet}
        WHERE m."toWallet" = ${toWallet}
          AND m."createdAt" > ts."lastReadAt"
      ) sub
    `;

    const totalUnread = Number(unreadResult[0]?.total ?? 0);
    emitToWallet(toWallet, 'threads:unread', { totalUnread });

    return reply.send({
      id: message.id,
      threadId: message.threadId,
      fromWallet: message.fromWallet,
      toWallet: message.toWallet,
      nonceBase64: message.nonceBase64,
      ciphertextBase64: message.ciphertextBase64,
      createdAt: message.createdAt.toISOString(),
    });
  });
}
