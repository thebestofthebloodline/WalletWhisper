import { describe, it, expect } from 'vitest';
import {
  isSolanaAddress,
  isEvmAddress,
  detectChain,
  shortenAddress,
  canonicalThreadPair,
  SOLANA_ADDRESS_PATTERN,
} from '../address';

describe('isSolanaAddress', () => {
  it('accepts valid Solana addresses', () => {
    expect(isSolanaAddress('7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV')).toBe(true);
    expect(isSolanaAddress('So11111111111111111111111111111111111111112')).toBe(true);
    expect(isSolanaAddress('11111111111111111111111111111111')).toBe(true);
  });

  it('rejects invalid addresses', () => {
    expect(isSolanaAddress('')).toBe(false);
    expect(isSolanaAddress('short')).toBe(false);
    expect(isSolanaAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18')).toBe(false); // EVM
    expect(isSolanaAddress('contains spaces in address string')).toBe(false);
    expect(isSolanaAddress('OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO')).toBe(false); // O not in base58
  });
});

describe('isEvmAddress', () => {
  it('accepts valid EVM addresses', () => {
    expect(isEvmAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18')).toBe(true);
    expect(isEvmAddress('0x0000000000000000000000000000000000000000')).toBe(true);
  });

  it('rejects invalid EVM addresses', () => {
    expect(isEvmAddress('')).toBe(false);
    expect(isEvmAddress('0x742d35Cc6634')).toBe(false); // too short
    expect(isEvmAddress('742d35Cc6634C0532925a3b844Bc9e7595f2bD18')).toBe(false); // no 0x
  });
});

describe('detectChain', () => {
  it('detects Solana addresses', () => {
    expect(detectChain('7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV')).toBe('solana');
  });

  it('detects EVM addresses', () => {
    expect(detectChain('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18')).toBe('evm');
  });

  it('returns null for invalid addresses', () => {
    expect(detectChain('not-an-address')).toBe(null);
  });
});

describe('shortenAddress', () => {
  it('shortens long addresses', () => {
    expect(shortenAddress('7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV'))
      .toBe('7EcD...FLtV');
  });

  it('custom char count', () => {
    expect(shortenAddress('7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV', 6))
      .toBe('7EcDhS...wCFLtV');
  });

  it('returns short addresses unchanged', () => {
    expect(shortenAddress('short')).toBe('short');
  });
});

describe('canonicalThreadPair', () => {
  it('sorts alphabetically', () => {
    expect(canonicalThreadPair('Z', 'A')).toEqual(['A', 'Z']);
    expect(canonicalThreadPair('A', 'Z')).toEqual(['A', 'Z']);
  });

  it('is deterministic regardless of order', () => {
    const a = '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV';
    const b = 'So11111111111111111111111111111111111111112';
    expect(canonicalThreadPair(a, b)).toEqual(canonicalThreadPair(b, a));
  });
});

describe('SOLANA_ADDRESS_PATTERN', () => {
  it('finds Solana addresses in text', () => {
    const text = 'Check wallet 7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV on solscan';
    const matches = text.match(SOLANA_ADDRESS_PATTERN);
    expect(matches).not.toBeNull();
    expect(matches).toContain('7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV');
  });

  it('finds multiple addresses', () => {
    const text = 'Transfer from 7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV to So11111111111111111111111111111111111111112';
    SOLANA_ADDRESS_PATTERN.lastIndex = 0;
    const matches = text.match(SOLANA_ADDRESS_PATTERN);
    expect(matches?.length).toBe(2);
  });
});
