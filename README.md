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
[![License](https://img.shields.io/badge/License-MIT-green?style=flat)](LICENSE)
[![Live](https://img.shields.io/badge/Live-halonyx.onrender.com-blueviolet?style=flat)](https://halonyx.onrender.com)

</div>

---

Halonyx is an end-to-end encrypted messaging app built on the **Signal Protocol** — the same cryptography behind Signal and WhatsApp. Messages are encrypted on the client before they leave your device. The relay server never sees plaintext. Files are transferred directly peer-to-peer over **WebTorrent (BitTorrent)** — the server never touches your files.

## Features

- **USID Identity** — 256-bit pseudonymous identifier; no username or phone number required
- **End-to-End Encryption** — X3DH key exchange + Double Ratchet on every message
- **Forward Secrecy** — per-message keys; past messages are safe even if current keys are leaked
- **P2P File Transfer** — files are shared via **WebTorrent (BitTorrent over WebRTC)**; the server is never in the data path
- **Offline Mailbox** — messages sent to offline peers are queued server-side and flushed automatically on reconnect
- **Real-Time Delivery** — WebSocket-based instant messaging with live delivery status
- **Emergency Broadcast** — UDP-based system-wide alert mechanism
- **Post-Compromise Security** — fresh session keys after any potential breach

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

## Architecture

Two isolated SQLite databases prevent cross-correlation of identity and operational data. Only `SHA-256(USID)` links them — plaintext identity is never stored.

```
Client (Browser)
  └── HTTPS / WSS
        └── Express REST API  :3000
            WebSocket Server  :3000
            UDP Broadcast     :9000
                  │
          ┌───────┴────────┐
       identity.db       app.db
    (hashed_usid only)  (users · contacts · mailbox)

File Transfers
  └── WebTorrent (BitTorrent over WebRTC)
        └── Direct peer-to-peer — server not involved
```

### Offline Mailbox

When a recipient is offline, the server stores the message in a `mailbox` table. On their next WebSocket reconnect the server flushes all queued messages and deletes them — ensuring at-most-once delivery with no permanent server retention.

```
Sender → Server (recipient offline)
  └── INSERT INTO mailbox ...      ← stored, not dropped
  └── { type: "queued" }           ← sender notified

Recipient reconnects → Server
  └── SELECT * FROM mailbox WHERE recipient = ?
  └── forward each message via WS
  └── DELETE FROM mailbox WHERE recipient = ?
```

### P2P File Transfer (WebTorrent)

Files are never uploaded to the Halonyx server. Instead:

1. The sender **seeds** the file using WebTorrent — a BitTorrent client that runs entirely in the browser via WebRTC
2. A **magnet URI** is sent to the recipient through the encrypted message channel
3. The recipient's browser **leeches** the file directly from the sender (and any other seeders) over WebRTC data channels
4. Public BitTorrent trackers (`openwebtorrent.com`, `webtorrent.dev`, etc.) are used for peer discovery only — they never see file contents

```
Sender Browser                    Recipient Browser
  └── WebTorrent.seed(file)  →  magnet URI (via WS)
  └── WebRTC DataChannel ──────────────────────────→ WebTorrent.download()
                          (direct P2P, no server)
```

## Signal Protocol

**X3DH Key Exchange** — four DH operations establish a shared secret with a party you've never contacted:
```
DH1 = DH(IKa, SPKb)    DH2 = DH(EKa, IKb)
DH3 = DH(EKa, SPKb)    DH4 = DH(EKa, OPKb)
SK  = HKDF(DH1 ‖ DH2 ‖ DH3 ‖ DH4)
```

**Double Ratchet** — continuous key ratcheting provides forward secrecy and post-compromise security. A DH ratchet step occurs on every reply, deriving fresh chain keys and per-message encryption keys.

## API

### REST

| Endpoint | Method | Description |
|---|---|---|
| `/signup` | POST | Register — returns `usid` + JWT |
| `/add-contact` | POST | Add a contact by USID |
| `/contacts` | GET | Fetch contact list (returns hashed USIDs) |
| `/contacts` | DELETE | Remove a contact by hashed USID |

All authenticated routes require `Authorization: Bearer <token>`.

### WebSocket

| Type | Direction | Description |
|---|---|---|
| `register` | Client → Server | Authenticate WS session with USID |
| `registered` | Server → Client | Identity confirmed; mailbox flushed |
| `message` | Bidirectional | Encrypted message payload |
| `queued` | Server → Client | Recipient offline — message stored in mailbox |
| `emergency_broadcast` | Client → Server | UDP-bridged system-wide alert |
| `error` | Server → Client | Auth or routing failure |

## Security

| Primitive | Algorithm | Key Size |
|---|---|---|
| Symmetric Encryption | AES-256-GCM | 256 bits |
| Key Derivation | HKDF (PBKDF2) | 256 bits |
| Hashing | SHA-256 | 256 bits |
| Key Exchange | X25519 (ECDH) | 256 bits |
| Message Auth | HMAC-SHA256 | 256 bits |

**Guarantees:** forward secrecy · post-compromise security · HMAC authentication · deniability · pseudonymity

## Project Structure

```
Halonyx/
├── backend/
│   ├── server.js          # Express + WebSocket + UDP + offline mailbox
│   ├── email.js
│   ├── utils.js           # USID generation & hashing
│   └── db/
│       ├── app.db         # users · contacts · mailbox
│       ├── identity.db    # hashed_usid ↔ email/name metadata
│       └── *.sql
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js          # WebTorrent client + WS + UI
└── protocol/
    ├── signal_protocol.js
    ├── x3dh.js
    ├── double_ratchet.js
    ├── key_management.js
    ├── session.js
    └── crypto_utils.js
```

## Roadmap

- [x] End-to-end encrypted messaging (Signal Protocol)
- [x] P2P file transfer (WebTorrent / BitTorrent)
- [x] Offline message mailbox
- [ ] Post-quantum cryptography (CRYSTALS-Dilithium / SPHINCS+)
- [ ] Multi-device session sync
- [ ] Group messaging via Sender Keys
- [ ] Voice & video (WebRTC)

## Team

Built at **SNGCE, Kerala** · APJ Abdul Kalam Technological University · 2026

| Name | Role |
|---|---|
| Abhiram P | Backend & Protocol |
| Geo Jose | Frontend & UI |
| Anirudh | Frontend & Testing |
| Antony S Kannampuzha | Database & Infrastructure |

---

<div align="center"><sub>Connect Securely. Leave No Trace.</sub></div>
