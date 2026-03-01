import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { MessageData, ThreadSummary } from '@walletwhisper/shared';
import {
  shortenAddress,
  solscanUrl,
  encryptMessage,
  decryptMessage,
  decodeBase64,
  encodeBase64,
  decodeUTF8,
  encodeUTF8,
} from '@walletwhisper/shared';

const UNENCRYPTED_NONCE = 'UNENCRYPTED';
import { generateIdenticon } from '@/utils/identicon';
import * as api from '@/utils/api';
import * as socket from '@/utils/socket';
import { getKeypair, getCachedPeerKey, setCachedPeerKey, addBlockedWallet } from '@/utils/storage';

interface ChatViewProps {
  thread: ThreadSummary;
  myWallet: string;
  onBack: () => void;
  onBlock: (wallet: string) => void;
}

interface DecryptedMessage {
  id: string;
  fromWallet: string;
  text: string;
  createdAt: string;
  failed?: boolean;
}

const ChatView: React.FC<ChatViewProps> = ({ thread, myWallet, onBack, onBlock }) => {
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [peerHasKey, setPeerHasKey] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const peerKeyRef = useRef<string | null>(null);
  const mySecretKeyRef = useRef<Uint8Array | null>(null);
  const peerPubKeyRef = useRef<Uint8Array | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Decrypt a single message (or decode plaintext if unencrypted)
  const decryptMsg = useCallback(
    (msg: MessageData): DecryptedMessage => {
      try {
        // Handle unencrypted (plaintext) messages
        if (msg.nonceBase64 === UNENCRYPTED_NONCE) {
          const text = encodeUTF8(decodeBase64(msg.ciphertextBase64));
          return { id: msg.id, fromWallet: msg.fromWallet, text, createdAt: msg.createdAt };
        }

        if (!mySecretKeyRef.current || !peerPubKeyRef.current) {
          return { id: msg.id, fromWallet: msg.fromWallet, text: '[Keys not loaded]', createdAt: msg.createdAt, failed: true };
        }
        // Determine which key to use for decryption based on who sent the message
        const senderPubKey =
          msg.fromWallet === myWallet
            ? // For our own messages, we need the peer's public key
              peerPubKeyRef.current
            : peerPubKeyRef.current;

        const text = decryptMessage(
          msg.ciphertextBase64,
          msg.nonceBase64,
          senderPubKey,
          mySecretKeyRef.current,
        );
        return { id: msg.id, fromWallet: msg.fromWallet, text, createdAt: msg.createdAt };
      } catch {
        return {
          id: msg.id,
          fromWallet: msg.fromWallet,
          text: '[Unable to decrypt]',
          createdAt: msg.createdAt,
          failed: true,
        };
      }
    },
    [myWallet],
  );

  // Load keys and messages
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Load our keypair
        const kp = await getKeypair();
        if (!kp) {
          setError('Messaging keypair not found. Please reconnect your wallet.');
          setLoading(false);
          return;
        }
        mySecretKeyRef.current = decodeBase64(kp.secretKeyBase64);

        // Load peer's public key (optional — peer may not have registered yet)
        let peerKeyB64 = await getCachedPeerKey(thread.peerWalletAddress);
        if (!peerKeyB64) {
          try {
            const resp = await api.getPublicKey(thread.peerWalletAddress);
            peerKeyB64 = resp.msgPubKeyBase64;
            await setCachedPeerKey(thread.peerWalletAddress, peerKeyB64);
          } catch {
            // Peer hasn't registered a messaging key yet — plaintext mode
          }
        }
        if (peerKeyB64) {
          peerKeyRef.current = peerKeyB64;
          peerPubKeyRef.current = decodeBase64(peerKeyB64);
        } else {
          if (!cancelled) setPeerHasKey(false);
        }

        // Auto-accept thread if not yet accepted (moves from Requests to Inbox)
        if (!thread.isAccepted) {
          api.acceptThread(thread.id).catch(() => {});
        }

        // Load messages
        const rawMessages = await api.getMessages(thread.id);
        if (cancelled) return;

        const decrypted = rawMessages.map(decryptMsg);
        setMessages(decrypted);

        // Mark thread as read
        socket.markRead(thread.id);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load messages');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [thread.id, thread.peerWalletAddress, decryptMsg]);

  // Listen for new messages on this thread
  useEffect(() => {
    const unsub = socket.onMessage((msg) => {
      if (msg.threadId !== thread.id) return;

      const decrypted = decryptMsg({
        id: msg.messageId,
        threadId: msg.threadId,
        fromWallet: msg.fromWallet,
        toWallet: msg.toWallet,
        nonceBase64: msg.nonceBase64,
        ciphertextBase64: msg.ciphertextBase64,
        createdAt: msg.createdAt,
      });

      setMessages((prev) => {
        // Prevent duplicates
        if (prev.some((m) => m.id === decrypted.id)) return prev;
        return [...prev, decrypted];
      });

      // Mark as read since we're viewing
      socket.markRead(thread.id);
    });

    return unsub;
  }, [thread.id, decryptMsg]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Send a message (encrypted if peer has key, plaintext otherwise)
  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    setSending(true);
    setError(null);

    try {
      let ciphertextBase64: string;
      let nonceBase64: string;

      if (mySecretKeyRef.current && peerPubKeyRef.current) {
        // Peer has a key — encrypt with NaCl Box
        const encrypted = encryptMessage(text, peerPubKeyRef.current, mySecretKeyRef.current);
        ciphertextBase64 = encrypted.ciphertextBase64;
        nonceBase64 = encrypted.nonceBase64;
      } else {
        // Peer hasn't registered yet — send as plaintext (base64-encoded)
        ciphertextBase64 = encodeBase64(decodeUTF8(text));
        nonceBase64 = UNENCRYPTED_NONCE;
      }

      const msg = await api.sendMessage(
        thread.id,
        thread.peerWalletAddress,
        nonceBase64,
        ciphertextBase64,
      );

      const decrypted: DecryptedMessage = {
        id: msg.id,
        fromWallet: myWallet,
        text,
        createdAt: msg.createdAt,
      };

      setMessages((prev) => {
        if (prev.some((m) => m.id === decrypted.id)) return prev;
        return [...prev, decrypted];
      });
      setInputText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(thread.peerWalletAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleBlock = async () => {
    if (!confirm(`Block ${shortenAddress(thread.peerWalletAddress)}? You will no longer receive messages from this wallet.`)) return;
    try {
      await api.blockUser(thread.peerWalletAddress);
      await addBlockedWallet(thread.peerWalletAddress);
      onBlock(thread.peerWalletAddress);
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to block user');
    }
  };

  const handleReport = async () => {
    const reason = prompt('Reason for report (optional):');
    if (reason === null) return; // Cancelled
    try {
      await api.reportUser(thread.peerWalletAddress, reason || undefined);
      alert('Report submitted. Thank you.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit report');
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const iconUrl = generateIdenticon(thread.peerWalletAddress);

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

        <img
          src={iconUrl}
          alt=""
          style={{ width: '32px', height: '32px', borderRadius: '6px', flexShrink: 0 }}
        />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: '13px',
              fontFamily: 'monospace',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {shortenAddress(thread.peerWalletAddress, 6)}
            <button
              onClick={copyAddress}
              title="Copy address"
              style={{
                background: 'none',
                border: 'none',
                color: copied ? '#22c55e' : '#94a3b8',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                fontSize: '10px',
              }}
            >
              {copied ? 'Copied!' : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="2" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <a
          href={solscanUrl(thread.peerWalletAddress)}
          target="_blank"
          rel="noopener noreferrer"
          title="View on Solscan"
          style={{
            color: '#94a3b8',
            padding: '4px',
            display: 'flex',
            textDecoration: 'none',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6m4-3h6v6m-11 5L21 3"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>

        <button
          onClick={handleBlock}
          title="Block wallet"
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <path d="M4.93 4.93l14.14 14.14" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>

        <button
          onClick={handleReport}
          title="Report"
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zm0 0v7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {loading && (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: '24px' }}>
            Loading messages...
          </div>
        )}

        {!loading && !peerHasKey && (
          <div
            style={{
              padding: '8px 12px',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.15)',
              borderRadius: '8px',
              fontSize: '11px',
              color: '#f59e0b',
              lineHeight: '1.4',
              marginBottom: '8px',
            }}
          >
            This wallet hasn't installed WalletWhisper yet. Messages are sent unencrypted and will be visible when they join.
          </div>
        )}

        {!loading && messages.length === 0 && !error && (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: '24px', fontSize: '13px' }}>
            No messages yet. Say hello!
          </div>
        )}

        {messages.map((msg) => {
          const isMine = msg.fromWallet === myWallet;
          return (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                justifyContent: isMine ? 'flex-end' : 'flex-start',
              }}
            >
              <div
                style={{
                  maxWidth: '75%',
                  padding: '8px 12px',
                  borderRadius: isMine ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  background: isMine ? '#6366f1' : '#1a1d26',
                  color: msg.failed ? '#ef4444' : '#e2e8f0',
                  fontSize: '13px',
                  lineHeight: '1.4',
                  wordBreak: 'break-word',
                }}
              >
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                <div
                  style={{
                    fontSize: '10px',
                    color: isMine ? 'rgba(255,255,255,0.6)' : '#94a3b8',
                    marginTop: '4px',
                    textAlign: 'right',
                  }}
                >
                  {formatTime(msg.createdAt)}
                </div>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Error bar */}
      {error && (
        <div
          style={{
            padding: '8px 16px',
            background: 'rgba(239, 68, 68, 0.1)',
            borderTop: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#ef4444',
            fontSize: '12px',
            flexShrink: 0,
          }}
        >
          {error}
        </div>
      )}

      {/* Input area */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '8px',
          padding: '12px 16px',
          borderTop: '1px solid #2a2d38',
          flexShrink: 0,
        }}
      >
        <textarea
          ref={inputRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          style={{
            flex: 1,
            background: '#1a1d26',
            border: '1px solid #2a2d38',
            borderRadius: '8px',
            padding: '8px 12px',
            color: '#e2e8f0',
            fontSize: '13px',
            resize: 'none',
            outline: 'none',
            maxHeight: '120px',
            lineHeight: '1.4',
            fontFamily: 'inherit',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#6366f1';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#2a2d38';
          }}
          onInput={(e) => {
            const target = e.currentTarget;
            target.style.height = 'auto';
            target.style.height = Math.min(target.scrollHeight, 120) + 'px';
          }}
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim() || sending}
          style={{
            background: inputText.trim() && !sending ? '#6366f1' : '#2a2d38',
            border: 'none',
            borderRadius: '8px',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: inputText.trim() && !sending ? 'pointer' : 'default',
            flexShrink: 0,
            transition: 'background 0.15s ease',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ChatView;
