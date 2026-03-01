import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { canonicalThreadPair } from '@walletwhisper/shared';

const BlockBodySchema = z.object({
  walletAddress: z.string().min(1),
});

const ReportBodySchema = z.object({
  walletAddress: z.string().min(1),
  reason: z.string().max(1000).optional(),
});

export default async function moderationRoutes(app: FastifyInstance): Promise<void> {
  // POST /block — block a wallet
  app.post('/block', { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = BlockBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Bad Request', details: parsed.error.flatten() });
    }

    const { walletAddress: targetWallet } = parsed.data;
    const { walletAddress: myWallet } = request.user;

    if (myWallet === targetWallet) {
      return reply.code(400).send({ error: 'Cannot block yourself' });
    }

    // Find the thread between these two wallets
    const [participantA, participantB] = canonicalThreadPair(myWallet, targetWallet);

    const thread = await prisma.thread.findUnique({
      where: {
        participantA_participantB: { participantA, participantB },
      },
    });

    if (!thread) {
      return reply.code(404).send({ error: 'No thread exists with this wallet' });
    }

    // Update the blocker's ThreadState to mark isBlocked = true
    // "isBlocked" on my state means I am blocking the other person
    await prisma.threadState.upsert({
      where: {
        threadId_walletAddress: { threadId: thread.id, walletAddress: myWallet },
      },
      create: {
        threadId: thread.id,
        walletAddress: myWallet,
        isBlocked: true,
      },
      update: {
        isBlocked: true,
      },
    });

    return reply.send({ success: true });
  });

  // POST /report — report a wallet
  app.post('/report', { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = ReportBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Bad Request', details: parsed.error.flatten() });
    }

    const { walletAddress: reportedWallet, reason } = parsed.data;
    const { walletAddress: reporterWallet } = request.user;

    if (reporterWallet === reportedWallet) {
      return reply.code(400).send({ error: 'Cannot report yourself' });
    }

    await prisma.report.create({
      data: {
        reporterWallet,
        reportedWallet,
        reason: reason ?? null,
      },
    });

    return reply.send({ success: true });
  });
}
