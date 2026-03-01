/**
 * Content-script side of the wallet bridge.
 *
 * Injects page-bridge.js into the actual page context via script.src
 * (bypasses Content Security Policy inline-script restrictions).
 * Communicates via window.postMessage.
 *
 * Provides a promise-based API for the content script to call wallet methods.
 */

const BRIDGE_PREFIX = 'walletwhisper-bridge';
let bridgeReady: Promise<void> | null = null;
let requestId = 0;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

const pendingRequests = new Map<number, PendingRequest>();

/**
 * Inject the page-bridge script into the host page's DOM via script.src.
 * Returns a cached promise that resolves once the script has loaded.
 */
export function injectBridge(): Promise<void> {
  if (bridgeReady) return bridgeReady;

  bridgeReady = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('page-bridge.js');
    script.onload = () => {
      script.remove();
      resolve();
    };
    script.onerror = () => {
      script.remove();
      bridgeReady = null;
      reject(new Error('Failed to load page-bridge script'));
    };
    (document.head || document.documentElement).appendChild(script);
  });

  // Listen for responses from the page (only once)
  window.addEventListener('message', handlePageMessage);

  return bridgeReady;
}

function handlePageMessage(event: MessageEvent): void {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.direction !== 'from-page') return;
  if (data.type !== `${BRIDGE_PREFIX}-response`) return;

  const pending = pendingRequests.get(data.id);
  if (!pending) return;
  pendingRequests.delete(data.id);

  if (data.error) {
    pending.reject(new Error(data.error));
  } else {
    pending.resolve(data.result);
  }
}

function sendRequest<T>(action: string, extra?: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pendingRequests.set(id, {
      resolve: resolve as (v: unknown) => void,
      reject,
    });

    window.postMessage(
      {
        direction: 'from-content',
        type: `${BRIDGE_PREFIX}-request`,
        id,
        action,
        ...extra,
      },
      '*',
    );

    // Timeout after 60 seconds
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Bridge request timed out: ${action}`));
      }
    }, 60_000);
  });
}

// ─── Public API ───

export interface WalletDetectResult {
  available: boolean;
  isConnected: boolean;
}

export interface WalletConnectResult {
  publicKey: string;
}

export interface WalletSignResult {
  signatureBase64: string;
}

export async function detectWallet(): Promise<WalletDetectResult> {
  await injectBridge();
  return sendRequest<WalletDetectResult>('detectWallet');
}

export async function connectWallet(): Promise<WalletConnectResult> {
  await injectBridge();
  return sendRequest<WalletConnectResult>('connectWallet');
}

/**
 * Sign a message using the connected wallet.
 * @param message - The plaintext message to sign.
 * @returns Base64-encoded signature.
 */
export async function signMessage(message: string): Promise<string> {
  await injectBridge();
  // Convert message string to base64 for transfer
  const messageBase64 = btoa(message);
  const result = await sendRequest<WalletSignResult>('signMessage', { messageBase64 });
  return result.signatureBase64;
}

export async function disconnectWallet(): Promise<void> {
  await injectBridge();
  await sendRequest<{ success: boolean }>('disconnectWallet');
}

// ─── Terminal Integration ───

export interface TerminalWallet {
  walletId: string;
  walletType: string;
  publicAddress: string;
  walletName: string;
}

export interface TerminalSession {
  uid: string;
  sessionSecret?: string;
  sessionId?: string;
  expiresAt?: string;
}

export interface TerminalWalletsResult {
  wallets: TerminalWallet[];
  session: TerminalSession | null;
}

export interface FirebaseAuthResult {
  uid: string;
  email: string | null;
  accessToken: string;
  expirationTime: number;
}

export async function readTerminalWallets(): Promise<TerminalWalletsResult> {
  await injectBridge();
  const result = await sendRequest<{ wallets: TerminalWallet[]; session: TerminalSession | null }>(
    'readTerminalWallets',
  );
  return result ?? { wallets: [], session: null };
}

export async function readFirebaseToken(): Promise<FirebaseAuthResult | null> {
  await injectBridge();
  const result = await sendRequest<{ user: Record<string, unknown> } | null>('readFirebaseToken');
  if (!result || !result.user) return null;

  const user = result.user;
  const stsTokenManager = user.stsTokenManager as
    | { accessToken?: string; expirationTime?: number }
    | undefined;

  if (!stsTokenManager?.accessToken) return null;

  return {
    uid: user.uid as string,
    email: (user.email as string) ?? null,
    accessToken: stsTokenManager.accessToken,
    expirationTime: stsTokenManager.expirationTime ?? 0,
  };
}
