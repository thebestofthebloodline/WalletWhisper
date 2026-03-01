import React, { useState } from 'react';
import ThreadList from './ThreadList';
import type { ThreadSummary } from '@walletwhisper/shared';

interface ChatDrawerProps {
  threads: ThreadSummary[];
  onSelectThread: (thread: ThreadSummary) => void;
  onNewChat: () => void;
  myWallet: string;
  onDecryptLastMessage: (thread: ThreadSummary) => string;
}

type Tab = 'inbox' | 'requests';

const ChatDrawer: React.FC<ChatDrawerProps> = ({
  threads,
  onSelectThread,
  onNewChat,
  myWallet,
  onDecryptLastMessage,
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('inbox');

  const acceptedThreads = threads.filter((t) => t.isAccepted);
  const requestThreads = threads.filter((t) => !t.isAccepted);

  const requestCount = requestThreads.reduce((sum, t) => sum + t.unreadCount, 0);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'transparent',
        color: '#e2e8f0',
        fontSize: '14px',
      }}
    >
      {/* Safety banner */}
      <div
        style={{
          padding: '8px 16px',
          background: 'rgba(245, 158, 11, 0.08)',
          borderBottom: '1px solid rgba(245, 158, 11, 0.15)',
          fontSize: '11px',
          color: '#f59e0b',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexShrink: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            stroke="#f59e0b"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Never share seed phrases. WalletWhisper will never ask.
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => setActiveTab('inbox')}
          style={{
            flex: 1,
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'inbox' ? '2px solid #6366f1' : '2px solid transparent',
            color: activeTab === 'inbox' ? '#e2e8f0' : '#94a3b8',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            transition: 'color 0.15s ease, border-color 0.15s ease',
          }}
        >
          Inbox
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          style={{
            flex: 1,
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'requests' ? '2px solid #6366f1' : '2px solid transparent',
            color: activeTab === 'requests' ? '#e2e8f0' : '#94a3b8',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            transition: 'color 0.15s ease, border-color 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          Requests
          {requestCount > 0 && (
            <span
              style={{
                background: '#ef4444',
                color: 'white',
                fontSize: '10px',
                borderRadius: '8px',
                padding: '1px 6px',
                fontWeight: 700,
              }}
            >
              {requestCount}
            </span>
          )}
        </button>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <ThreadList
          threads={activeTab === 'inbox' ? acceptedThreads : requestThreads}
          onSelectThread={onSelectThread}
          myWallet={myWallet}
          onDecryptLastMessage={onDecryptLastMessage}
          isRequests={activeTab === 'requests'}
        />
      </div>

      {/* New Chat button */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', flexShrink: 0 }}>
        <button
          onClick={onNewChat}
          style={{
            width: '100%',
            padding: '10px',
            background: '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '13px',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#818cf8';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#6366f1';
          }}
        >
          + New Chat
        </button>
      </div>
    </div>
  );
};

export default ChatDrawer;
