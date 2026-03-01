/**
 * Wallet interaction utilities for Solana wallets (Phantom, Solflare, etc.).
 *
 * Content scripts cannot access window.solana directly because they run in
 * an isolated world. This module provides helper types and utilities, while
 * the actual wallet calls go through the page-bridge / wallet-bridge system.
 *
 * For the options page (which has direct DOM access), we provide direct
 * wallet methods as well.
 */

export interface WalletAdapter {
  publicKey: { toBase58(): string; toBytes(): Uint8Array } | null;
  isConnected: boolean;
  connect(): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect(): Promise<void>;
  signMessage(message: Uint8Array): Promise<{ signature: Uint8Array }>;
}

/**
 * Detect available Solana wallet in the page context.
 * This only works in the actual page context (not content script).
 */
export function detectWallet(): WalletAdapter | null {
  const win = window as Record<string, unknown>;

  // Phantom
  const phantom = win.phantom as Record<string, unknown> | undefined;
  if (phantom?.solana) {
    const adapter = phantom.solana as unknown as WalletAdapter;
    if (adapter.isConnected !== undefined) return adapter;
  }

  // Solflare or generic window.solana
  const solana = win.solana as unknown as WalletAdapter | undefined;
  if (solana?.isConnected !== undefined) return solana;

  return null;
}

/**
 * Convert a Uint8Array to base64 (browser-safe).
 */
export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert a base64 string to Uint8Array.
 */
export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
