import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bs58 from 'bs58';
import { prisma } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { verifyEd25519Signature } from '@walletwhisper/shared';

const RegisterKeyBodySchema = z.object({
  msgPubKeyBase64: z.string().min(1),
  bindingSignatureBase64: z.string().min(1).optional(),
  bindingMessage: z.string().min(1).optional(),
});

const WalletParamSchema = z.object({
  walletAddress: z.string().min(1),
});

export default async function keysRoutes(app: FastifyInstance): Promise<void> {
  // POST /keys/register — register a messaging public key (auth required)
  app.post('/register', { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = RegisterKeyBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Bad Request', details: parsed.error.flatten() });
    }

    const { msgPubKeyBase64, bindingSignatureBase64, bindingMessage } = parsed.data;
    const { walletAddress } = request.user;

    // If binding signature is provided, verify it (standard Phantom flow)
    if (bindingSignatureBase64 && bindingMessage) {
      // Verify the binding message contains the wallet address and the key
      if (!bindingMessage.includes(walletAddress) || !bindingMessage.includes(msgPubKeyBase64)) {
        return reply.code(400).send({
          error: 'Binding message must contain the wallet address and public key',
        });
      }

      // Verify the binding signature (wallet's ed25519 key signed the registration message)
      try {
        const publicKeyBytes = bs58.decode(walletAddress);
        const isValid = verifyEd25519Signature(bindingMessage, bindingSignatureBase64, publicKeyBytes);
        if (!isValid) {
          return reply.code(401).send({ error: 'Binding signature verification failed' });
        }
      } catch {
        return reply.code(400).send({ error: 'Invalid signature format' });
      }
    }
    // If no binding signature, the JWT itself serves as proof of ownership (Firebase auth flow)

    // Store the key
    await prisma.userWallet.update({
      where: { walletAddress },
      data: {
        msgPubKeyBase64,
        msgKeyBindingSignatureBase64: bindingSignatureBase64 ?? null,
      },
    });

    return reply.send({ success: true, msgPubKeyBase64 });
  });

  // GET /keys/:walletAddress — get the public messaging key for any wallet
  app.get('/:walletAddress', async (request, reply) => {
    const parsed = WalletParamSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Bad Request', details: parsed.error.flatten() });
    }

    const { walletAddress } = parsed.data;

    const user = await prisma.userWallet.findUnique({
      where: { walletAddress },
      select: { msgPubKeyBase64: true },
    });

    if (!user || !user.msgPubKeyBase64) {
      return reply.code(404).send({ error: 'Public key not found for this wallet' });
    }

    return reply.send({ msgPubKeyBase64: user.msgPubKeyBase64 });
  });
}
