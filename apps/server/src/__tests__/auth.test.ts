import { describe, it, expect } from 'vitest';
import nacl from 'tweetnacl';
import { encodeBase64 } from 'tweetnacl-util';
import bs58 from 'bs58';
import { verifyEd25519Signature, buildLoginMessage } from '@walletwhisper/shared';

describe('Auth: Solana signature verification', () => {
  it('verifies a valid Solana login signature', () => {
    // Generate a Solana-style ed25519 keypair
    const kp = nacl.sign.keyPair();
    const walletAddress = bs58.encode(kp.publicKey);

    const nonce = 'test-nonce-12345';
    const issuedAt = new Date().toISOString();

    const message = buildLoginMessage({
      walletAddress,
      nonce,
      issuedAt,
      domain: 'https://example.com',
    });

    // Sign the message
    const msgBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(msgBytes, kp.secretKey);
    const signatureBase64 = encodeBase64(signature);

    // Verify
    const publicKeyBytes = bs58.decode(walletAddress);
    const isValid = verifyEd25519Signature(message, signatureBase64, publicKeyBytes);
    expect(isValid).toBe(true);
  });

  it('rejects a signature from a different wallet', () => {
    const kp1 = nacl.sign.keyPair();
    const kp2 = nacl.sign.keyPair();
    const walletAddress = bs58.encode(kp1.publicKey);

    const message = buildLoginMessage({
      walletAddress,
      nonce: 'test-nonce',
      issuedAt: new Date().toISOString(),
      domain: 'https://example.com',
    });

    // Sign with kp2's secret key (wrong wallet)
    const msgBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(msgBytes, kp2.secretKey);
    const signatureBase64 = encodeBase64(signature);

    // Verify against kp1's public key — should fail
    const publicKeyBytes = bs58.decode(walletAddress);
    const isValid = verifyEd25519Signature(message, signatureBase64, publicKeyBytes);
    expect(isValid).toBe(false);
  });

  it('rejects a modified message', () => {
    const kp = nacl.sign.keyPair();
    const walletAddress = bs58.encode(kp.publicKey);

    const originalMessage = buildLoginMessage({
      walletAddress,
      nonce: 'nonce-123',
      issuedAt: new Date().toISOString(),
      domain: 'https://example.com',
    });

    // Sign the original message
    const msgBytes = new TextEncoder().encode(originalMessage);
    const signature = nacl.sign.detached(msgBytes, kp.secretKey);
    const signatureBase64 = encodeBase64(signature);

    // Modify the message
    const tamperedMessage = originalMessage.replace('nonce-123', 'nonce-456');

    const publicKeyBytes = bs58.decode(walletAddress);
    const isValid = verifyEd25519Signature(tamperedMessage, signatureBase64, publicKeyBytes);
    expect(isValid).toBe(false);
  });
});

describe('Auth: message format', () => {
  it('buildLoginMessage includes all required fields', () => {
    const msg = buildLoginMessage({
      walletAddress: 'TestWallet123',
      nonce: 'abc123',
      issuedAt: '2024-01-01T00:00:00.000Z',
      domain: 'https://trade.example.com',
    });

    expect(msg).toContain('WalletWhisper Login');
    expect(msg).toContain('wallet: TestWallet123');
    expect(msg).toContain('nonce: abc123');
    expect(msg).toContain('issuedAt: 2024-01-01T00:00:00.000Z');
    expect(msg).toContain('domain: https://trade.example.com');
  });
});
