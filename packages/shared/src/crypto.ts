import nacl from 'tweetnacl';
import { decodeUTF8, encodeUTF8, encodeBase64, decodeBase64 } from 'tweetnacl-util';

// ─── E2EE Messaging Keypair ───

export function generateMessagingKeypair(): {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  publicKeyBase64: string;
  secretKeyBase64: string;
} {
  const kp = nacl.box.keyPair();
  return {
    publicKey: kp.publicKey,
    secretKey: kp.secretKey,
    publicKeyBase64: encodeBase64(kp.publicKey),
    secretKeyBase64: encodeBase64(kp.secretKey),
  };
}

// ─── Encrypt / Decrypt ───

export function encryptMessage(
  plaintext: string,
  recipientPubKey: Uint8Array,
  senderSecretKey: Uint8Array,
): { ciphertextBase64: string; nonceBase64: string } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const messageBytes = decodeUTF8(plaintext);
  const encrypted = nacl.box(messageBytes, nonce, recipientPubKey, senderSecretKey);
  if (!encrypted) {
    throw new Error('Encryption failed');
  }
  return {
    ciphertextBase64: encodeBase64(encrypted),
    nonceBase64: encodeBase64(nonce),
  };
}

export function decryptMessage(
  ciphertextBase64: string,
  nonceBase64: string,
  senderPubKey: Uint8Array,
  recipientSecretKey: Uint8Array,
): string {
  const ciphertext = decodeBase64(ciphertextBase64);
  const nonce = decodeBase64(nonceBase64);
  const decrypted = nacl.box.open(ciphertext, nonce, senderPubKey, recipientSecretKey);
  if (!decrypted) {
    throw new Error('Decryption failed — invalid key or corrupted message');
  }
  return encodeUTF8(decrypted);
}

// ─── Solana Ed25519 Signature Verification ───

export function verifyEd25519Signature(
  message: string,
  signatureBase64: string,
  publicKeyBytes: Uint8Array,
): boolean {
  const messageBytes = decodeUTF8(message);
  const signatureBytes = decodeBase64(signatureBase64);
  return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
}

// ─── Helpers ───

export { encodeBase64, decodeBase64, decodeUTF8, encodeUTF8 };
