/**
 * DOM scanner for detecting Solana wallet addresses in the page.
 * Uses a MutationObserver to watch for DOM changes and injects
 * WalletWhisper chat icons next to detected wallet addresses.
 */

import { SOLANA_ADDRESS_PATTERN, ABBREVIATED_ADDRESS_PATTERN, isSolanaAddress } from '@walletwhisper/shared';

const PROCESSED_ATTR = 'data-walletwhisper-processed';
const ICON_CLASS = 'walletwhisper-wallet-icon';

// Debounce timer
let scanTimer: ReturnType<typeof setTimeout> | null = null;
const SCAN_DEBOUNCE_MS = 50;

// Callback when a wallet address icon is clicked
type WalletClickHandler = (address: string) => void;
let onWalletClick: WalletClickHandler | null = null;

/**
 * Create the small chat icon element to inject next to a wallet address.
 */
function createWalletIcon(address: string): HTMLElement {
  const btn = document.createElement('span');
  btn.className = ICON_CLASS;
  btn.title = `Chat with ${address} on WalletWhisper`;
  btn.setAttribute('data-address', address);
  btn.style.cssText = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    margin-left: 4px;
    cursor: pointer;
    vertical-align: middle;
    border-radius: 4px;
    background: rgba(99, 102, 241, 0.15);
    transition: background 0.15s ease;
  `;
  btn.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"
            stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'rgba(99, 102, 241, 0.3)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'rgba(99, 102, 241, 0.15)';
  });

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onWalletClick) {
      onWalletClick(address);
    }
  });

  return btn;
}

/**
 * Check if an element is inside our own Shadow DOM container.
 */
function isInsideWalletWhisper(el: Node): boolean {
  let node: Node | null = el;
  while (node) {
    if (node instanceof HTMLElement && node.id === 'walletwhisper-root') return true;
    node = node.parentNode || (node as ShadowRoot).host || null;
  }
  return false;
}

/**
 * Remove ALL existing WalletWhisper icons and PROCESSED_ATTR marks from a root.
 * This guarantees a clean slate before re-scanning, preventing any duplication.
 */
function cleanupAll(root: Element | Document): void {
  // Remove all injected icons
  root.querySelectorAll(`.${ICON_CLASS}`).forEach((icon) => icon.remove());
  // Clear processed marks so elements get re-scanned
  root.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach((el) => el.removeAttribute(PROCESSED_ATTR));
}

/**
 * Inject an icon next to an element, but only if one doesn't already exist for this address.
 */
function injectIcon(el: Element, address: string): void {
  // Check immediate siblings for existing icon
  const next = el.nextElementSibling;
  if (next && next.classList.contains(ICON_CLASS) && next.getAttribute('data-address') === address) {
    return;
  }
  const icon = createWalletIcon(address);
  el.parentNode?.insertBefore(icon, el.nextSibling);
}

/**
 * Scan an element and its descendants for wallet addresses.
 */
function scanElement(root: Element | Document): void {
  // Full cleanup first — guarantees zero duplicates
  cleanupAll(root);

  const body = root instanceof Document ? root.body : root;
  if (!body) return;

  // 1. Check links to Solscan / Solana explorers
  root.querySelectorAll(
    'a[href*="solscan.io/account/"], a[href*="explorer.solana.com/address/"]',
  ).forEach((link) => {
    if (isInsideWalletWhisper(link)) return;
    const href = link.getAttribute('href') || '';
    const match = href.match(/(?:account|address)\/([1-9A-HJ-NP-Za-km-z]{32,44})/);
    if (match && isSolanaAddress(match[1])) {
      link.setAttribute(PROCESSED_ATTR, 'true');
      injectIcon(link, match[1]);
    }
  });

  // 2. Check elements with data-address attribute
  root.querySelectorAll('[data-address]').forEach((el) => {
    if (el.getAttribute(PROCESSED_ATTR)) return;
    if (isInsideWalletWhisper(el)) return;
    const addr = el.getAttribute('data-address') || '';
    if (isSolanaAddress(addr)) {
      el.setAttribute(PROCESSED_ATTR, 'true');
      injectIcon(el, addr);
    }
  });

  // 3. Scan text nodes for full wallet address patterns
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') return NodeFilter.FILTER_REJECT;
      if (parent.getAttribute(PROCESSED_ATTR)) return NodeFilter.FILTER_REJECT;
      if (parent.classList.contains(ICON_CLASS)) return NodeFilter.FILTER_REJECT;
      if (isInsideWalletWhisper(parent)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  let textNode: Node | null;
  while ((textNode = walker.nextNode())) {
    textNodes.push(textNode as Text);
  }

  for (const tn of textNodes) {
    const text = tn.textContent || '';
    SOLANA_ADDRESS_PATTERN.lastIndex = 0;
    const matches = text.match(SOLANA_ADDRESS_PATTERN);
    if (!matches) continue;

    const parent = tn.parentElement;
    if (!parent || parent.getAttribute(PROCESSED_ATTR)) continue;

    const seen = new Set<string>();
    for (const addr of matches) {
      if (seen.has(addr)) continue;
      if (!isSolanaAddress(addr)) continue;
      seen.add(addr);
      parent.setAttribute(PROCESSED_ATTR, 'true');
      injectIcon(parent, addr);
    }
  }

  // 4. Scan text nodes for abbreviated wallet addresses (e.g. "7xKX...3nPr")
  const abbrWalker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') return NodeFilter.FILTER_REJECT;
      if (parent.getAttribute(PROCESSED_ATTR)) return NodeFilter.FILTER_REJECT;
      if (parent.classList.contains(ICON_CLASS)) return NodeFilter.FILTER_REJECT;
      if (isInsideWalletWhisper(parent)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const abbrTextNodes: Text[] = [];
  let abbrNode: Node | null;
  while ((abbrNode = abbrWalker.nextNode())) {
    abbrTextNodes.push(abbrNode as Text);
  }

  for (const tn of abbrTextNodes) {
    const text = tn.textContent || '';
    ABBREVIATED_ADDRESS_PATTERN.lastIndex = 0;
    if (!ABBREVIATED_ADDRESS_PATTERN.test(text)) continue;

    const parent = tn.parentElement;
    if (!parent || parent.getAttribute(PROCESSED_ATTR)) continue;

    ABBREVIATED_ADDRESS_PATTERN.lastIndex = 0;
    let abbrMatch: RegExpExecArray | null;
    while ((abbrMatch = ABBREVIATED_ADDRESS_PATTERN.exec(text))) {
      const fullAddress = resolveFullAddress(parent, abbrMatch[1], abbrMatch[2]);
      if (!fullAddress) continue;
      parent.setAttribute(PROCESSED_ATTR, 'true');
      injectIcon(parent, fullAddress);
      break;
    }
  }
}

/**
 * Try to resolve a full Solana address from an abbreviated display.
 * Looks at the element and its ancestors for title, data-address, href, aria-label.
 * Also searches within the element's subtree for links containing full addresses.
 */
function resolveFullAddress(el: Element, prefix: string, suffix: string): string | null {
  // Check the element itself and up to 5 parent levels (deeper for Terminal's nested DOM)
  let node: Element | null = el;
  for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
    // title attribute
    const title = node.getAttribute('title');
    if (title && matchesPrefixSuffix(title, prefix, suffix)) return title.trim();

    // data-address attribute
    const dataAddr = node.getAttribute('data-address');
    if (dataAddr && matchesPrefixSuffix(dataAddr, prefix, suffix)) return dataAddr.trim();

    // aria-label attribute
    const ariaLabel = node.getAttribute('aria-label');
    if (ariaLabel && matchesPrefixSuffix(ariaLabel, prefix, suffix)) return ariaLabel.trim();

    // href on <a> elements
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') || '';
      // Solscan / Solana explorer links
      const hrefMatch = href.match(/(?:account|address)\/([1-9A-HJ-NP-Za-km-z]{32,44})/);
      if (hrefMatch && matchesPrefixSuffix(hrefMatch[1], prefix, suffix)) return hrefMatch[1];
      // Also try to extract address directly from path segments
      const segments = href.split('/');
      for (const seg of segments) {
        if (isSolanaAddress(seg) && matchesPrefixSuffix(seg, prefix, suffix)) return seg;
      }
    }

    // Search for <a> children that contain the full address in href
    const links = node.querySelectorAll('a[href]');
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      const hrefMatch = href.match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);
      if (hrefMatch && matchesPrefixSuffix(hrefMatch[1], prefix, suffix)) return hrefMatch[1];
    }
  }

  // Also check closest <a> ancestor
  const closestLink = el.closest('a');
  if (closestLink) {
    const href = closestLink.getAttribute('href') || '';
    const hrefMatch = href.match(/([1-9A-HJ-NP-Za-km-z]{32,44})/);
    if (hrefMatch && matchesPrefixSuffix(hrefMatch[1], prefix, suffix)) return hrefMatch[1];

    // Check title on the link
    const linkTitle = closestLink.getAttribute('title');
    if (linkTitle && matchesPrefixSuffix(linkTitle, prefix, suffix)) return linkTitle.trim();
  }

  return null;
}

/**
 * Check if a full address starts with prefix and ends with suffix.
 */
function matchesPrefixSuffix(candidate: string, prefix: string, suffix: string): boolean {
  const trimmed = candidate.trim();
  return isSolanaAddress(trimmed) && trimmed.startsWith(prefix) && trimmed.endsWith(suffix);
}

/**
 * Run a debounced scan of the entire document.
 */
function debouncedScan(): void {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    scanElement(document);
  }, SCAN_DEBOUNCE_MS);
}

let observer: MutationObserver | null = null;

/**
 * Start the DOM scanner.
 * @param clickHandler - Called when a user clicks a wallet chat icon.
 */
export function startScanner(clickHandler: WalletClickHandler): void {
  onWalletClick = clickHandler;

  // Initial scan
  scanElement(document);

  // Watch for DOM changes
  observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const mutation of mutations) {
      // Skip mutations caused by our own icon injection
      if (mutation.type === 'childList') {
        for (let i = 0; i < mutation.addedNodes.length; i++) {
          const node = mutation.addedNodes[i];
          if (node instanceof HTMLElement && node.classList.contains(ICON_CLASS)) continue;
          if (node instanceof HTMLElement && node.querySelector(`.${ICON_CLASS}`)) continue;
          shouldScan = true;
          break;
        }
        // Also trigger on removals (Terminal re-renders remove nodes)
        if (!shouldScan && mutation.removedNodes.length > 0) {
          for (let i = 0; i < mutation.removedNodes.length; i++) {
            const node = mutation.removedNodes[i];
            if (node instanceof HTMLElement && node.classList.contains(ICON_CLASS)) continue;
            shouldScan = true;
            break;
          }
        }
      }
      if (shouldScan) break;
    }
    if (shouldScan) {
      debouncedScan();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * Stop the DOM scanner and clean up.
 */
export function stopScanner(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (scanTimer) {
    clearTimeout(scanTimer);
    scanTimer = null;
  }
  onWalletClick = null;
}
