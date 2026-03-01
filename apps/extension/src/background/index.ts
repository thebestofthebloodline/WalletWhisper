/**
 * Background service worker for WalletWhisper Chrome extension.
 *
 * Handles:
 * - Extension icon click (toggle content script drawer)
 * - Badge text updates for unread count
 * - Notifications for new messages
 * - Message passing between content scripts and popup
 */

// Listen for extension icon click — tell content script to toggle the drawer
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_DRAWER' });
  } catch {
    // Content script might not be loaded yet on this page
    console.log('[WalletWhisper] Content script not available on this tab');
  }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'UPDATE_BADGE') {
    const count = message.count as number;
    const text = count > 0 ? (count > 99 ? '99+' : String(count)) : '';

    chrome.action.setBadgeText({ text }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ color: '#ef4444' }).catch(() => {});

    sendResponse({ ok: true });
    return;
  }

  if (message.type === 'SHOW_NOTIFICATION') {
    const { title, body, iconUrl } = message as {
      title: string;
      body: string;
      iconUrl?: string;
    };

    chrome.notifications.create({
      type: 'basic',
      iconUrl: iconUrl || 'icons/icon128.png',
      title,
      message: body,
      priority: 1,
    }).catch(() => {});

    sendResponse({ ok: true });
    return;
  }

  if (message.type === 'GET_ACTIVE_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      sendResponse({ tabId: tabs[0]?.id ?? null });
    });
    return true; // async response
  }

  // Proxy API calls from content scripts (bypasses page CORS restrictions)
  if (message.type === 'API_PROXY') {
    const { url, method, headers, body } = message as {
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: string;
    };

    fetch(url, { method, headers, body: body ?? undefined })
      .then(async (res) => {
        const text = await res.text();
        sendResponse({ ok: res.ok, status: res.status, body: text });
      })
      .catch((err) => {
        sendResponse({ ok: false, status: 0, body: '', error: err.message });
      });
    return true; // async response
  }
});

// Handle notification clicks — focus the tab and open the drawer
chrome.notifications.onClicked.addListener((_notificationId) => {
  chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'OPEN_DRAWER' }).catch(() => {});
    }
  });
});

// Handle extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[WalletWhisper] Extension installed');
    // Set default badge
    chrome.action.setBadgeText({ text: '' }).catch(() => {});
  } else if (details.reason === 'update') {
    console.log('[WalletWhisper] Extension updated to', chrome.runtime.getManifest().version);
  }
});

// Periodic alarm to keep the service worker alive for real-time features
// (Chrome MV3 service workers can be terminated after ~30s of inactivity)
chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepAlive') {
    // No-op — just keeps the service worker alive
  }
});

console.log('[WalletWhisper] Background service worker started');
