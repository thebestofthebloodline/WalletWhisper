import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import crypto from 'node:crypto';
import bs58 from 'bs58';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { verifyEd25519Signature } from '@walletwhisper/shared';

const ChallengeBodySchema = z.object({
  walletAddress: z.string().min(1),
  chain: z.enum(['solana', 'evm']),
});

const FirebaseBodySchema = z.object({
  firebaseIdToken: z.string().min(1),
  walletAddress: z.string().min(1),
});

// Google public keys cache for Firebase token verification
let googlePublicKeysCache: Record<string, string> = {};
let googleKeysCacheExpiry = 0;

async function getGooglePublicKeys(): Promise<Record<string, string>> {
  if (Date.now() < googleKeysCacheExpiry && Object.keys(googlePublicKeysCache).length > 0) {
    return googlePublicKeysCache;
  }
  const resp = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
  );
  if (!resp.ok) {
    throw new Error(`Failed to fetch Google public keys: ${resp.status}`);
  }
  googlePublicKeysCache = (await resp.json()) as Record<string, string>;
  // Cache for 1 hour
  googleKeysCacheExpiry = Date.now() + 60 * 60 * 1000;
  return googlePublicKeysCache;
}

function decodeJwtPart(part: string): Record<string, unknown> {
  const padded = part.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
}

const VerifyBodySchema = z.object({
  walletAddress: z.string().min(1),
  chain: z.enum(['solana', 'evm']),
  nonce: z.string().min(1),
  signatureBase64: z.string().min(1),
  message: z.string().min(1),
});

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /auth/challenge — generate a nonce for wallet signature
  app.post('/challenge', async (request, reply) => {
    const parsed = ChallengeBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Bad Request', details: parsed.error.flatten() });
    }

    const { walletAddress, chain } = parsed.data;

    // Clean up any expired challenges for this wallet
    await prisma.authChallenge.deleteMany({
      where: {
        walletAddress,
        expiresAt: { lt: new Date() },
      },
    });

    const nonce = nanoid(32);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await prisma.authChallenge.create({
      data: {
        walletAddress,
        nonce,
        expiresAt,
      },
    });

    return reply.send({
      nonce,
      expiresAt: expiresAt.toISOString(),
    });
  });

  // POST /auth/verify — verify signed message and issue JWT
  app.post('/verify', async (request, reply) => {
    const parsed = VerifyBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Bad Request', details: parsed.error.flatten() });
    }

    const { walletAddress, chain, nonce, signatureBase64, message } = parsed.data;

    // Look up the challenge
    const challenge = await prisma.authChallenge.findUnique({
      where: { nonce },
    });

    if (!challenge) {
      return reply.code(401).send({ error: 'Invalid or expired nonce' });
    }

    if (challenge.walletAddress !== walletAddress) {
      return reply.code(401).send({ error: 'Nonce does not match wallet' });
    }

    if (challenge.used) {
      return reply.code(401).send({ error: 'Nonce already used' });
    }

    if (challenge.expiresAt < new Date()) {
      return reply.code(401).send({ error: 'Nonce expired' });
    }

    // Verify the message contains the nonce
    if (!message.includes(nonce)) {
      return reply.code(401).send({ error: 'Message does not contain the expected nonce' });
    }

    // Verify the signature
    let isValid = false;

    if (chain === 'solana') {
      try {
        // Decode the Solana wallet address from base58 to get the 32-byte ed25519 public key
        const publicKeyBytes = bs58.decode(walletAddress);
        isValid = verifyEd25519Signature(message, signatureBase64, publicKeyBytes);
      } catch {
        return reply.code(401).send({ error: 'Invalid wallet address or signature format' });
      }
    } else {
      // EVM signature verification would go here in the future
      return reply.code(400).send({ error: 'EVM chain not yet supported' });
    }

    if (!isValid) {
      return reply.code(401).send({ error: 'Signature verification failed' });
    }

    // Mark the challenge as used
    await prisma.authChallenge.update({
      where: { nonce },
      data: { used: true },
    });

    // Upsert the user wallet record
    const userWallet = await prisma.userWallet.upsert({
      where: { walletAddress },
      update: { chain },
      create: { walletAddress, chain },
    });

    // Issue JWT
    const token = app.jwt.sign(
      { walletAddress: userWallet.walletAddress, chain: userWallet.chain },
      { expiresIn: env.JWT_EXPIRES_IN },
    );

    return reply.send({
      jwt: token,
      user: {
        walletAddress: userWallet.walletAddress,
        chain: userWallet.chain,
      },
    });
  });

  // POST /auth/firebase — verify Firebase ID token and issue WalletWhisper JWT
  app.post('/firebase', async (request, reply) => {
    const parsed = FirebaseBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Bad Request', details: parsed.error.flatten() });
    }

    const { firebaseIdToken, walletAddress } = parsed.data;

    try {
      // Decode JWT header and payload without verification first
      const [headerB64, payloadB64, signatureB64] = firebaseIdToken.split('.');
      if (!headerB64 || !payloadB64 || !signatureB64) {
        return reply.code(401).send({ error: 'Malformed Firebase token' });
      }

      const header = decodeJwtPart(headerB64) as { kid?: string; alg?: string };
      const payload = decodeJwtPart(payloadB64) as {
        exp?: number;
        iss?: string;
        aud?: string;
        sub?: string;
      };

      if (header.alg !== 'RS256' || !header.kid) {
        return reply.code(401).send({ error: 'Invalid token algorithm or missing kid' });
      }

      // Determine project ID — from env or from the token's aud claim
      const projectId = env.FIREBASE_PROJECT_ID || (payload.aud as string);
      if (!projectId) {
        return reply.code(500).send({ error: 'Firebase project ID not configured' });
      }

      // Verify expiration
      if (!payload.exp || payload.exp * 1000 < Date.now()) {
        return reply.code(401).send({ error: 'Firebase token expired' });
      }

      // Verify issuer
      const expectedIssuer = `https://securetoken.google.com/${projectId}`;
      if (payload.iss !== expectedIssuer) {
        return reply.code(401).send({ error: 'Invalid token issuer' });
      }

      // Fetch Google's public keys and verify signature
      const publicKeys = await getGooglePublicKeys();
      const certPem = publicKeys[header.kid];
      if (!certPem) {
        return reply.code(401).send({ error: 'Unknown signing key' });
      }

      const publicKey = crypto.createPublicKey(certPem);
      const signedData = `${headerB64}.${payloadB64}`;
      const signature = Buffer.from(
        signatureB64.replace(/-/g, '+').replace(/_/g, '/'),
        'base64',
      );

      const isValid = crypto.verify(
        'sha256',
        Buffer.from(signedData),
        publicKey,
        signature,
      );

      if (!isValid) {
        return reply.code(401).send({ error: 'Firebase token signature verification failed' });
      }

      // Token is valid — upsert the user wallet record
      const userWallet = await prisma.userWallet.upsert({
        where: { walletAddress },
        update: { chain: 'solana' },
        create: { walletAddress, chain: 'solana' },
      });

      // Issue WalletWhisper JWT
      const token = app.jwt.sign(
        { walletAddress: userWallet.walletAddress, chain: userWallet.chain },
        { expiresIn: env.JWT_EXPIRES_IN },
      );

      return reply.send({
        jwt: token,
        user: {
          walletAddress: userWallet.walletAddress,
          chain: userWallet.chain,
        },
      });
    } catch (err) {
      if (reply.sent) return;
      const message = err instanceof Error ? err.message : 'Firebase auth failed';
      return reply.code(401).send({ error: message });
    }
  });
}
