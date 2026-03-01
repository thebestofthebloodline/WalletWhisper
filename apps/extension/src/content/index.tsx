/**
 * Content script entry point for WalletWhisper.
 *
 * Creates a Shadow DOM container for full CSS isolation from the host page,
 * renders the React app inside it, and starts the DOM scanner for wallet
 * address detection.
 */

console.log('[WalletWhisper] Content script loaded');

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startScanner } from './dom-scanner';
import { injectBridge } from '@/utils/wallet-bridge';

// Avoid double-initialization
if (!(window as unknown as Record<string, boolean>).__walletwhisper_initialized) {
  (window as unknown as Record<string, boolean>).__walletwhisper_initialized = true;

  console.log('[WalletWhisper] Initializing...');
  init();
}

function init() {
  // 1. Create host element
  const host = document.createElement('div');
  host.id = 'walletwhisper-root';
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; top: 0; left: 0; width: 0; height: 0;';
  document.body.appendChild(host);

  // 2. Attach Shadow DOM for style isolation
  const shadow = host.attachShadow({ mode: 'open' });

  // 3. Inject styles into shadow root
  const styleEl = document.createElement('style');
  styleEl.textContent = getShadowStyles();
  shadow.appendChild(styleEl);

  // 4. Create React mount point inside shadow root
  const mountPoint = document.createElement('div');
  mountPoint.id = 'walletwhisper-app';
  mountPoint.style.cssText = 'all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;';
  shadow.appendChild(mountPoint);

  // 5. Render React app
  const root = createRoot(mountPoint);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );

  // 6. Inject wallet bridge into page context
  injectBridge();

  // 7. Start DOM scanner for wallet address detection
  startScanner((address) => {
    const openChat = (window as unknown as Record<string, (addr: string) => void>).__walletwhisper_openChat;
    if (openChat) {
      openChat(address);
    }
  });
}

/**
 * Returns all CSS needed inside the shadow root.
 * This includes a minimal reset and the dark theme styles.
 * We don't use Tailwind in the shadow DOM since it would require
 * a separate build step; instead all styles are inline in components.
 */
function getShadowStyles(): string {
  return `
    /* Reset inside shadow root */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    :host {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 14px;
      color: #e2e8f0;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* Scrollbar styling */
    ::-webkit-scrollbar {
      width: 6px;
    }
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    ::-webkit-scrollbar-thumb {
      background: #2a2d38;
      border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #3a3d48;
    }

    /* Animation keyframes */
    @keyframes walletwhisper-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @keyframes walletwhisper-slide-in {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }

    @keyframes walletwhisper-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    /* Textarea placeholder */
    textarea::placeholder {
      color: #64748b;
    }

    input::placeholder {
      color: #64748b;
    }

    /* Focus styles */
    button:focus-visible {
      outline: 2px solid #6366f1;
      outline-offset: 2px;
    }

    input:focus-visible, textarea:focus-visible {
      outline: none;
      border-color: #6366f1;
    }
  `;
}
