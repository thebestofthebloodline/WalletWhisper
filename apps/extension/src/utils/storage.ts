/**
 * Chrome storage helpers for WalletWhisper extension.
 * All data is stored in chrome.storage.local.
 */

// ─── Types ───

export interface MessagingKeypair {
  publicKeyBase64: string;
  secretKeyBase64: string;
}

export interface ExtensionSettings {
  serverUrl: string;
  notificationsEnabled: boolean;
  safetyMode: boolean; // Only messages from approved wallets
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  serverUrl: 'http://localhost:4000',
  notificationsEnabled: true,
  safetyMode: false,
};

// ─── Generic helpers ───

function getStorage<T>(key: string): Promise<T | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] ?? null);
    });
  });
}

function setStorage<T>(key: string, value: T): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => {
      resolve();
    });
  });
}

function removeStorage(key: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(key, () => {
      resolve();
    });
  });
}

// ─── JWT Token ───

export async function getToken(): Promise<string | null> {
  return getStorage<string>('walletwhisper_jwt');
}

export async function setToken(token: string): Promise<void> {
  return setStorage('walletwhisper_jwt', token);
}

export async function removeToken(): Promise<void> {
  return removeStorage('walletwhisper_jwt');
}

// ─── Wallet address of the authenticated user ───

export async function getWalletAddress(): Promise<string | null> {
  return getStorage<string>('walletwhisper_wallet');
}

export async function setWalletAddress(address: string): Promise<void> {
  return setStorage('walletwhisper_wallet', address);
}

export async function removeWalletAddress(): Promise<void> {
  return removeStorage('walletwhisper_wallet');
}

// ─── Messaging Keypair (Curve25519) ───

export async function getKeypair(): Promise<MessagingKeypair | null> {
  return getStorage<MessagingKeypair>('walletwhisper_keypair');
}

export async function setKeypair(kp: MessagingKeypair): Promise<void> {
  return setStorage('walletwhisper_keypair', kp);
}

export async function removeKeypair(): Promise<void> {
  return removeStorage('walletwhisper_keypair');
}

// ─── Settings ───

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await getStorage<ExtensionSettings>('walletwhisper_settings');
  if (!stored) return { ...DEFAULT_SETTINGS };
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function setSettings(settings: Partial<ExtensionSettings>): Promise<void> {
  const current = await getSettings();
  return setStorage('walletwhisper_settings', { ...current, ...settings });
}

// ─── Blocked Wallets ───

export async function getBlockedWallets(): Promise<string[]> {
  const list = await getStorage<string[]>('walletwhisper_blocked');
  return list ?? [];
}

export async function addBlockedWallet(address: string): Promise<void> {
  const list = await getBlockedWallets();
  if (!list.includes(address)) {
    list.push(address);
    await setStorage('walletwhisper_blocked', list);
  }
}

export async function removeBlockedWallet(address: string): Promise<void> {
  const list = await getBlockedWallets();
  await setStorage(
    'walletwhisper_blocked',
    list.filter((w) => w !== address),
  );
}

export async function isWalletBlocked(address: string): Promise<boolean> {
  const list = await getBlockedWallets();
  return list.includes(address);
}

// ─── Peer public keys cache ───

export async function getCachedPeerKey(wallet: string): Promise<string | null> {
  const cache = await getStorage<Record<string, string>>('walletwhisper_peer_keys');
  return cache?.[wallet] ?? null;
}

export async function setCachedPeerKey(wallet: string, pubKeyBase64: string): Promise<void> {
  const cache = (await getStorage<Record<string, string>>('walletwhisper_peer_keys')) ?? {};
  cache[wallet] = pubKeyBase64;
  await setStorage('walletwhisper_peer_keys', cache);
}

// ─── Clear all data ───

export async function clearAllData(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.clear(() => {
      resolve();
    });
  });
}
