import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { ThreadSummary } from '@walletwhisper/shared';
import { decryptMessage, decodeBase64, encodeUTF8 } from '@walletwhisper/shared';

const UNENCRYPTED_NONCE = 'UNENCRYPTED';
import FloatingButton from './components/FloatingButton';
import FloatingWindow from './components/FloatingWindow';
import ChatDrawer from './components/ChatDrawer';
import ChatView from './components/ChatView';
import StartChat from './components/StartChat';
import ConnectWallet from './components/ConnectWallet';
import * as api from '@/utils/api';
import * as socket from '@/utils/socket';
import {
  getToken,
  getWalletAddress,
  getKeypair,
  getCachedPeerKey,
  setCachedPeerKey,
  removeToken,
  removeWalletAddress,
} from '@/utils/storage';
import type { MessagingKeypair } from '@/utils/storage';

type View = 'threads' | 'chat' | 'new-chat' | 'connect';

interface AppState {
  isOpen: boolean;
  view: View;
  threads: ThreadSummary[];
  selectedThread: ThreadSummary | null;
  myWallet: string | null;
  unreadCount: number;
  newChatAddress: string | null;
  keypair: MessagingKeypair | null;
}

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    isOpen: false,
    view: 'connect',
    threads: [],
    selectedThread: null,
    myWallet: null,
    unreadCount: 0,
    newChatAddress: null,
    keypair: null,
  });

  const keypairRef = useRef<MessagingKeypair | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check authentication on mount
  useEffect(() => {
    async function checkAuth() {
      const token = await getToken();
      const wallet = await getWalletAddress();
      const kp = await getKeypair();

      if (token && wallet && kp) {
        keypairRef.current = kp;
        setState((s) => ({
          ...s,
          myWallet: wallet,
          view: 'threads',
          keypair: kp,
        }));
        // Load threads and connect socket
        loadThreads();
        socket.connect();
      } else {
        setState((s) => ({ ...s, view: 'connect' }));
      }
    }
    checkAuth();

    return () => {
      socket.disconnect();
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // Listen for background SW messages (extension icon click, notification click)
  useEffect(() => {
    const handler = (message: { type: string }) => {
      if (message.type === 'TOGGLE_DRAWER') {
        setState((s) => {
          if (!s.isOpen && s.myWallet) loadThreads();
          return { ...s, isOpen: !s.isOpen };
        });
      } else if (message.type === 'OPEN_DRAWER') {
        setState((s) => {
          if (s.myWallet) loadThreads();
          return { ...s, isOpen: true };
        });
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  // Listen for socket events
  useEffect(() => {
    const unsubMessage = socket.onMessage(() => {
      // Refresh thread list when new message arrives
      loadThreads();
    });

    const unsubUnread = socket.onUnread((data) => {
      setState((s) => ({ ...s, unreadCount: data.totalUnread }));
      // Update extension badge
      try {
        chrome.runtime.sendMessage({
          type: 'UPDATE_BADGE',
          count: data.totalUnread,
        });
      } catch {
        // Background script may not be ready
      }
    });

    return () => {
      unsubMessage();
      unsubUnread();
    };
  }, []);

  // Poll threads periodically to keep the list fresh
  useEffect(() => {
    if (state.myWallet) {
      pollTimerRef.current = setInterval(loadThreads, 30_000);
    }
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [state.myWallet]);

  const loadThreads = async () => {
    try {
      const threads = await api.listThreads();
      const totalUnread = threads.reduce((sum, t) => sum + t.unreadCount, 0);
      setState((s) => ({ ...s, threads, unreadCount: totalUnread }));
    } catch (err) {
      console.error('[WalletWhisper] Failed to load threads:', err);
    }
  };

  const toggleDrawer = useCallback(() => {
    setState((s) => {
      const opening = !s.isOpen;
      // If opening and authenticated, refresh threads
      if (opening && s.myWallet) {
        loadThreads();
      }
      return { ...s, isOpen: !s.isOpen };
    });
  }, []);

  const handleConnected = useCallback(async (walletAddress: string) => {
    const kp = await getKeypair();
    keypairRef.current = kp;
    setState((s) => ({
      ...s,
      myWallet: walletAddress,
      view: 'threads',
      keypair: kp,
    }));
    loadThreads();
    socket.connect();
  }, []);

  const handleSelectThread = useCallback((thread: ThreadSummary) => {
    setState((s) => ({ ...s, view: 'chat', selectedThread: thread }));
  }, []);

  const handleBack = useCallback(() => {
    setState((s) => ({ ...s, view: 'threads', selectedThread: null }));
    loadThreads();
  }, []);

  const handleNewChat = useCallback(() => {
    setState((s) => ({ ...s, view: 'new-chat', newChatAddress: null }));
  }, []);

  const handleThreadCreated = useCallback(
    async (threadId: string, peerWallet: string) => {
      await loadThreads();
      setState((s) => {
        const thread = s.threads.find((t) => t.id === threadId) || {
          id: threadId,
          peerWalletAddress: peerWallet,
          lastMessageAt: null,
          lastMessageCiphertext: null,
          lastMessageNonce: null,
          lastMessageFromWallet: null,
          unreadCount: 0,
          isAccepted: true,
          createdAt: new Date().toISOString(),
        };
        return { ...s, view: 'chat', selectedThread: thread };
      });
    },
    [],
  );

  const handleBlock = useCallback((_wallet: string) => {
    loadThreads();
  }, []);

  const [loadingAutoOpen, setLoadingAutoOpen] = useState(false);

  // Open chat with a specific wallet address (from DOM scanner clicks)
  const openChatWithAddress = useCallback(
    async (address: string) => {
      if (!state.myWallet) {
        setState((s) => ({ ...s, isOpen: true }));
        return;
      }

      // Check if there's an existing thread with this wallet
      const existing = state.threads.find(
        (t) => t.peerWalletAddress.toLowerCase() === address.toLowerCase(),
      );

      if (existing) {
        setState((s) => ({
          ...s,
          isOpen: true,
          view: 'chat',
          selectedThread: existing,
        }));
        return;
      }

      // Auto-create thread and open chat directly
      setState((s) => ({ ...s, isOpen: true }));
      setLoadingAutoOpen(true);
      try {
        const resp = await api.openThread(address);
        await loadThreads();
        setState((s) => {
          const thread = s.threads.find((t) => t.id === resp.threadId) || {
            id: resp.threadId,
            peerWalletAddress: address,
            lastMessageAt: null,
            lastMessageCiphertext: null,
            lastMessageNonce: null,
            lastMessageFromWallet: null,
            unreadCount: 0,
            isAccepted: true,
            createdAt: new Date().toISOString(),
          };
          return { ...s, view: 'chat', selectedThread: thread };
        });
      } catch {
        // Fallback to StartChat form on error
        setState((s) => ({
          ...s,
          view: 'new-chat',
          newChatAddress: address,
        }));
      } finally {
        setLoadingAutoOpen(false);
      }
    },
    [state.myWallet, state.threads],
  );

  // Expose the openChatWithAddress function globally for the DOM scanner
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__walletwhisper_openChat = openChatWithAddress;
    return () => {
      delete (window as unknown as Record<string, unknown>).__walletwhisper_openChat;
    };
  }, [openChatWithAddress]);

  // Decrypt the last message for a thread (for the thread list preview)
  const decryptLastMessage = useCallback(
    (thread: ThreadSummary): string => {
      if (!thread.lastMessageCiphertext || !thread.lastMessageNonce) return '';

      // Handle unencrypted (plaintext) messages
      if (thread.lastMessageNonce === UNENCRYPTED_NONCE) {
        try {
          const text = encodeUTF8(decodeBase64(thread.lastMessageCiphertext));
          return text.length > 50 ? text.slice(0, 50) + '...' : text;
        } catch {
          return '[Unable to read]';
        }
      }

      const kp = keypairRef.current;
      if (!kp) return '[Encrypted]';

      try {
        // We need the peer's public key to decrypt
        // Since this is synchronous and we may not have it cached,
        // return a placeholder and let the ThreadList handle async loading
        const mySecretKey = decodeBase64(kp.secretKeyBase64);

        // For the thread list, try to use the last cached peer key
        // This is a simplified approach - in production you'd cache all peer keys
        // We'll attempt a synchronous cache lookup via a stored map
        const cachedKeysStr = localStorage.getItem('walletwhisper_peer_keys_sync');
        const cachedKeys: Record<string, string> = cachedKeysStr
          ? JSON.parse(cachedKeysStr)
          : {};

        const peerKeyB64 = cachedKeys[thread.peerWalletAddress];
        if (!peerKeyB64) {
          // Trigger async cache population
          getCachedPeerKey(thread.peerWalletAddress).then(async (key) => {
            if (key) {
              cachedKeys[thread.peerWalletAddress] = key;
              localStorage.setItem('walletwhisper_peer_keys_sync', JSON.stringify(cachedKeys));
            } else {
              try {
                const resp = await api.getPublicKey(thread.peerWalletAddress);
                cachedKeys[thread.peerWalletAddress] = resp.msgPubKeyBase64;
                localStorage.setItem('walletwhisper_peer_keys_sync', JSON.stringify(cachedKeys));
                await setCachedPeerKey(thread.peerWalletAddress, resp.msgPubKeyBase64);
              } catch {
                // Peer key not available
              }
            }
          });
          return '[Encrypted]';
        }

        const peerPubKey = decodeBase64(peerKeyB64);
        const text = decryptMessage(
          thread.lastMessageCiphertext,
          thread.lastMessageNonce,
          peerPubKey,
          mySecretKey,
        );

        // Truncate for preview
        return text.length > 50 ? text.slice(0, 50) + '...' : text;
      } catch {
        return '[Unable to decrypt]';
      }
    },
    [],
  );

  const renderView = () => {
    if (loadingAutoOpen) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            background: '#0f1117',
          }}
        >
          <div
            style={{
              width: '28px',
              height: '28px',
              border: '3px solid #2a2d38',
              borderTopColor: '#6366f1',
              borderRadius: '50%',
              animation: 'walletwhisper-spin 0.8s linear infinite',
            }}
          />
        </div>
      );
    }

    if (!state.myWallet || state.view === 'connect') {
      return <ConnectWallet onConnected={handleConnected} />;
    }

    if (state.view === 'chat' && state.selectedThread) {
      return (
        <ChatView
          thread={state.selectedThread}
          myWallet={state.myWallet}
          onBack={handleBack}
          onBlock={handleBlock}
        />
      );
    }

    if (state.view === 'new-chat') {
      return (
        <StartChat
          onBack={handleBack}
          onThreadCreated={handleThreadCreated}
          initialAddress={state.newChatAddress || undefined}
          myWallet={state.myWallet}
        />
      );
    }

    // Default: thread list
    return (
      <ChatDrawer
        threads={state.threads}
        onSelectThread={handleSelectThread}
        onNewChat={handleNewChat}
        myWallet={state.myWallet}
        onDecryptLastMessage={decryptLastMessage}
      />
    );
  };

  return (
    <>
      <FloatingButton
        unreadCount={state.unreadCount}
        isOpen={state.isOpen}
        onClick={toggleDrawer}
      />

      <FloatingWindow isOpen={state.isOpen} onClose={toggleDrawer}>
        {renderView()}
      </FloatingWindow>

      {/* Keyframe animations injected as style */}
      <style>{`
        @keyframes walletwhisper-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};

export default App;
