/**
 * Socket.IO client manager for WalletWhisper real-time events.
 * Connects to the /realtime namespace with JWT authentication.
 */

import { io, type Socket } from 'socket.io-client';
import { getToken, getSettings } from './storage';
import type { SocketNewMessage, SocketUnreadUpdate, SocketMarkRead } from '@walletwhisper/shared';

type MessageHandler = (msg: SocketNewMessage) => void;
type UnreadHandler = (data: SocketUnreadUpdate) => void;
type ConnectHandler = () => void;
type DisconnectHandler = (reason: string) => void;

interface EventHandlers {
  message: Set<MessageHandler>;
  unread: Set<UnreadHandler>;
  connect: Set<ConnectHandler>;
  disconnect: Set<DisconnectHandler>;
}

let socket: Socket | null = null;

const handlers: EventHandlers = {
  message: new Set(),
  unread: new Set(),
  connect: new Set(),
  disconnect: new Set(),
};

/**
 * Connect to the WalletWhisper real-time server.
 * Automatically retrieves JWT from storage for authentication.
 */
export async function connect(): Promise<void> {
  // Disconnect any existing socket first
  if (socket?.connected) {
    socket.disconnect();
  }

  const token = await getToken();
  if (!token) {
    console.warn('[WalletWhisper] Cannot connect socket: no JWT token');
    return;
  }

  const settings = await getSettings();
  const url = settings.serverUrl;

  socket = io(url, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
  });

  socket.on('connect', () => {
    console.log('[WalletWhisper] Socket connected');
    handlers.connect.forEach((fn) => fn());
  });

  socket.on('disconnect', (reason) => {
    console.log('[WalletWhisper] Socket disconnected:', reason);
    handlers.disconnect.forEach((fn) => fn(reason));
  });

  socket.on('connect_error', (err) => {
    console.error('[WalletWhisper] Socket connection error:', err.message);
  });

  socket.on('message:new', (data: SocketNewMessage) => {
    handlers.message.forEach((fn) => fn(data));
  });

  socket.on('threads:unread', (data: SocketUnreadUpdate) => {
    handlers.unread.forEach((fn) => fn(data));
  });
}

/**
 * Disconnect from the real-time server.
 */
export function disconnect(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Emit a mark-read event for a thread.
 */
export function markRead(threadId: string): void {
  if (socket?.connected) {
    const payload: SocketMarkRead = { threadId };
    socket.emit('threads:markRead', payload);
  }
}

/**
 * Check if the socket is currently connected.
 */
export function isConnected(): boolean {
  return socket?.connected ?? false;
}

// ─── Event registration ───

export function onMessage(handler: MessageHandler): () => void {
  handlers.message.add(handler);
  return () => {
    handlers.message.delete(handler);
  };
}

export function onUnread(handler: UnreadHandler): () => void {
  handlers.unread.add(handler);
  return () => {
    handlers.unread.delete(handler);
  };
}

export function onConnect(handler: ConnectHandler): () => void {
  handlers.connect.add(handler);
  return () => {
    handlers.connect.delete(handler);
  };
}

export function onDisconnect(handler: DisconnectHandler): () => void {
  handlers.disconnect.add(handler);
  return () => {
    handlers.disconnect.delete(handler);
  };
}
