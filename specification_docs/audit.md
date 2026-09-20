# Security Audit Report — Halonyx E2EE Messenger

**Project:** Halonyx Secure Messaging Application  
**Document Type:** Comprehensive Security Audit & Threat Analysis  
**Framework:** Cloudflare Security Suite  
**Audit Scope:** Full Application Stack (`backend/`, `frontend/`, `protocol/`, `scripts/`, `Dockerfile`)  
**Date:** 2026-09-20  

> [!NOTE]
> **Credit Notice**: This security audit was structured and executed using the **Cloudflare Security Suite**.

---

## 1. Executive Summary

A comprehensive security audit of **Halonyx** was conducted following the 6-phase Cloudflare Security Audit methodology. Halonyx is a self-hostable, end-to-end encrypted messaging application implementing the **Signal Protocol (X3DH + Double Ratchet)** from scratch with **WebTorrent P2P file transfer** and dual SQLite database isolation.

### Key Audit Findings Matrix

| Risk Level | Finding ID | Vulnerability Title | Affected Component | Status / Recommendation |
|---|---|---|---|---|
| 🟡 **Medium** | AUD-01 | WebRTC IP Leakage via WebTorrent Peer Discovery | `frontend/js/app.js` | Disclose STUN/TURN fallback; optional proxy |
| 🟡 **Medium** | AUD-02 | One-Time Pre-Key (OPK) Exhaustion Window | `protocol/signal_protocol.js` | Implement client-side auto-replenishment threshold |
| 🟢 **Low** | AUD-03 | JWT Token Storage in `localStorage` | `frontend/js/app.js` | Migrate to `HttpOnly`, `SameSite=Strict` cookies |
| 🟢 **Low** | AUD-04 | Dual SQLite Database Cross-Correlation Risk | `backend/server.js` | `SHA-256(USID)` mapping verified; ensure key rotation |
| 🟢 **Low** | AUD-05 | Rate-Limiting Scope & IP Spoofing Prevention | `backend/server.js` | Express `trust proxy` configured with `draft-7` headers |
| ℹ️ **Pass** | AUD-06 | JWT Secret Generation & Persistence | `backend/server.js` | Verified dynamic hex secret generation via `crypto.randomBytes(32)` |
| ℹ️ **Pass** | AUD-07 | E2E Cryptographic Primitives & Safety Numbers | `protocol/` | Signal Protocol (X25519, HKDF-SHA256, AES-256-GCM) verified safe |

---

## 2. Audit Domains & Deep Dive Analysis

### Domain 1: Cryptographic Architecture & Protocol (`protocol/`)

**Skill Guidelines Applied:** `MEMORY-SAFETY-AND-BINARY.md`, `ATTACK-CLASSES.md`

#### Strengths Verified:
- **X3DH Handshake Integrity**: Uses 4-part Diffie-Hellman derivation (`DH1` through `DH4`) combining Identity Keys, Ephemeral Keys, Signed Pre-Keys, and One-Time Pre-Keys.
- **Double Ratchet Forward & Post-Compromise Secrecy**: Ephemeral DH ratcheting occurs on every reply sequence. Symmetric chain keys are derived using HKDF-SHA256 and discarded immediately after use.
- **Safety Numbers**: 60-digit fingerprint computed via `SHA-256(sort_lex([SHA256(aliceUsid) + alicePubKey, SHA256(bobUsid) + bobPubKey]))`. Protects against active MITM key substitution attacks.

#### Defect / Warning Analysis (AUD-02):
- **Finding**: High message velocity against a single recipient can exhaust their One-Time Pre-Keys (OPKs). Once OPKs are depleted, X3DH falls back to 3-part DH (`DH1`..`DH3`), slightly weakening forward secrecy for initial session establishment until `replenishPreKeysIfNecessary()` executes.

---

### Domain 2: HTTP Protocols & Authentication (`backend/server.js`)

**Skill Guidelines Applied:** `WEB-PROTOCOL-AND-AUTH.md`

#### Findings & Verification:
- **AUD-06 (Pass - JWT Security)**: `getJwtSecret()` checks `process.env.JWT_SECRET` first. If unset, it generates a persistent 256-bit cryptographically random secret in `./backend/db/.jwt_secret`. Unauthenticated JWT forging is impossible.
- **AUD-03 (Low - LocalStorage JWT)**: JWT is saved in `localStorage`. While convenient for single-page applications, any potential Cross-Site Scripting (XSS) vulnerability would allow token extraction.
  - *Recommendation*: Consider moving JWT auth to `HttpOnly`, `Secure`, `SameSite=Strict` cookies.
- **AUD-05 (Pass - Rate Limiting)**: `/signup` is limited to 5 requests per 5 minutes; `/keys/upload` is limited to 10 requests per 5 minutes using `express-rate-limit` with draft-7 standard headers.

---

### Domain 3: WebSocket Relay & Messaging (`backend/server.js`)

**Skill Guidelines Applied:** `PROTOCOLS-RPC-AND-MESSAGING.md`

#### Analysis:
- **Ciphertext Enforced**: The WebSocket relay parses incoming frames and rejects unencrypted payloads destined for other peers (`type: "message"` requires `ciphertext` and `header`).
- **Offline Mailbox Storage**: Offline messages are temporarily stored in `app.db` under the `mailbox` table. Upon recipient reconnect, queued messages are delivered over WebSocket and immediately purged (`DELETE FROM mailbox WHERE recipient = ?`).

---

### Domain 4: Storage & Data Isolation (`backend/db/`)

**Skill Guidelines Applied:** `DATA-ISOLATION-AND-LIFECYCLE.md`

#### Database Separation Review:
- **`identity.db`**: Stores sensitive metadata (`name`, `email`, `hashed_usid`).
- **`app.db`**: Stores operational data (`contacts`, `mailbox`).
- **`keys.db`**: Stores public key bundles.
- **Isolation Assessment**: The databases are strictly separated and linked only via `SHA-256(USID)`. Plaintext identity (`name`, `email`) is never written to `app.db` or `keys.db`.

---

### Domain 5: Client-Side Security & Network Privacy (`frontend/js/app.js`)

**Skill Guidelines Applied:** `CLIENT-SIDE.md`

#### WebTorrent / WebRTC IP Leakage (AUD-01):
- **Finding**: P2P file transfers use WebTorrent over WebRTC DataChannels. Peer discovery uses public STUN servers and WebRTC signaling. Consequently, peers exchanging files directly will observe each other's IP addresses during ICE candidate exchange.
- **Mitigation/Disclosure**: WebRTC IP disclosure is inherent to P2P file transfer. Halonyx explicitly discloses P2P transfer mechanics in the threat model documentation.

---

## 3. Container & Deployment Security (`Dockerfile`, `docker-compose.yml`)

**Skill Guidelines Applied:** `CLOUD-AND-DEPLOYMENT.md`

- **Base Image**: Uses official `node:20-alpine`, minimizing attack surface.
- **Build Isolation**: Build tools (`python3`, `make`, `g++`) are used only during `npm ci` for native SQLite compilation.
- **Data Persistence**: `VOLUME ["/app/backend/db"]` prevents data loss when containers restart.
- **Process Isolation**: Container runs single node server with defined health check (`wget --spider`).

---

## 4. Remediation Checklist

- [x] **Verified** Dynamic JWT secret generation (No hardcoded fallback).
- [x] **Verified** Dual-database strict isolation via `SHA-256(USID)`.
- [x] **Verified** X3DH + Double Ratchet crypto implementation against standard test vectors.
- [ ] **Recommended** Migrate `localStorage` JWT to `HttpOnly` cookies.
- [ ] **Recommended** Implement auto-replenishment threshold for X3DH OPK pre-keys when count falls below 5.

---

## 5. Acknowledgments & Credits

This security assessment was executed using the **Cloudflare Security Suite**.

- **Provider**: Cloudflare

