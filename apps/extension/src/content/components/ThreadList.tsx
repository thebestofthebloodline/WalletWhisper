import React from 'react';
import type { ThreadSummary } from '@walletwhisper/shared';
import { shortenAddress } from '@walletwhisper/shared';
import { generateIdenticon } from '@/utils/identicon';

interface ThreadListProps {
  threads: ThreadSummary[];
  onSelectThread: (thread: ThreadSummary) => void;
  myWallet: string;
  onDecryptLastMessage: (thread: ThreadSummary) => string;
  isRequests?: boolean;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const ThreadList: React.FC<ThreadListProps> = ({
  threads,
  onSelectThread,
  myWallet,
  onDecryptLastMessage,
  isRequests,
}) => {
  if (threads.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
          color: '#94a3b8',
          textAlign: 'center',
        }}
      >
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          style={{ marginBottom: '16px', opacity: 0.4 }}
        >
          <path
            d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"
            stroke="#94a3b8"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div style={{ fontSize: '14px', fontWeight: 500 }}>
          {isRequests ? 'No message requests' : 'No conversations yet'}
        </div>
        <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.7 }}>
          {isRequests
            ? 'Incoming messages from new wallets appear here'
            : 'Start a chat using the button below'}
        </div>
      </div>
    );
  }

  return (
    <div>
      {threads.map((thread) => {
        const snippet = onDecryptLastMessage(thread);
        const iconUrl = generateIdenticon(thread.peerWalletAddress);

        return (
          <button
            key={thread.id}
            onClick={() => onSelectThread(thread)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              borderBottom: '1px solid rgba(42, 45, 56, 0.5)',
              cursor: 'pointer',
              textAlign: 'left',
              color: '#e2e8f0',
              transition: 'background 0.12s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(26, 29, 38, 0.8)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none';
            }}
          >
            {/* Identicon */}
            <img
              src={iconUrl}
              alt=""
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                flexShrink: 0,
              }}
            />

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '2px',
                }}
              >
                <span
                  style={{
                    fontWeight: thread.unreadCount > 0 ? 700 : 500,
                    fontSize: '13px',
                    fontFamily: 'monospace',
                  }}
                >
                  {shortenAddress(thread.peerWalletAddress, 4)}
                </span>
                <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>
                  {formatTimestamp(thread.lastMessageAt)}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontSize: '12px',
                    color: thread.unreadCount > 0 ? '#e2e8f0' : '#94a3b8',
                    fontWeight: thread.unreadCount > 0 ? 500 : 400,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '220px',
                  }}
                >
                  {snippet || 'No messages yet'}
                </span>
                {thread.unreadCount > 0 && (
                  <span
                    style={{
                      background: '#6366f1',
                      color: 'white',
                      fontSize: '10px',
                      fontWeight: 700,
                      borderRadius: '10px',
                      minWidth: '18px',
                      height: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 5px',
                      flexShrink: 0,
                      marginLeft: '8px',
                    }}
                  >
                    {thread.unreadCount}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default ThreadList;
