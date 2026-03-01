import React, { useState, useEffect, useRef } from 'react';
import {
  generateMessagingKeypair,
  buildLoginMessage,
  buildKeyRegistrationMessage,
} from '@walletwhisper/shared';
import * as api from '@/utils/api';
import {
  setToken,
  setWalletAddress,
  setKeypair,
  getKeypair,
} from '@/utils/storage';
import {
  connectWallet,
  signMessage,
  detectWallet,
  readTerminalWallets,
  readFirebaseToken,
} from '@/utils/wallet-bridge';
import type { TerminalWallet, FirebaseAuthResult } from '@/utils/wallet-bridge';

interface ConnectWalletProps {
  onConnected: (walletAddress: string) => void;
}

type Mode = 'loading' | 'terminal-picker' | 'phantom' | 'authenticating';

type PhantomStep =
  | 'idle'
  | 'detecting'
  | 'connecting'
  | 'challenging'
  | 'signing'
  | 'verifying'
  | 'registering-key'
  | 'done';

const PHANTOM_STEP_LABELS: Record<PhantomStep, string> = {
  idle: '',
  detecting: 'Detecting wallet...',
  connecting: 'Connecting to wallet...',
  challenging: 'Requesting challenge...',
  signing: 'Please sign the message in your wallet...',
  verifying: 'Verifying signature...',
  'registering-key': 'Registering messaging key...',
  done: 'Connected!',
};

const Spinner: React.FC<{ size?: number; color?: string }> = ({
  size = 24,
  color = '#6366f1',
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    style={{ animation: 'walletwhisper-spin 1s linear infinite' }}
  >
    <path
      d="M12 2v4m0 12v4m-8-10H2m20 0h-2m-2.93-6.07l-1.41 1.41m-7.32 7.32l-1.41 1.41m0-10.14l1.41 1.41m7.32 7.32l1.41 1.41"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const ConnectWallet: React.FC<ConnectWalletProps> = ({ onConnected }) => {
  const [mode, setMode] = useState<Mode>('loading');
  const [error, setError] = useState<string | null>(null);
  const [solWallets, setSolWallets] = useState<TerminalWallet[]>([]);
  const [firebaseAuth, setFirebaseAuth] = useState<FirebaseAuthResult | null>(null);
  const [phantomStep, setPhantomStep] = useState<PhantomStep>('idle');
  const initAttempted = useRef(false);

  // Register messaging keypair (without binding signature for Firebase flow)
  const ensureMessagingKey = async (walletAddr: string, usePhantom: boolean) => {
    const existingKp = await getKeypair();
    if (existingKp) return;

    const kp = generateMessagingKeypair();

    if (usePhantom) {
      const bindingMessage = buildKeyRegistrationMessage({
        walletAddress: walletAddr,
        msgPubKeyBase64: kp.publicKeyBase64,
        timestamp: new Date().toISOString(),
      });
      const bindingSignature = await signMessage(bindingMessage);
      await api.registerKey(kp.publicKeyBase64, bindingSignature, bindingMessage);
    } else {
      // Firebase flow — no wallet signature available, use simple registration
      await api.registerKeySimple(kp.publicKeyBase64);
    }

    await setKeypair({
      publicKeyBase64: kp.publicKeyBase64,
      secretKeyBase64: kp.secretKeyBase64,
    });
  };

  // Firebase auth flow — authenticate with Terminal's Firebase token
  const handleTerminalAuth = async (wallet: TerminalWallet) => {
    if (!firebaseAuth) {
      setError('Firebase session expired. Please refresh Terminal.');
      return;
    }

    setError(null);
    setMode('authenticating');

    try {
      const verifyResp = await api.loginWithFirebase(
        firebaseAuth.accessToken,
        wallet.publicAddress,
      );

      await setToken(verifyResp.jwt);
      await setWalletAddress(wallet.publicAddress);

      await ensureMessagingKey(wallet.publicAddress, false);

      onConnected(wallet.publicAddress);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Firebase authentication failed';
      setError(message);
      setMode('terminal-picker');
    }
  };

  // Standard Phantom auth flow
  const handlePhantomConnect = async () => {
    setError(null);

    try {
      setPhantomStep('detecting');
      const detection = await detectWallet();
      if (!detection.available) {
        setError(
          'No Solana wallet detected. Please install Phantom or Solflare and refresh the page.',
        );
        setPhantomStep('idle');
        return;
      }

      setPhantomStep('connecting');
      const wallet = await connectWallet();
      const walletAddr = wallet.publicKey;

      setPhantomStep('challenging');
      const challenge = await api.requestChallenge(walletAddr, 'solana');

      setPhantomStep('signing');
      const loginMessage = buildLoginMessage({
        walletAddress: walletAddr,
        nonce: challenge.nonce,
        issuedAt: new Date().toISOString(),
        domain: window.location.origin,
      });
      const signatureBase64 = await signMessage(loginMessage);

      setPhantomStep('verifying');
      const verifyResp = await api.verifySignature(
        walletAddr,
        'solana',
        challenge.nonce,
        signatureBase64,
        loginMessage,
      );

      await setToken(verifyResp.jwt);
      await setWalletAddress(walletAddr);

      setPhantomStep('registering-key');
      await ensureMessagingKey(walletAddr, true);

      setPhantomStep('done');
      onConnected(walletAddr);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      setError(message);
      setPhantomStep('idle');
    }
  };

  // On mount: detect Terminal wallets + Firebase token
  useEffect(() => {
    if (initAttempted.current) return;
    initAttempted.current = true;

    let cancelled = false;

    (async () => {
      try {
        // Read Terminal wallets and Firebase token in parallel
        const [terminalResult, fbToken] = await Promise.all([
          readTerminalWallets().catch(() => ({ wallets: [], session: null })),
          readFirebaseToken().catch(() => null),
        ]);

        if (cancelled) return;

        // Filter SOL wallets only
        const solOnly = terminalResult.wallets.filter(
          (w) => w.walletType === 'solana' || w.walletType === 'SOL',
        );

        const hasValidToken = fbToken && fbToken.expirationTime > Date.now();

        if (solOnly.length > 0 && hasValidToken) {
          setSolWallets(solOnly);
          setFirebaseAuth(fbToken);

          if (solOnly.length === 1) {
            // Auto-connect with single SOL wallet
            setMode('authenticating');
            try {
              const verifyResp = await api.loginWithFirebase(
                fbToken.accessToken,
                solOnly[0].publicAddress,
              );
              if (cancelled) return;

              await setToken(verifyResp.jwt);
              await setWalletAddress(solOnly[0].publicAddress);

              const existingKp = await getKeypair();
              if (!existingKp) {
                const kp = generateMessagingKeypair();
                await api.registerKeySimple(kp.publicKeyBase64);
                await setKeypair({
                  publicKeyBase64: kp.publicKeyBase64,
                  secretKeyBase64: kp.secretKeyBase64,
                });
              }

              onConnected(solOnly[0].publicAddress);
              return;
            } catch {
              if (cancelled) return;
              // Auto-connect failed, show picker
              setMode('terminal-picker');
              return;
            }
          }

          // Multiple SOL wallets — show picker
          setMode('terminal-picker');
        } else {
          // Not on Terminal or no valid Firebase token — Phantom fallback
          setMode('phantom');

          // Try auto-connect if Phantom is already connected
          try {
            const detection = await detectWallet();
            if (cancelled) return;
            if (detection.available && detection.isConnected) {
              await handlePhantomConnect();
            }
          } catch {
            // Auto-connect failed silently
          }
        }
      } catch {
        if (!cancelled) setMode('phantom');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Loading state
  if (mode === 'loading') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
          textAlign: 'center',
          height: '100%',
        }}
      >
        <Spinner />
        <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '12px' }}>
          Detecting wallets...
        </div>
      </div>
    );
  }

  // Authenticating state (Firebase auto-connect or manual pick)
  if (mode === 'authenticating') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
          textAlign: 'center',
          height: '100%',
        }}
      >
        <Spinner />
        <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '12px' }}>
          Authenticating with Terminal...
        </div>
      </div>
    );
  }

  // Terminal wallet picker
  if (mode === 'terminal-picker') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '32px 24px',
          height: '100%',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '16px' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="8" cy="10" r="1" fill="#6366f1" />
            <circle cx="12" cy="10" r="1" fill="#6366f1" />
            <circle cx="16" cy="10" r="1" fill="#6366f1" />
          </svg>
        </div>

        <h2
          style={{
            fontSize: '16px',
            fontWeight: 700,
            color: '#e2e8f0',
            margin: '0 0 4px 0',
          }}
        >
          Select Wallet
        </h2>
        <p
          style={{
            fontSize: '12px',
            color: '#94a3b8',
            margin: '0 0 20px 0',
          }}
        >
          Choose a Terminal wallet to connect with WalletWhisper
        </p>

        {/* Wallet list */}
        <div
          style={{
            width: '100%',
            maxWidth: '300px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {solWallets.map((w) => (
            <button
              key={w.walletId || w.publicAddress}
              onClick={() => handleTerminalAuth(w)}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: '#1e1f2e',
                border: '1px solid #2a2d3a',
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#6366f1';
                e.currentTarget.style.background = '#252636';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#2a2d3a';
                e.currentTarget.style.background = '#1e1f2e';
              }}
            >
              {/* Wallet icon */}
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M21 12V7H5a2 2 0 010-4h14v4"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M3 5v14a2 2 0 002 2h16v-5"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="18" cy="14" r="1.5" fill="white" />
                </svg>
              </div>

              <div style={{ textAlign: 'left', minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#e2e8f0',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {w.walletName || 'Wallet'}
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: '#64748b',
                    fontFamily: 'monospace',
                  }}
                >
                  {truncateAddress(w.publicAddress)}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              marginTop: '16px',
              padding: '10px 16px',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '8px',
              color: '#ef4444',
              fontSize: '12px',
              lineHeight: '1.4',
              maxWidth: '300px',
              width: '100%',
            }}
          >
            {error}
          </div>
        )}

        {/* Phantom fallback link */}
        <button
          onClick={() => {
            setMode('phantom');
            setError(null);
          }}
          style={{
            marginTop: '20px',
            background: 'none',
            border: 'none',
            color: '#6366f1',
            fontSize: '12px',
            cursor: 'pointer',
            textDecoration: 'underline',
            padding: '4px',
          }}
        >
          Connect with Phantom instead
        </button>
      </div>
    );
  }

  // Phantom flow (fallback or non-Terminal)
  const isPhantomLoading = phantomStep !== 'idle' && phantomStep !== 'done';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
        height: '100%',
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: '24px' }}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
          <path
            d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"
            stroke="#6366f1"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="8" cy="10" r="1" fill="#6366f1" />
          <circle cx="12" cy="10" r="1" fill="#6366f1" />
          <circle cx="16" cy="10" r="1" fill="#6366f1" />
        </svg>
      </div>

      <h2
        style={{
          fontSize: '18px',
          fontWeight: 700,
          color: '#e2e8f0',
          margin: '0 0 8px 0',
        }}
      >
        Welcome to WalletWhisper
      </h2>
      <p
        style={{
          fontSize: '13px',
          color: '#94a3b8',
          margin: '0 0 32px 0',
          lineHeight: '1.5',
        }}
      >
        Encrypted wallet-to-wallet messaging.
        <br />
        Connect your Solana wallet to get started.
      </p>

      {/* Connect button */}
      <button
        onClick={handlePhantomConnect}
        disabled={isPhantomLoading}
        style={{
          width: '100%',
          maxWidth: '280px',
          padding: '12px 20px',
          background: isPhantomLoading
            ? '#2a2d38'
            : 'linear-gradient(135deg, #6366f1, #4f46e5)',
          color: isPhantomLoading ? '#94a3b8' : 'white',
          border: 'none',
          borderRadius: '10px',
          cursor: isPhantomLoading ? 'default' : 'pointer',
          fontWeight: 600,
          fontSize: '14px',
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
        onMouseEnter={(e) => {
          if (!isPhantomLoading) {
            e.currentTarget.style.background =
              'linear-gradient(135deg, #818cf8, #6366f1)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isPhantomLoading) {
            e.currentTarget.style.background =
              'linear-gradient(135deg, #6366f1, #4f46e5)';
            e.currentTarget.style.transform = 'translateY(0)';
          }
        }}
      >
        {isPhantomLoading && <Spinner size={16} color="currentColor" />}
        {isPhantomLoading ? PHANTOM_STEP_LABELS[phantomStep] : 'Connect Wallet'}
      </button>

      {/* Status */}
      {isPhantomLoading && (
        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '12px' }}>
          {PHANTOM_STEP_LABELS[phantomStep]}
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            marginTop: '16px',
            padding: '10px 16px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: '8px',
            color: '#ef4444',
            fontSize: '12px',
            lineHeight: '1.4',
            maxWidth: '320px',
            width: '100%',
          }}
        >
          {error}
        </div>
      )}

      {/* Disclaimer */}
      <div
        style={{
          marginTop: '32px',
          fontSize: '11px',
          color: '#64748b',
          lineHeight: '1.5',
          maxWidth: '280px',
        }}
      >
        WalletWhisper only requests a message signature to prove wallet ownership.
        Your private keys and seed phrase are never accessed.
      </div>
    </div>
  );
};

export default ConnectWallet;
