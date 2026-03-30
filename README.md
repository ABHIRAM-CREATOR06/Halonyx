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
[![License](https://img.shields.io/badge/License-MIT-green?style=flat)](LICENSE)
[![Live](https://img.shields.io/badge/Live-halonyx.onrender.com-blueviolet?style=flat)](https://halonyx.onrender.com)

</div>

---

Halonyx is an end-to-end encrypted messaging app built on the **Signal Protocol** — the same cryptography behind Signal and WhatsApp. Messages are encrypted on the client before they leave your device. The relay server never sees plaintext.

## Features

- **USID Identity** — 256-bit pseudonymous identifier; no username or phone number required
- **End-to-End Encryption** — X3DH key exchange + Double Ratchet on every message
- **Forward Secrecy** — per-message keys; past messages are safe even if current keys are leaked
- **Zero Server Storage** — messages are never persisted server-side
- **Real-Time Delivery** — WebSocket-based instant messaging
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
            WebSocket Server  :8081
            UDP Broadcast     :9000
                  │
          ┌───────┴────────┐
       identity.db       app.db
    (hashed_usid only)  (users · contacts)
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
| `/contacts` | GET | Fetch contact list |

All authenticated routes require `Authorization: Bearer <token>`.

### WebSocket

| Type | Direction |
|---|---|
| `register` | Client → Server |
| `registered` | Server → Client |
| `message` | Bidirectional |
| `emergency_broadcast` | Client → Server |
| `error` | Server → Client |

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
│   ├── server.js          # Express + WebSocket + UDP
│   ├── email.js
│   ├── utils.js           # USID generation & hashing
│   └── db/
│       ├── app.db
│       ├── identity.db
│       └── *.sql
├── frontend/
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
└── protocol/
    ├── signal_protocol.js
    ├── x3dh.js
    ├── double_ratchet.js
    ├── key_management.js
    ├── session.js
    └── crypto_utils.js
```

## Roadmap

- [ ] Post-quantum cryptography (CRYSTALS-Dilithium / SPHINCS+)
- [ ] Multi-device session sync
- [ ] Group messaging via Sender Keys
- [ ] Encrypted file attachments
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

<div align="center"><sub>Connect Securely. Leave No Traces.</sub></div>
