import React, { useState } from 'react';
import { isSolanaAddress, shortenAddress } from '@walletwhisper/shared';
import * as api from '@/utils/api';
import type { ThreadSummary } from '@walletwhisper/shared';

interface StartChatProps {
  onBack: () => void;
  onThreadCreated: (threadId: string, peerWallet: string) => void;
  initialAddress?: string;
  myWallet: string;
}

const StartChat: React.FC<StartChatProps> = ({ onBack, onThreadCreated, initialAddress, myWallet }) => {
  const [address, setAddress] = useState(initialAddress || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = isSolanaAddress(address.trim());
  const isSelf = address.trim().toLowerCase() === myWallet.toLowerCase();

  const handleStart = async () => {
    const wallet = address.trim();
    if (!isValid || isSelf || loading) return;

    setLoading(true);
    setError(null);

    try {
      const resp = await api.openThread(wallet);
      onThreadCreated(resp.threadId, wallet);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start chat');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isValid && !isSelf) {
      handleStart();
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#0f1117',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 16px',
          borderBottom: '1px solid #2a2d38',
          flexShrink: 0,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M19 12H5m0 0l7 7m-7-7l7-7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <span style={{ fontWeight: 600, fontSize: '15px' }}>New Chat</span>
      </div>

      {/* Body */}
      <div style={{ padding: '24px 16px', flex: 1 }}>
        <label
          style={{
            display: 'block',
            fontSize: '12px',
            fontWeight: 600,
            color: '#94a3b8',
            marginBottom: '8px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Wallet Address
        </label>
        <input
          type="text"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Enter Solana wallet address..."
          autoFocus
          style={{
            width: '100%',
            background: '#1a1d26',
            border: `1px solid ${
              address.trim() && !isValid ? '#ef4444' : address.trim() && isSelf ? '#f59e0b' : '#2a2d38'
            }`,
            borderRadius: '8px',
            padding: '10px 12px',
            color: '#e2e8f0',
            fontSize: '13px',
            fontFamily: 'monospace',
            outline: 'none',
            transition: 'border-color 0.15s ease',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => {
            if (!address.trim() || isValid) {
              e.currentTarget.style.borderColor = '#6366f1';
            }
          }}
          onBlur={(e) => {
            if (!address.trim()) {
              e.currentTarget.style.borderColor = '#2a2d38';
            }
          }}
        />

        {/* Validation messages */}
        {address.trim() && !isValid && (
          <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '6px' }}>
            Not a valid Solana address
          </div>
        )}
        {isSelf && (
          <div style={{ fontSize: '12px', color: '#f59e0b', marginTop: '6px' }}>
            You cannot chat with yourself
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              marginTop: '12px',
              padding: '10px 12px',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '8px',
              color: '#ef4444',
              fontSize: '12px',
              lineHeight: '1.4',
            }}
          >
            {error}
          </div>
        )}

        {/* Start Chat button */}
        <button
          onClick={handleStart}
          disabled={!isValid || isSelf || loading}
          style={{
            width: '100%',
            marginTop: '20px',
            padding: '10px',
            background: isValid && !isSelf && !loading ? '#6366f1' : '#2a2d38',
            color: isValid && !isSelf && !loading ? 'white' : '#94a3b8',
            border: 'none',
            borderRadius: '8px',
            cursor: isValid && !isSelf && !loading ? 'pointer' : 'default',
            fontWeight: 600,
            fontSize: '13px',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (isValid && !isSelf && !loading) {
              e.currentTarget.style.background = '#818cf8';
            }
          }}
          onMouseLeave={(e) => {
            if (isValid && !isSelf && !loading) {
              e.currentTarget.style.background = '#6366f1';
            }
          }}
        >
          {loading ? 'Starting...' : 'Start Chat'}
        </button>

        {/* Disclaimer */}
        <div
          style={{
            marginTop: '24px',
            padding: '12px',
            background: 'rgba(99, 102, 241, 0.05)',
            borderRadius: '8px',
            fontSize: '11px',
            color: '#94a3b8',
            lineHeight: '1.5',
          }}
        >
          Messages are end-to-end encrypted using NaCl Box (Curve25519 + XSalsa20-Poly1305).
          Only you and the recipient can read them.
        </div>
      </div>
    </div>
  );
};

export default StartChat;
