/**
 * API client for WalletWhisper backend.
 * All HTTP calls go through this module with automatic JWT injection.
 */

import { getToken, getSettings } from './storage';
import type {
  ChallengeResponse,
  VerifyResponse,
  PublicKeyResponse,
  OpenThreadResponse,
  ThreadSummary,
  MessageData,
} from '@walletwhisper/shared';

// ─── Helpers ───

async function getBaseUrl(): Promise<string> {
  const settings = await getSettings();
  return settings.serverUrl;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Proxy fetch through the background service worker to bypass page CORS.
 * Content scripts in MV3 are subject to the page's same-origin policy,
 * but the background SW can make unrestricted cross-origin requests.
 */
async function proxyFetch(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'API_PROXY', url, method, headers, body },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response?.error) {
          reject(new Error(response.error));
          return;
        }
        resolve(response);
      },
    );
  });
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}${path}`;
  const headers = await authHeaders();

  const res = await proxyFetch(
    url,
    method,
    headers,
    body ? JSON.stringify(body) : undefined,
  );

  if (!res.ok) {
    let errorMessage = `HTTP ${res.status}`;
    try {
      const errorBody = JSON.parse(res.body);
      errorMessage = errorBody.error || errorBody.message || errorMessage;
    } catch {
      // Response might not be JSON
    }
    throw new Error(errorMessage);
  }

  if (res.status === 204) return undefined as T;

  return JSON.parse(res.body);
}

// ─── Auth ───

export async function requestChallenge(
  walletAddress: string,
  chain: 'solana' | 'evm' = 'solana',
): Promise<ChallengeResponse> {
  return request<ChallengeResponse>('POST', '/auth/challenge', {
    walletAddress,
    chain,
  });
}

export async function verifySignature(
  walletAddress: string,
  chain: 'solana' | 'evm',
  nonce: string,
  signatureBase64: string,
  message: string,
): Promise<VerifyResponse> {
  return request<VerifyResponse>('POST', '/auth/verify', {
    walletAddress,
    chain,
    nonce,
    signatureBase64,
    message,
  });
}

export async function loginWithFirebase(
  firebaseIdToken: string,
  walletAddress: string,
): Promise<VerifyResponse> {
  return request<VerifyResponse>('POST', '/auth/firebase', {
    firebaseIdToken,
    walletAddress,
  });
}

// ─── Keys ───

export async function registerKey(
  msgPubKeyBase64: string,
  bindingSignatureBase64: string,
  bindingMessage: string,
): Promise<void> {
  await request<void>('POST', '/keys/register', {
    msgPubKeyBase64,
    bindingSignatureBase64,
    bindingMessage,
  });
}

export async function registerKeySimple(msgPubKeyBase64: string): Promise<void> {
  await request<void>('POST', '/keys/register', { msgPubKeyBase64 });
}

export async function getPublicKey(walletAddress: string): Promise<PublicKeyResponse> {
  return request<PublicKeyResponse>(
    'GET',
    `/keys/${encodeURIComponent(walletAddress)}`,
  );
}

// ─── Threads ───

export async function openThread(peerWalletAddress: string): Promise<OpenThreadResponse> {
  return request<OpenThreadResponse>('POST', '/threads/open', {
    peerWalletAddress,
  });
}

export async function listThreads(): Promise<ThreadSummary[]> {
  const resp = await request<{ threads: ThreadSummary[] }>('GET', '/threads');
  return resp.threads;
}

export async function acceptThread(threadId: string): Promise<void> {
  await request<void>('POST', `/threads/${threadId}/accept`);
}

// ─── Messages ───

export async function sendMessage(
  threadId: string,
  toWallet: string,
  nonceBase64: string,
  ciphertextBase64: string,
): Promise<MessageData> {
  return request<MessageData>('POST', '/messages/send', {
    threadId,
    toWallet,
    nonceBase64,
    ciphertextBase64,
  });
}

export async function getMessages(
  threadId: string,
  cursor?: string,
  limit = 50,
): Promise<MessageData[]> {
  let path = `/threads/${threadId}/messages?limit=${limit}`;
  if (cursor) path += `&cursor=${encodeURIComponent(cursor)}`;
  const resp = await request<{ messages: MessageData[]; nextCursor: string | null }>('GET', path);
  return resp.messages;
}

// ─── Moderation ───

export async function blockUser(walletAddress: string): Promise<void> {
  await request<void>('POST', '/moderation/block', { walletAddress });
}

export async function reportUser(walletAddress: string, reason?: string): Promise<void> {
  await request<void>('POST', '/moderation/report', { walletAddress, reason });
}
