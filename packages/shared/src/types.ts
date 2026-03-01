// ─── Chain Types ───
export type Chain = 'solana' | 'evm';

// ─── Auth ───
export interface ChallengeRequest {
  walletAddress: string;
  chain: Chain;
}

export interface ChallengeResponse {
  nonce: string;
  expiresAt: string; // ISO 8601
}

export interface VerifyRequest {
  walletAddress: string;
  chain: Chain;
  nonce: string;
  signatureBase64: string;
  message: string;
}

export interface VerifyResponse {
  jwt: string;
  user: {
    walletAddress: string;
    chain: Chain;
  };
}

// ─── Keys ───
export interface RegisterKeyRequest {
  msgPubKeyBase64: string;
  bindingSignatureBase64: string;
  bindingMessage: string;
}

export interface PublicKeyResponse {
  msgPubKeyBase64: string;
}

// ─── Threads ───
export interface OpenThreadRequest {
  peerWalletAddress: string;
}

export interface OpenThreadResponse {
  threadId: string;
}

export interface ThreadSummary {
  id: string;
  peerWalletAddress: string;
  lastMessageAt: string | null;
  lastMessageCiphertext: string | null;
  lastMessageNonce: string | null;
  lastMessageFromWallet: string | null;
  unreadCount: number;
  isAccepted: boolean;
  createdAt: string;
}

// ─── Messages ───
export interface SendMessageRequest {
  threadId: string;
  toWallet: string;
  nonceBase64: string;
  ciphertextBase64: string;
}

export interface MessageData {
  id: string;
  threadId: string;
  fromWallet: string;
  toWallet: string;
  nonceBase64: string;
  ciphertextBase64: string;
  createdAt: string;
}

// ─── Moderation ───
export interface BlockRequest {
  walletAddress: string;
}

export interface ReportRequest {
  walletAddress: string;
  reason?: string;
}

// ─── Socket Events ───
export interface SocketNewMessage {
  threadId: string;
  messageId: string;
  fromWallet: string;
  toWallet: string;
  nonceBase64: string;
  ciphertextBase64: string;
  createdAt: string;
}

export interface SocketUnreadUpdate {
  totalUnread: number;
}

export interface SocketMarkRead {
  threadId: string;
}

// ─── Challenge message builders ───
export function buildLoginMessage(params: {
  walletAddress: string;
  nonce: string;
  issuedAt: string;
  domain: string;
}): string {
  return [
    'WalletWhisper Login',
    `wallet: ${params.walletAddress}`,
    `nonce: ${params.nonce}`,
    `issuedAt: ${params.issuedAt}`,
    `domain: ${params.domain}`,
  ].join('\n');
}

export function buildKeyRegistrationMessage(params: {
  walletAddress: string;
  msgPubKeyBase64: string;
  timestamp: string;
}): string {
  return [
    'WalletWhisper Messaging Key Registration',
    `wallet: ${params.walletAddress}`,
    `msgPubKey: ${params.msgPubKeyBase64}`,
    `timestamp: ${params.timestamp}`,
  ].join('\n');
}
