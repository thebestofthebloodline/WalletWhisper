# WalletWhisper

**Encrypted wallet-to-wallet chat for trading terminals.**

WalletWhisper is a Chrome extension that overlays real-time, end-to-end encrypted messaging into web-based trading terminals. Message any Solana wallet directly from the terminal UI.

> **Disclaimer:** WalletWhisper is NOT affiliated with Terminal Trade, Padre, Axiom, or any trading platform. It is an independent tool that works as a browser overlay.

## Features

- **Wallet-to-Wallet Chat** — Message any Solana address directly
- **End-to-End Encryption** — NaCl Box (Curve25519 + XSalsa20-Poly1305) ensures only sender and recipient can read messages
- **Real-Time Delivery** — WebSocket-powered instant messaging with Socket.IO
- **Wallet Authentication** — Sign-in via Solana wallet signature (signMessage) — no passwords, no emails
- **Trading Terminal Integration** — Injects chat icons next to detected wallet addresses in holders lists, trader tables, etc.
- **Spam/Abuse Controls** — Message requests inbox, block/report, rate limiting, safety mode
- **Dark Theme** — Designed for trading terminal aesthetics
- **Privacy-First** — Server stores only ciphertext + minimal metadata. No plaintext. No doxxing info.

## Architecture

```
Browser Extension (Chrome MV3)
├── Content Script → Shadow DOM overlay (chat drawer, floating button)
├── DOM Scanner → MutationObserver detects wallet addresses on page
├── Wallet Bridge → Communicates with Phantom/Solflare via page script injection
├── E2EE Crypto → tweetnacl box for encrypt/decrypt (client-side only)
└── Socket.IO Client → Real-time message delivery

Backend Server (Fastify + Socket.IO)
├── Auth → Wallet signature challenge/verify → JWT
├── Key Registry → Public messaging key storage with binding signatures
├── Threads → Thread management with deterministic pair ordering
├── Messages → Ciphertext storage and delivery (no plaintext)
├── Socket.IO → Real-time events (new messages, unread counts)
└── Moderation → Block, report, rate limits

Database (PostgreSQL via Prisma)
├── UserWallet → Wallet addresses + messaging public keys
├── Thread → Conversations between wallet pairs
├── Message → Encrypted messages (ciphertext only)
├── ThreadState → Per-user thread state (read position, accepted, blocked)
└── Report → Abuse reports
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm workspaces |
| Backend | Node 20+, Fastify, Socket.IO, Prisma, PostgreSQL |
| Extension | Chrome MV3, Vite, React 18, TypeScript |
| Crypto | tweetnacl (NaCl Box — Curve25519/XSalsa20-Poly1305) |
| Auth | Solana wallet signature (ed25519), JWT |
| Styling | Inline styles with dark theme (Shadow DOM isolated) |
| Validation | Zod |
| Testing | Vitest |

## Project Structure

```
WalletWhisper/
├── apps/
│   ├── server/          # Fastify backend
│   │   ├── prisma/      # Database schema
│   │   └── src/
│   │       ├── routes/  # API endpoints
│   │       ├── middleware/
│   │       ├── socket/  # Socket.IO setup
│   │       └── __tests__/
│   └── extension/       # Chrome extension
│       └── src/
│           ├── content/     # Content script + React components
│           ├── background/  # Service worker
│           ├── options/     # Settings page
│           └── utils/       # API, storage, crypto, wallet bridge
├── packages/
│   └── shared/          # Types, crypto helpers, address utils
├── infra/
│   └── docker-compose.yml  # PostgreSQL
└── README.md
```

## Prerequisites

- **Node.js** 20+
- **pnpm** (`npm i -g pnpm`)
- **Docker** (for PostgreSQL)
- **Chrome** browser
- **Solana wallet** extension (Phantom or Solflare)

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/thebestofthebloodline/WalletWhisper.git
cd WalletWhisper
pnpm install
```

### 2. Start PostgreSQL

```bash
pnpm db:up
```

### 3. Configure environment

```bash
cp apps/server/.env.example apps/server/.env
# Edit .env if needed (defaults work for local dev)
```

### 4. Run database migrations

```bash
cd apps/server
npx prisma migrate dev --name init
cd ../..
```

### 5. Build shared package

```bash
pnpm build:shared
```

### 6. Start the server

```bash
pnpm dev:server
# Server runs at http://localhost:4000
# Health check: http://localhost:4000/health
```

### 7. Build the extension

```bash
pnpm build:ext
```

### 8. Load extension in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `apps/extension/dist` folder
5. The WalletWhisper icon appears in your toolbar

### 9. Test it!

Navigate to any web page. You should see a floating purple chat button in the bottom-right corner. Click it to open WalletWhisper and connect your wallet.

## Testing Between Two Users

To test real messaging:

1. Open Chrome with two separate profiles (or use one Chrome + one Chrome Incognito with a different wallet)
2. Load the extension in both profiles
3. Start the server: `pnpm dev:server`
4. In Profile A: connect Wallet A, copy the address
5. In Profile B: connect Wallet B, click "New Chat", paste Wallet A's address
6. Send a message from Profile B → it appears in real-time in Profile A
7. Verify the message is encrypted: check the database — only ciphertext is stored

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /auth/challenge | No | Request login nonce |
| POST | /auth/verify | No | Verify wallet signature, get JWT |
| POST | /keys/register | JWT | Register messaging public key |
| GET | /keys/:walletAddress | No | Get wallet's messaging public key |
| POST | /threads/open | JWT | Open/get thread with another wallet |
| GET | /threads | JWT | List all threads |
| POST | /threads/:id/accept | JWT | Accept a thread (move to inbox) |
| GET | /threads/:id/messages | JWT | Get thread messages (paginated) |
| POST | /messages/send | JWT | Send encrypted message |
| POST | /moderation/block | JWT | Block a wallet |
| POST | /moderation/report | JWT | Report a wallet |
| GET | /admin/reports | Admin | List reports |
| GET | /admin/spammers | Admin | List top message senders |

## Security Model

### Authentication
- Login via Solana wallet `signMessage` — proves ownership of the public key
- No passwords, no email, no personal data collected
- Server issues JWT after signature verification

### End-to-End Encryption
- Each user generates a Curve25519 keypair for messaging (separate from wallet keys)
- Messaging key is bound to wallet via a signed registration message
- Messages encrypted with NaCl Box: `nacl.box(plaintext, nonce, recipientPubKey, senderSecretKey)`
- Server stores only ciphertext + nonce — **zero access to plaintext**
- Random nonces prevent ciphertext correlation

### Privacy
- No names, emails, or identifiable data stored
- Only public wallet addresses + ciphertext + timestamps
- Messaging keypair stored locally in `chrome.storage.local`

## Running Tests

```bash
# All tests
pnpm test

# Shared package tests
pnpm test:shared

# Server tests
pnpm test:server
```

## Environment Variables

See `apps/server/.env.example` for all options:

| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | postgresql://... | PostgreSQL connection string |
| JWT_SECRET | (required) | Secret for JWT signing |
| JWT_EXPIRES_IN | 24h | JWT expiration time |
| PORT | 4000 | Server port |
| CORS_ORIGINS | * | Allowed CORS origins |
| ADMIN_TOKEN | (optional) | Token for admin endpoints |
| MAX_NEW_CONVERSATIONS_PER_DAY | 20 | Rate limit: new threads/day |
| MAX_FIRST_CONTACT_PER_DAY | 5 | Rate limit: first-contact threads/day |

## Extension Settings

Access via: Extension icon → Right-click → Options

- **Server URL** — Backend server address (default: http://localhost:4000)
- **Notifications** — Enable/disable desktop notifications
- **Safety Mode** — Only receive messages from wallets you've chatted with first
- **Clear Data** — Wipe all local storage (keys, tokens, cache)

## License

MIT

---

*Built with tweetnacl, Fastify, Socket.IO, React, and Vite.*
