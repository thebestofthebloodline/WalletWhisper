// Base58 character set (Bitcoin-style, used by Solana)
const BASE58_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_REGEX = new RegExp(`^[${BASE58_CHARS}]{32,44}$`);

// EVM address regex
const EVM_REGEX = /^0x[0-9a-fA-F]{40}$/;

/**
 * Check if a string is a valid Solana address (base58, 32-44 chars).
 */
export function isSolanaAddress(str: string): boolean {
  return BASE58_REGEX.test(str);
}

/**
 * Check if a string is a valid EVM address (0x + 40 hex chars).
 */
export function isEvmAddress(str: string): boolean {
  return EVM_REGEX.test(str);
}

/**
 * Detect the chain type from an address string.
 */
export function detectChain(address: string): 'solana' | 'evm' | null {
  if (isSolanaAddress(address)) return 'solana';
  if (isEvmAddress(address)) return 'evm';
  return null;
}

/**
 * Shorten an address for display: first 4 + last 4.
 */
export function shortenAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Generate a deterministic thread ID from two wallet addresses.
 * Always sorts alphabetically so the pair is order-independent.
 */
export function canonicalThreadPair(a: string, b: string): [string, string] {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

/**
 * Regex pattern to match Solana addresses in text / DOM content.
 * Uses word boundaries and the base58 character class.
 */
export const SOLANA_ADDRESS_PATTERN = new RegExp(
  `(?<![${BASE58_CHARS}])([${BASE58_CHARS}]{32,44})(?![${BASE58_CHARS}])`,
  'g',
);

/**
 * Regex pattern to match abbreviated Solana addresses in text / DOM content.
 * Matches patterns like "7xKX...3nPr", "7xK…3nP", "AbC..xYz" (with dots or ellipsis).
 * Captures: [prefix, suffix] groups for resolution.
 */
export const ABBREVIATED_ADDRESS_PATTERN = new RegExp(
  `([${BASE58_CHARS}]{3,8})(?:\\.{2,4}|…)([${BASE58_CHARS}]{3,8})`,
  'g',
);

/**
 * Explorer URL builders.
 */
export function solscanUrl(address: string): string {
  return `https://solscan.io/account/${address}`;
}

export function solscanTxUrl(txHash: string): string {
  return `https://solscan.io/tx/${txHash}`;
}

/**
 * Generate a simple identicon color from an address (deterministic).
 * Returns an array of HSL hue values for gradient generation.
 */
export function addressToHues(address: string): [number, number] {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = ((hash << 5) - hash + address.charCodeAt(i)) | 0;
  }
  const hue1 = Math.abs(hash % 360);
  const hue2 = (hue1 + 137) % 360; // golden angle offset
  return [hue1, hue2];
}
