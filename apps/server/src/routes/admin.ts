import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db.js';
import { env } from '../env.js';

async function adminAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.headers['x-admin-token'];

  if (!env.ADMIN_TOKEN) {
    reply.code(503).send({ error: 'Admin API not configured' });
    return;
  }

  if (token !== env.ADMIN_TOKEN) {
    reply.code(401).send({ error: 'Invalid admin token' });
    return;
  }
}

export default async function adminRoutes(app: FastifyInstance): Promise<void> {
  // All admin routes require the admin token
  app.addHook('preHandler', adminAuth);

  // GET /admin/reports — list recent reports
  app.get('/reports', async (request, reply) => {
    const limit = Math.min(
      parseInt((request.query as Record<string, string>).limit || '50', 10),
      200,
    );
    const offset = parseInt((request.query as Record<string, string>).offset || '0', 10);

    const reports = await prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await prisma.report.count();

    return reply.send({
      reports: reports.map((r) => ({
        id: r.id,
        reporterWallet: r.reporterWallet,
        reportedWallet: r.reportedWallet,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
    });
  });

  // GET /admin/spammers — list wallets with the most messages sent (potential spammers)
  app.get('/spammers', async (request, reply) => {
    const limit = Math.min(
      parseInt((request.query as Record<string, string>).limit || '20', 10),
      100,
    );
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find wallets that have sent the most messages in the last 24 hours
    const spammers = await prisma.$queryRaw<
      { fromWallet: string; messageCount: bigint; uniqueThreads: bigint }[]
    >`
      SELECT
        m."fromWallet",
        COUNT(*) as "messageCount",
        COUNT(DISTINCT m."threadId") as "uniqueThreads"
      FROM messages m
      WHERE m."createdAt" >= ${dayAgo}
      GROUP BY m."fromWallet"
      ORDER BY COUNT(*) DESC
      LIMIT ${limit}
    `;

    return reply.send({
      spammers: spammers.map((s) => ({
        walletAddress: s.fromWallet,
        messageCount: Number(s.messageCount),
        uniqueThreads: Number(s.uniqueThreads),
      })),
    });
  });
}
