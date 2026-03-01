import { describe, it, expect } from 'vitest';
import nacl from 'tweetnacl';
import { encodeBase64 } from 'tweetnacl-util';
import {
  generateMessagingKeypair,
  encryptMessage,
  decryptMessage,
  verifyEd25519Signature,
} from '../crypto';

describe('generateMessagingKeypair', () => {
  it('generates valid keypair with base64 encoding', () => {
    const kp = generateMessagingKeypair();
    expect(kp.publicKey).toBeInstanceOf(Uint8Array);
    expect(kp.secretKey).toBeInstanceOf(Uint8Array);
    expect(kp.publicKey.length).toBe(32);
    expect(kp.secretKey.length).toBe(32);
    expect(kp.publicKeyBase64).toBeTruthy();
    expect(kp.secretKeyBase64).toBeTruthy();
  });

  it('generates unique keypairs', () => {
    const kp1 = generateMessagingKeypair();
    const kp2 = generateMessagingKeypair();
    expect(kp1.publicKeyBase64).not.toBe(kp2.publicKeyBase64);
  });
});

describe('E2EE encrypt/decrypt', () => {
  it('round trips correctly', () => {
    const alice = generateMessagingKeypair();
    const bob = generateMessagingKeypair();
    const plaintext = 'Hello from the trenches!';

    const { ciphertextBase64, nonceBase64 } = encryptMessage(
      plaintext,
      bob.publicKey,
      alice.secretKey,
    );

    const decrypted = decryptMessage(
      ciphertextBase64,
      nonceBase64,
      alice.publicKey,
      bob.secretKey,
    );

    expect(decrypted).toBe(plaintext);
  });

  it('handles unicode/emoji messages', () => {
    const alice = generateMessagingKeypair();
    const bob = generateMessagingKeypair();
    const plaintext = 'Yo check this token 🚀 LFG! 日本語テスト';

    const { ciphertextBase64, nonceBase64 } = encryptMessage(
      plaintext,
      bob.publicKey,
      alice.secretKey,
    );

    const decrypted = decryptMessage(
      ciphertextBase64,
      nonceBase64,
      alice.publicKey,
      bob.secretKey,
    );

    expect(decrypted).toBe(plaintext);
  });

  it('handles empty message', () => {
    const alice = generateMessagingKeypair();
    const bob = generateMessagingKeypair();

    const { ciphertextBase64, nonceBase64 } = encryptMessage(
      '',
      bob.publicKey,
      alice.secretKey,
    );

    const decrypted = decryptMessage(
      ciphertextBase64,
      nonceBase64,
      alice.publicKey,
      bob.secretKey,
    );

    expect(decrypted).toBe('');
  });

  it('fails with wrong recipient secret key', () => {
    const alice = generateMessagingKeypair();
    const bob = generateMessagingKeypair();
    const charlie = generateMessagingKeypair();
    const plaintext = 'Secret message';

    const { ciphertextBase64, nonceBase64 } = encryptMessage(
      plaintext,
      bob.publicKey,
      alice.secretKey,
    );

    expect(() =>
      decryptMessage(ciphertextBase64, nonceBase64, alice.publicKey, charlie.secretKey),
    ).toThrow('Decryption failed');
  });

  it('fails with wrong sender public key', () => {
    const alice = generateMessagingKeypair();
    const bob = generateMessagingKeypair();
    const charlie = generateMessagingKeypair();
    const plaintext = 'Secret message';

    const { ciphertextBase64, nonceBase64 } = encryptMessage(
      plaintext,
      bob.publicKey,
      alice.secretKey,
    );

    expect(() =>
      decryptMessage(ciphertextBase64, nonceBase64, charlie.publicKey, bob.secretKey),
    ).toThrow('Decryption failed');
  });

  it('produces different ciphertexts for same plaintext (random nonce)', () => {
    const alice = generateMessagingKeypair();
    const bob = generateMessagingKeypair();
    const plaintext = 'Same message twice';

    const enc1 = encryptMessage(plaintext, bob.publicKey, alice.secretKey);
    const enc2 = encryptMessage(plaintext, bob.publicKey, alice.secretKey);

    expect(enc1.ciphertextBase64).not.toBe(enc2.ciphertextBase64);
    expect(enc1.nonceBase64).not.toBe(enc2.nonceBase64);
  });
});

describe('verifyEd25519Signature', () => {
  it('verifies a valid signature', () => {
    const kp = nacl.sign.keyPair();
    const message = 'Test message for signing';
    const msgBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(msgBytes, kp.secretKey);
    const sigBase64 = encodeBase64(signature);

    const valid = verifyEd25519Signature(message, sigBase64, kp.publicKey);
    expect(valid).toBe(true);
  });

  it('rejects a tampered message', () => {
    const kp = nacl.sign.keyPair();
    const message = 'Original message';
    const msgBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(msgBytes, kp.secretKey);
    const sigBase64 = encodeBase64(signature);

    const valid = verifyEd25519Signature('Tampered message', sigBase64, kp.publicKey);
    expect(valid).toBe(false);
  });

  it('rejects a wrong public key', () => {
    const kp1 = nacl.sign.keyPair();
    const kp2 = nacl.sign.keyPair();
    const message = 'Test message';
    const msgBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(msgBytes, kp1.secretKey);
    const sigBase64 = encodeBase64(signature);

    const valid = verifyEd25519Signature(message, sigBase64, kp2.publicKey);
    expect(valid).toBe(false);
  });
});
