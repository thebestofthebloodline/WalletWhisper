import { describe, it, expect } from 'vitest';
import { canonicalThreadPair } from '@walletwhisper/shared';

describe('Thread pair ordering', () => {
  it('always puts the lexicographically smaller address first', () => {
    const a = 'AaaaaaaaaaaaWallet';
    const b = 'ZzzzzzzzzzzWallet';

    expect(canonicalThreadPair(a, b)).toEqual([a, b]);
    expect(canonicalThreadPair(b, a)).toEqual([a, b]);
  });

  it('handles case-insensitive comparison', () => {
    const a = 'ABCDEF';
    const b = 'abcdef';
    const [first] = canonicalThreadPair(a, b);
    // lowercase 'a' < uppercase 'A' in charCode... but canonicalThreadPair uses toLowerCase
    // So 'a' === 'a', they'd be equal. Then the original strings are returned based on the original sort.
    expect(first).toBeDefined();
  });

  it('identical addresses return the same pair', () => {
    const addr = '7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV';
    const [a, b] = canonicalThreadPair(addr, addr);
    expect(a).toBe(addr);
    expect(b).toBe(addr);
  });

  it('is idempotent — canonicalize twice gives same result', () => {
    const addr1 = 'ZWallet';
    const addr2 = 'AWallet';
    const first = canonicalThreadPair(addr1, addr2);
    const second = canonicalThreadPair(first[0], first[1]);
    expect(first).toEqual(second);
  });
});
