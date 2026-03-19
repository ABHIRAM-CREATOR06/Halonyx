<div align="center">

<pre>
██╗  ██╗ █████╗ ██╗      ██████╗ ███╗   ██╗██╗   ██╗██╗  ██╗
██║  ██║██╔══██╗██║     ██╔═══██╗████╗  ██║╚██╗ ██╔╝╚██╗██╔╝
███████║███████║██║     ██║   ██║██╔██╗ ██║ ╚████╔╝  ╚███╔╝ 
██╔══██║██╔══██║██║     ██║   ██║██║╚██╗██║  ╚██╔╝   ██╔██╗ 
██║  ██║██║  ██║███████╗╚██████╔╝██║ ╚████║   ██║   ██╔╝ ██╗
╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝
</pre>



### Secure Decentralized Messaging Application

> End-to-end encrypted messaging using the Signal Protocol — no message ever touches the server in plaintext.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org)
[![Signal Protocol](https://img.shields.io/badge/Signal%20Protocol-X3DH%20%2B%20Double%20Ratchet-2c6bed?style=flat)](https://signal.org/docs/)
[![AES-256-GCM](https://img.shields.io/badge/Encryption-AES--256--GCM-critical?style=flat)](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
[![JWT](https://img.shields.io/badge/Auth-JWT-orange?style=flat&logo=jsonwebtokens)](https://jwt.io)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat)](LICENSE)
[![Live](https://img.shields.io/badge/Live-halonyx.onrender.com-blueviolet?style=flat)](https://halonyx.onrender.com)

---

## 📖 Table of Contents

- [About](#-about)
- [Features](#-features)
- [Architecture](#-architecture)
- [Signal Protocol](#-signal-protocol)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [API Reference](#-api-reference)
- [Security](#-security)
- [Project Structure](#-project-structure)
- [Team](#-team)

---

## 🧠 About

**Halonyx** is a secure, decentralized web messaging application built for users who demand genuine privacy. It implements the **Signal Protocol** — the same cryptographic foundation used by Signal, WhatsApp, and Facebook Messenger — combined with a **USID (Unique Secure Identifier)** scheme that lets users communicate anonymously without exposing personal identity.

The Node.js relay server acts purely as a message forwarder. It never stores, reads, or logs message content. All encryption and decryption happens exclusively on the client.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔑 **USID Identity** | 256-bit pseudonymous identifier — no username or phone number required |
| 🔒 **End-to-End Encryption** | Signal Protocol (X3DH + Double Ratchet) for every message |
| 🛡️ **Forward Secrecy** | Per-message unique keys — past messages stay safe even if keys are compromised |
| 💀 **Zero Server Storage** | Messages never persisted server-side |
| ⚡ **Real-Time Messaging** | WebSocket-based instant delivery |
| 🚨 **Emergency Broadcast** | UDP-based system-wide alert mechanism |
| 🎨 **Material Design 3** | Clean, modern, responsive single-page UI |
| 🔄 **Post-Compromise Security** | New session keys after any potential compromise |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                       │
│         Vanilla JS  ·  CSS3  ·  Material Design 3           │
│              frontend/index.html  ·  app.js                 │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS / WSS
┌──────────────────────────▼──────────────────────────────────┐
│                     APPLICATION LAYER                        │
│   Express.js REST API (Port 3000)                           │
│   WebSocket Server   (Port 8081)                            │
│   UDP Broadcast      (Port 9000)                            │
│   Signal Protocol Implementation                            │
└────────────┬──────────────────────────┬─────────────────────┘
             │                          │
┌────────────▼───────────┐  ┌───────────▼──────────────────── ┐
│      identity.db       │  │           app.db                 │
│   users_metadata       │  │   users · contacts               │
│   (hashed_usid only)   │  │   (hashed_usid only)             │
└────────────────────────┘  └─────────────────────────────────┘
```

The system maintains **two isolated SQLite databases** to prevent cross-correlation of identity and operational data. The `hashed_usid` (SHA-256) is the only link between them — plaintext identity is never stored.

---

## 🔐 Signal Protocol

Halonyx implements the full Signal Protocol stack:

### X3DH Key Exchange
Four Diffie-Hellman operations establish the initial shared secret without prior contact:

```
DH1 = DH(IKa,  SPKb)   ← Identity key     × Signed pre-key
DH2 = DH(EKa,  IKb)    ← Ephemeral key    × Identity key
DH3 = DH(EKa,  SPKb)   ← Ephemeral key    × Signed pre-key
DH4 = DH(EKa,  OPKb)   ← Ephemeral key    × One-time pre-key

SK  = HKDF(DH1 || DH2 || DH3 || DH4)
```

### Double Ratchet
Continuous key ratcheting provides **forward secrecy** and **post-compromise security**:

```
Root Chain      →  derives sending/receiving chain keys
Sending Chain   →  derives per-message encryption keys
Receiving Chain →  derives per-message decryption keys
DH Ratchet      →  fresh ECDH on every ratchet step
```

### Session Lifecycle
```
CREATING → INITIALIZED → ESTABLISHED → CLOSED
```

---

## 🛠️ Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 18+ |
| Web Framework | Express.js | ^4.18.2 |
| Real-time | WebSocket (ws) | ^8.14.2 |
| Database | SQLite3 | — |
| Authentication | JWT | ^9.0.2 |
| Email | Nodemailer | ^6.9.7 |
| Cryptography | Web Crypto API | — |
| Frontend | Vanilla JS + CSS3 | — |
| UI System | Material Design 3 | — |

---

## 🚀 Getting Started

### Prerequisites
- Node.js v18 or higher
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/ABHIRAM-CREATOR06/Halonyx.git
cd halonyx

# Install dependencies
npm install
```

### Configuration

Create a `.env` file in the root directory:

```env
JWT_SECRET=your-secret-key-here
GMAIL_USER=your-gmail@gmail.com
GMAIL_PASS=your-app-password
```

### Running

```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

Open your browser at **http://localhost:3000**

### Windows
Double-click `start_server.bat` or run:
```cmd
start_server.bat
```

---

## 📡 API Reference

### REST Endpoints

#### `POST /signup` — Register a new user
```json
// Request
{ "name": "Alice", "email": "alice@example.com" }

// Response
{
  "message": "Account created",
  "usid": "a1b2c3d4e5f6...",
  "token": "eyJhbGci..."
}
```

#### `POST /add-contact` — Add a contact by USID
```
Authorization: Bearer <token>
```
```json
// Request
{ "usid": "recipient-usid-here" }

// Response
{ "message": "Contact Alice added" }
```

#### `GET /contacts` — Fetch contact list
```
Authorization: Bearer <token>
```

### WebSocket Messages

| Type | Direction | Structure |
|---|---|---|
| `register` | Client → Server | `{ "type": "register", "usid": "..." }` |
| `registered` | Server → Client | `{ "type": "registered", "success": true }` |
| `message` | Bidirectional | `{ "type": "message", "to": "hashed-usid", "content": "..." }` |
| `emergency_broadcast` | Client → Server | `{ "type": "emergency_broadcast", "content": "..." }` |
| `error` | Server → Client | `{ "type": "error", "message": "..." }` |

---

## 🛡️ Security

### Cryptographic Specifications

| Primitive | Algorithm | Key Size | Nonce |
|---|---|---|---|
| Symmetric Encryption | AES-256-GCM | 256 bits | 96 bits |
| Key Derivation | HKDF (PBKDF2) | 256 bits | — |
| Hashing | SHA-256 | 256 bits | — |
| Key Exchange | X25519 (ECDH) | 256 bits | — |
| Message Auth | HMAC-SHA256 | 256 bits | — |

### Threat Model

| Threat | Mitigation |
|---|---|
| Passive Eavesdropping | End-to-end encryption (AES-256-GCM) |
| Man-in-the-Middle | X3DH authenticated key exchange |
| Server Compromise | Forward secrecy via Double Ratchet |
| Device Loss | Session keys in memory only — never persisted |
| Replay Attacks | Message ratcheting + unique nonces per message |
| Future Key Compromise | Per-message key derivation |

### Security Properties
- ✅ **Forward Secrecy** — past messages protected even if current keys are leaked
- ✅ **Post-Compromise Security** — future messages protected after a compromise
- ✅ **Authentication** — HMAC tags on every message
- ✅ **Deniability** — no cryptographic proof that a message was sent by a specific party
- ✅ **Pseudonymity** — only SHA-256(USID) stored; plaintext identity never persisted

---

## 📁 Project Structure

```
Halonyx/
├── package.json
├── start_server.bat
├── backend/
│   ├── server.js              # Express + WebSocket + UDP
│   ├── email.js               # Email notifications
│   ├── utils.js               # USID generation & hashing
│   └── db/
│       ├── app.db             # Operational database
│       ├── identity.db        # Identity database
│       ├── schema.sql
│       └── identity_schema.sql
├── frontend/
│   ├── index.html             # Single-page application
│   ├── css/style.css          # Material Design 3 styles
│   └── js/app.js              # Frontend logic
└── protocol/
    ├── signal_protocol.js     # Protocol coordinator
    ├── x3dh.js                # X3DH key exchange
    ├── double_ratchet.js      # Double Ratchet algorithm
    ├── key_management.js      # Key lifecycle management
    ├── session.js             # Session state machine
    ├── crypto_utils.js        # Cryptographic primitives
    ├── README.md
    └── SECURITY_ANALYSIS.md
```

---

## 🔮 Roadmap

- [ ] Post-quantum cryptography (CRYSTALS-Dilithium / SPHINCS+)
- [ ] Multi-device session synchronisation
- [ ] Group messaging via Sender Keys
- [ ] QR code / fingerprint contact verification
- [ ] Encrypted file attachments
- [ ] Voice & video calls (WebRTC)
- [ ] Remote message deletion

---

## 👥 Team

| Name | Role |
|---|---|
| **Abhiram P** | Backend & Protocol |
| **Geo Jose** | Frontend & UI |
| **Anirudh** | Cryptography & Security |
| **Antony S Kannampuzha** | Database & Infrastructure |

*Department of Computer Science and Engineering*
*Sree Narayana Gurukulam College of Engineering (SNGCE), Kerala*
*APJ Abdul Kalam Technological University · 2026*

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <b>Halonyx</b> — Connect Securely. Leave No Trace.
</p>
```
