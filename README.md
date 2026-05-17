<div align="center">

<pre>
██╗  ██╗ █████╗ ██╗      ██████╗ ███╗   ██╗██╗   ██╗██╗  ██╗
██║  ██║██╔══██╗██║     ██╔═══██╗████╗  ██║╚██╗ ██╔╝╚██╗██╔╝
███████║███████║██║     ██║   ██║██╔██╗ ██║ ╚████╔╝  ╚███╔╝ 
██╔══██║██╔══██║██║     ██║   ██║██║╚██╗██║  ╚██╔╝   ██╔██╗ 
██║  ██║██║  ██║███████╗╚██████╔╝██║ ╚████║   ██║   ██╔╝ ██╗
╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝
</pre>

**Secure Decentralized Messaging · Signal Protocol (X3DH + Double Ratchet)**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org)
[![Signal Protocol](https://img.shields.io/badge/Signal%20Protocol-X3DH%20%2B%20Double%20Ratchet-2c6bed?style=flat)](https://signal.org/docs/)
[![AES-256-GCM](https://img.shields.io/badge/Encryption-AES--256--GCM-critical?style=flat)](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
[![WebTorrent](https://img.shields.io/badge/File%20Transfer-WebTorrent%20P2P-orange?style=flat&logo=bittorrent&logoColor=white)](https://webtorrent.io)
[![Safety Numbers](https://img.shields.io/badge/MITM%20Protection-Safety%20Numbers-success?style=flat)](https://signal.org/blog/safety-number-updates/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat)](LICENSE)
[![Live](https://img.shields.io/badge/Live-halonyx.onrender.com-blueviolet?style=flat)](https://halonyx.onrender.com)

</div>

---

Halonyx is an end-to-end encrypted messaging application built on the **Signal Protocol** — the same cryptography used by Signal and WhatsApp. Every message is encrypted on the client before it leaves your device. The relay server never sees plaintext. Files are transferred directly peer-to-peer over **WebTorrent (BitTorrent over WebRTC)** — the server never touches your files. Identity verification via **Safety Numbers** closes the last remaining attack surface: MITM key substitution.

---

## Features

- **USID Identity** — 256-bit pseudonymous identifier; no username or phone number required
- **End-to-End Encryption** — full Signal Protocol: X3DH key exchange + Double Ratchet on every message
- **Forward Secrecy** — per-message ephemeral keys; past messages stay safe even if current keys are compromised
- **Post-Compromise Security** — DH ratchet step on every reply; session heals automatically after a breach
- **Safety Numbers** — 60-digit fingerprint of both parties' identity keys; detects MITM key substitution out-of-band
- **Key Change Detection** — automatic warning when a contact's identity key changes between sessions
- **P2P File Transfer** — files shared via WebTorrent (BitTorrent over WebRTC); server is never in the data path
- **Live Transfer Stats** — real-time upload/download speed, progress bar, and seeding ratio per torrent
- **Offline Mailbox** — messages to offline peers are queued server-side and flushed on reconnect; at-most-once delivery
- **Real-Time Delivery** — WebSocket messaging with queued-message status indicator (clock icon on undelivered messages)
- **Dual Database Isolation** — identity metadata and operational data in separate SQLite databases, linked only by `SHA-256(USID)`
- **Emergency Broadcast** — UDP-bridged system-wide alert reachable from any connected client
- **Web Audio Notifications** — send and receive sounds synthesized via Web Audio API; no audio files required
- **Dark / Light Theme** — fully adaptive UI with smooth transitions
- **Contact Management** — add by USID, remove, search, duplicate auto-cleanup

---

## Getting Started

**Prerequisites:** Node.js v18+

```bash
git clone https://github.com/ABHIRAM-CREATOR06/Halonyx.git
cd halonyx
npm install
```

Create a `.env` file:

```env
JWT_SECRET=your-secret-key-here
GMAIL_USER=your-gmail@gmail.com
GMAIL_PASS=your-app-password
```

```bash
npm start        # production
npm run dev      # development (auto-reload)
```

Open **http://localhost:3000**. On Windows, run `start_server.bat`.

---

## Architecture

Two isolated SQLite databases prevent cross-correlation of identity and operational data. Only `SHA-256(USID)` links them — plaintext identity is never stored anywhere.

```
Client (Browser)
  └── HTTPS / WSS
        └── Express REST API  :3000
            WebSocket Server  :3000
            UDP Broadcast     :9000
                  │
          ┌───────┴──────────────┐
       identity.db            app.db          keys.db
    (name · email ·         (users ·        (public key
     hashed_usid)          contacts ·        bundles)
                             mailbox)

File Transfers
  └── WebTorrent (BitTorrent over WebRTC)
        └── Direct peer-to-peer — server not involved
```

### Key Bundle Storage

Each user uploads a public key bundle on registration. The bundle is stored in `keys.db` and served via authenticated REST endpoints. It is used for:

- **X3DH session initialisation** — recipient's pre-key bundle fetched before first message
- **Safety Number computation** — identity public key (P-256) fetched to derive the 60-digit verification fingerprint

```
Registration:
  Client generates P-256 identity key pair
  └── POST /keys/upload        → stores full X3DH bundle in keys.db
  └── POST /update-pubkey      → stores identity public key in app.db (for safety numbers)

Opening a chat:
  Client fetches peer bundle
  └── GET /keys/:hashedUsid    → returns pre-key bundle for X3DH

Verifying identity:
  Client fetches peer identity key
  └── GET /public-key/:hashedUsid → returns identity public key hex for safety number computation
```

### Offline Mailbox

When a recipient is offline the server stores the encrypted message payload in a `mailbox` table. On their next WebSocket reconnect, all queued messages are flushed and immediately deleted — ensuring at-most-once delivery with no permanent server retention.

```
Sender → Server (recipient offline)
  └── INSERT INTO mailbox (encrypted payload)   ← stored, never dropped
  └── { type: "queued" }                         ← sender sees clock icon

Recipient reconnects → Server
  └── SELECT * FROM mailbox WHERE recipient = ?
  └── forward each message via WebSocket
  └── DELETE FROM mailbox WHERE recipient = ?
```

### P2P File Transfer (WebTorrent)

Files are never uploaded to the Halonyx server. Instead:

1. Sender **seeds** the file using WebTorrent — BitTorrent running entirely in the browser via WebRTC
2. A **magnet URI** is sent to the recipient through the encrypted message channel
3. Recipient's browser **leeches** directly from the sender over WebRTC data channels
4. Public trackers (`openwebtorrent.com`, `webtorrent.dev`) handle peer discovery only — they never see file contents
5. NAT Traversal is supported via **STUN** and **TURN** servers (e.g., `openrelay.metered.ca`), ensuring P2P connections succeed even for users behind strict firewalls or symmetric NATs
6. Live upload speed, download speed, progress percentage, and seeding ratio are displayed in real time

```
Sender Browser                        Recipient Browser
  └── WebTorrent.seed(file)  →  magnet URI (via encrypted WS)
  └── WebRTC DataChannel ──────────────────────────────────→ WebTorrent.download()
                              (direct P2P, server not involved)
```

---

## Signal Protocol

### X3DH Key Exchange

Four Diffie-Hellman operations establish a shared secret with a party you have never contacted before:

```
DH1 = DH(IKa,  SPKb)    — Alice's identity    × Bob's signed pre-key
DH2 = DH(EKa,  IKb)     — Alice's ephemeral   × Bob's identity
DH3 = DH(EKa,  SPKb)    — Alice's ephemeral   × Bob's signed pre-key
DH4 = DH(EKa,  OPKb)    — Alice's ephemeral   × Bob's one-time pre-key

SK  = HKDF(DH1 ‖ DH2 ‖ DH3 ‖ DH4)
```

The server relays an opaque `x3dh_init` packet to the recipient who runs the responder path and derives the same `SK` independently.

### Double Ratchet

After X3DH establishes the root key, every message advances the Double Ratchet:

- **Symmetric ratchet** — each message derives a unique key from the current chain key; keys are used once and discarded
- **DH ratchet** — every reply triggers a new DH exchange, deriving fresh root and chain keys
- Compromising message N reveals nothing about messages 1…N-1 (forward secrecy) or N+1…∞ (post-compromise security)

### Key Persistence (IndexedDB)

Identity keys, signed pre-keys, one-time pre-keys, and Double Ratchet session state all persist across page reloads via IndexedDB:

- Private keys stored as non-exportable `CryptoKey` objects — never serialised to raw bytes
- Session state (root key, chain keys, ratchet DH keys) restored on reconnect
- Each USID maps 1:1 to a stable cryptographic identity across sessions

---

## Safety Numbers

Safety Numbers close the MITM gap. Even with perfect E2E encryption, a malicious server could substitute public keys during X3DH — reading all messages without either party knowing.

### How It Works

Each user generates a **P-256 ECDH identity key pair** at registration. The public key is uploaded to the server. To verify a session:

1. Alice fetches Bob's identity public key from `GET /public-key/:hashedUsid`
2. Both parties independently compute:

```
safetyNumber = SHA-256(
    sort_lex([SHA256(aliceUsid) + alicePubKey,
              SHA256(bobUsid)   + bobPubKey])
)
→ formatted as 12 groups of 5 digits across 4 rows (60 digits total)
```

3. Alice and Bob compare the number over a voice call or in person
4. If they match → no MITM, session is cryptographically verified
5. If they differ → a key was substituted → attack detected

### Key Change Detection

The last-seen safety number is stored in `localStorage`. On every subsequent verification:

- **Same number** → keys unchanged, session is clean
- **Different number** → contact may have re-registered, or a MITM substituted a key → prominent warning shown before proceeding

### MITM Attack Visualised

```
Without Safety Numbers (vulnerable):

  Alice                  Server (malicious)              Bob
    │── GET /public-key ──→│                               │
    │←─ Mallory's key ─────│  ← server substitutes        │
    │                       │                               │
    │  encrypts to Mallory  │                               │
    │── ciphertext ────────→│── re-encrypts to Bob ────────→│
    │                  server reads everything              │

With Safety Numbers (protected):

  Alice sees:  12345 67890 11111
  Bob   sees:  72891 23456 78901   ← mismatch → attack caught ✅
```

---

## API

### REST

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/signup` | POST | — | Register — returns `usid` + JWT |
| `/add-contact` | POST | ✓ | Add a contact by USID |
| `/contacts` | GET | ✓ | Fetch contact list (hashed USIDs) |
| `/contacts` | DELETE | ✓ | Remove a contact by hashed USID |
| `/cleanup-duplicates` | POST | ✓ | Remove duplicate contacts for current user |
| `/keys/upload` | POST | ✓ | Upload full X3DH public key bundle |
| `/keys/:hashedUsid` | GET | — | Fetch peer's X3DH key bundle |
| `/public-key/:hashedUsid` | GET | ✓ | Fetch peer's identity public key (for safety numbers) |
| `/update-pubkey` | POST | ✓ | Push identity public key without re-registering |

All authenticated routes require `Authorization: Bearer <token>`.

### WebSocket

| Type | Direction | Description |
|---|---|---|
| `register` | Client → Server | Authenticate WS session with USID |
| `registered` | Server → Client | Identity confirmed; offline mailbox flushed |
| `message` | Bidirectional | Encrypted message payload (or plaintext fallback) |
| `x3dh_init` | Bidirectional | Relay X3DH handshake packet to recipient |
| `queued` | Server → Client | Recipient offline — message stored in mailbox |
| `emergency_broadcast` | Client → Server | UDP-bridged system-wide alert |
| `error` | Server → Client | Auth or routing failure |

---

## Security

| Primitive | Algorithm | Key Size |
|---|---|---|
| Symmetric Encryption | AES-256-GCM | 256 bits |
| Key Derivation | HKDF-SHA256 | 256 bits |
| Hashing | SHA-256 | 256 bits |
| Asymmetric Key Exchange | X25519 (ECDH) | 256 bits |
| Identity / Safety Numbers | P-256 (ECDH) | 256 bits |
| Message Authentication | HMAC-SHA256 | 256 bits |
| Pre-Key Signing | Ed25519 | 256 bits |

**Guarantees:** forward secrecy · post-compromise security · HMAC authentication · deniability · pseudonymity · MITM detection via safety numbers

---

## Documentation & Analysis

For deep technical dives into Halonyx's security model and system performance, refer to the following documents:

- **[Data Threat Model (`datathreat/datathreat.md`)](datathreat/datathreat.md):** A comprehensive STRIDE analysis of the system, covering 16 potential threats, vulnerabilities, and their mitigations (including WebRTC IP leaks, JWT exposure, and offline mailbox security).
- **[Performance Benchmarks (`benchmark/benchmark.md`)](benchmark/benchmark.md):** Detailed latency and throughput metrics for cryptographic operations (X3DH, Double Ratchet), WebSocket messaging, SQLite operations, and WebTorrent P2P file transfers over STUN/TURN.

---

## Project Structure

```
Halonyx/
├── backend/
│   ├── server.js              # Express + WebSocket + UDP + offline mailbox
│   │                          # + /keys/upload, /public-key, /update-pubkey
│   ├── email.js
│   ├── utils.js               # USID generation & hashing
│   └── db/
│       ├── app.db             # users · contacts · mailbox
│       ├── identity.db        # hashed_usid ↔ email/name metadata
│       ├── keys.db            # X3DH public key bundles
│       ├── schema.sql
│       ├── identity_schema.sql
│       └── key_schema.sql
├── frontend/
│   ├── index.html             # Three-pane layout + Safety Numbers dialog
│   ├── css/style.css          # Dark/light adaptive UI, Signal-style bubbles
│   └── js/app.js              # WebTorrent · WS · E2EE wiring · Safety Numbers
└── protocol/
    ├── signal_protocol.js     # Top-level façade: init, openSession, encrypt, decrypt
    ├── x3dh.js                # X3DH initiator + responder paths
    ├── double_ratchet.js      # Double Ratchet with HKDF chain KDF
    ├── key_management.js      # Key pair generation, pre-key bundles
    ├── idb_key_store.js       # IndexedDB persistence for keys and session state
    ├── session.js             # Session lifecycle management
    └── crypto_utils.js        # AES-256-GCM, HKDF, HMAC, X25519 primitives
```

---

## Roadmap

- [x] End-to-end encrypted messaging (Signal Protocol — X3DH + Double Ratchet)
- [x] P2P file transfer (WebTorrent / BitTorrent over WebRTC)
- [x] Offline message mailbox with at-most-once delivery
- [x] Key bundle endpoints (upload, fetch, update)
- [x] IndexedDB key persistence across page reloads
- [x] Safety Numbers — 60-digit MITM detection fingerprint
- [x] Key change detection with session warning
- [x] Live torrent stats (speed, progress, ratio)
- [x] Web Audio notification sounds
- [x] Dark / light theme
- [x] Contact remove + duplicate cleanup
- [ ] OPK replenishment monitoring
- [ ] Safety number QR code scan
- [ ] Post-quantum cryptography (CRYSTALS-Dilithium / SPHINCS+)
- [ ] Multi-device session sync
- [ ] Group messaging via Sender Keys
- [ ] Voice & video (WebRTC)
- [ ] Push notifications (Web Push / VAPID)

---

## Team

Built at **SNGCE, Kerala** · APJ Abdul Kalam Technological University · 2026

| Name | Role |
|---|---|
| Abhiram P | Backend · Signal Protocol · Safety Numbers |
| Geo Jose | Frontend · UI/UX · Theme System |
| Anirudh | Frontend · Testing · WebTorrent Integration |
| Antony S Kannampuzha | Database · Infrastructure · Key Storage |

---

<div align="center"><sub>Connect Securely. Leave No Trace.</sub></div>
