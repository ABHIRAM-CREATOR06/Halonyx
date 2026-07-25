# Halonyx — Data Threat Model

**Project:** Halonyx Secure Messaging Application
**Document Type:** Data Threat Analysis
**Date:** 2026-07-18

---

## 1. Overview

This document identifies and analyzes data threats applicable to the Halonyx secure messaging system. It covers threats to data confidentiality, integrity, availability, and authenticity across all layers — frontend (browser), backend (Node.js/Express), transport (WebSocket/UDP/HTTP), storage (SQLite databases), and the dependency supply chain. Each threat is mapped to its attack vector, affected components, severity, and recommended mitigations.

---

## 2. Assets and Data Classification

| Asset | Location | Sensitivity | Description |
|---|---|---|---|
| Plaintext USID | Client memory, JWT payload | **Critical** | 256-bit random identity token; grants full account access |
| Plaintext message content | Client memory, in-transit | **Critical** | Pre-encryption message text |
| Private identity key (IK) | Browser memory / IndexedDB | **Critical** | Long-term X25519 private key; compromises all future sessions |
| Signed pre-key private | Browser memory | **High** | X25519 private key; allows decryption of new sessions |
| One-time pre-key privates | Browser memory | **High** | Single-use ephemeral keys |
| Session / chain keys | Browser memory | **High** | Double Ratchet chain state; loss breaks forward secrecy |
| JWT token | `localStorage`, HTTP headers | **High** | Authentication credential; valid until server restart |
| Hashed USID | SQLite databases, WS wire | **Medium** | SHA-256(USID); used for routing; reversible if USID space is small |
| User email | `identity.db` | **Medium** | Personal identifier; GDPR/privacy-sensitive |
| User display name | `identity.db`, JWT, WS | **Low–Medium** | Non-secret but privacy-sensitive |
| Public key bundle | `keys.db`, `app.db`, API | **Low** | Public by design; integrity matters more than confidentiality |
| Mailbox messages (offline) | `app.db / mailbox` table | **High** | Stored unencrypted on server for offline delivery |
| UDP broadcast content | Network (plaintext UDP) | **High** | Emergency messages sent as cleartext over UDP |
| Third-party dependency code | `node_modules` | **Medium–High** | Transitive packages executing with full server/client privileges |

---

## 3. Threat Categories and Detailed Analysis

### 3.1 Threat T-01 — Hardcoded JWT Secret

**Category:** Authentication / Credential Exposure
**STRIDE:** Spoofing, Elevation of Privilege
**Severity:** 🔴 Critical

**Description:**
`backend/server.js` contained:
```javascript
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
```
If the `JWT_SECRET` environment variable is not set (e.g., during development or a misconfigured deployment), the application fell back to the literal string `'your-secret-key'`. An attacker who knows this default can forge arbitrary JWT tokens for any `userId` and `usid`, gaining full authenticated access to the REST API and WebSocket server without credentials.

**Attack Vector:** Remote. The attacker crafts a JWT signed with `'your-secret-key'` and submits it to any authenticated endpoint (`/add-contact`, `/contacts`, `/pubkey`, etc.).

**Affected Components:** All authenticated REST endpoints, WebSocket `register` flow (indirectly via USID exposure in JWT).

**Impact:** Complete authentication bypass. Attacker can impersonate any user, read contact lists, inject contacts, and access public key bundles.

**Mitigation:** ✅ **Mitigated.** The fallback secret is now generated via `crypto.randomBytes(32).toString('hex')` at boot when `JWT_SECRET` is unset, replacing the hardcoded string. Production deployments should still set `JWT_SECRET` explicitly, since a randomly generated secret rotates on every restart and invalidates existing sessions.

---

### 3.2 Threat T-02 — Plaintext USID in JWT Payload

**Category:** Privacy / Information Disclosure
**STRIDE:** Information Disclosure
**Severity:** 🔴 Critical

**Description:**
The JWT token was created with:
```javascript
jwt.sign({ userId: row.id, usid }, JWT_SECRET)
```
The raw plaintext USID was embedded in the JWT payload. JWTs are Base64-encoded, not encrypted — anyone who can read the token (e.g., from `localStorage`, browser history, server logs, or a network MitM) obtains the plaintext USID. Since the USID is the master secret used to derive all other identifiers, its exposure nullifies the privacy model.

**Attack Vector:** Local (malicious browser extension, XSS) or network (traffic interception if HTTPS is absent).

**Affected Components:** `frontend/js/app.js` (`localStorage.getItem('usid')`), `backend/server.js` JWT creation.

**Impact:** Full identity compromise. Attacker can authenticate as the victim by using the USID to register a WebSocket connection or compute the hashed USID to impersonate the victim.

**Mitigation:** ✅ **Mitigated.** Tokens now carry `hashedUsid` instead of the raw USID (`jwt.sign({ userId, hashedUsid }, ...)`). All REST endpoint handlers reading `req.user.usid` were updated to `req.user.hashedUsid`.

---

### 3.3 Threat T-03 — Offline Mailbox Stores Messages in Plaintext

**Category:** Data at Rest / Confidentiality
**STRIDE:** Information Disclosure
**Severity:** 🔴 Critical

**Description:**
When a recipient was offline, the server stored the message in the `mailbox` table:
```javascript
const storeContent = content || '[encrypted message]';
db.run('INSERT INTO mailbox (..., content) VALUES (?, ?, ?)', [to, userHashedUsid, storeContent]);
```
If the client sent plaintext `content` (which it did in the non-E2EE fallback path), the server stored readable message text in SQLite. Any attacker with read access to `app.db` could read all queued messages for offline users.

**Attack Vector:** Physical database file access, SQL injection, or compromised server.

**Affected Components:** `mailbox` table in `backend/db/app.db`.

**Impact:** Mass message confidentiality breach for all users who were offline at the time of message sending. Defeats the end-to-end encryption model.

**Mitigation:** ✅ **Mitigated.** The offline message delivery logic now explicitly rejects any payload carrying a `content` field or missing an `encrypted` field. The mailbox table is strictly constrained to store only sender-marked ciphertext; unencrypted messages are dropped, and a warning is logged.

**Remaining:**
- SQLite encryption at rest (e.g., SQLCipher) not yet applied to the database file.
- Mailbox message TTL / automatic deletion policy not yet defined.

---

### 3.4 Threat T-04 — UDP Emergency Broadcast Is Unauthenticated and Plaintext

**Category:** Integrity / Spoofing / Information Disclosure
**STRIDE:** Spoofing, Tampering, Information Disclosure
**Severity:** 🔴 Critical

**Description:**
The UDP server on port 9000 accepted UDP datagrams and broadcast their content to all connected WebSocket clients. Without controls, any process on the same host (or network, if the UDP port was publicly reachable) could inject arbitrary emergency broadcast messages at any rate, causing alert flooding ("UDP spamming"). UDP source addresses can also be spoofed.

**Attack Vector:** Local (any process on the server) or remote (if firewall does not block port 9000). UDP source addresses can be spoofed.

**Affected Components:** `backend/server.js` UDP server, `emergency_broadcast` WebSocket handler.

**Impact:** An attacker could send mass fake emergency alerts to all users, causing panic or phishing. High-frequency UDP spam could also exhaust server resources.

**Mitigation:** ✅ **Fully mitigated** via multi-layered UDP anti-spam controls:
- ✅ UDP server bound to `127.0.0.1` — external network access blocked.
- ✅ Secret token (`INTERNAL_UDP_SECRET`) validated on every UDP message before broadcast.
- ✅ **`RateBucket` rate limiter** with sliding-window algorithm applied at two levels:
  - **Per-IP limit:** 1 message per 30 seconds per source IP address.
  - **Global limit:** Maximum 5 messages per 60 seconds across all sources.
- ✅ **Auto-ban:** IPs exceeding the rate limit 5 times are banned for 5 minutes (300 seconds).
- ✅ **Payload size cap:** UDP packets exceeding 512 bytes are rejected before parsing.
- ✅ **Content validation:** Empty/missing content rejected; content truncated to 200 characters max.
- ✅ **`from` field sanitization:** Sender identifier truncated to 64 characters.
- ✅ **WS→UDP bridge rate limit:** Each authenticated user limited to 1 emergency broadcast per 60 seconds; banned for 5 minutes after 3 violations.
- ✅ **Registration enforcement:** Unregistered WebSocket clients cannot trigger emergency broadcasts.
- ✅ **Comprehensive logging:** All rejections (rate-limited, oversized, unauthorized, malformed) are logged with source IP/port.

---

### 3.5 Threat T-05 — No Rate Limiting on Any Endpoint

**Category:** Availability / Abuse
**STRIDE:** Denial of Service
**Severity:** 🟠 High

**Description:**
Without rate limiting, an attacker can:
- Flood `POST /signup` to enumerate valid email addresses (via timing differences in `row` vs. `null` responses).
- Exhaust SQLite write capacity by spamming contact additions or signups.
- Fill the `mailbox` table with garbage messages targeting an offline user.
- Create thousands of WebSocket connections to exhaust server memory.
- Spam emergency broadcasts via UDP or WebSocket.

**Attack Vector:** Remote, unauthenticated (for `/signup`) or authenticated (for `/add-contact`, `/contacts`, emergency broadcasts).

**Affected Components:** All REST endpoints, WebSocket server, UDP server, `mailbox` table.

**Impact:** Service unavailability, database bloat, denial of service for legitimate users.

**Mitigation:**
- ✅ `express-rate-limit` applied to `POST /signup` (5 requests per 5 minutes per IP) and `POST /keys/upload` / `POST /keys/replenish` (10 requests per 5 minutes per IP).
- ✅ UDP rate limiting via `RateBucket`: per-IP (1/30s) + global (5/min) with auto-ban after 5 violations.
- ✅ WS emergency broadcast rate limiting: 1 per 60 seconds per user with auto-ban after 3 violations.
- ⚠️ Remaining: Mailbox size cap per recipient not yet enforced.
- ⚠️ Remaining: WebSocket connection limits per IP not yet implemented.

---

### 3.6 Threat T-06 — Email Address Enumeration via Signup Endpoint

**Category:** Privacy / Information Disclosure
**STRIDE:** Information Disclosure
**Severity:** 🟠 High

**Description:**
`POST /signup` returns different responses and has different response times depending on whether an email already exists:
- Existing email → `UPDATE` path (slightly slower, message: `"Identity re-verified"`)
- New email → `INSERT` path (message: `"Account created"`)

An attacker can probe the endpoint with candidate email addresses and determine which are registered by observing the response message or timing.

**Attack Vector:** Remote, unauthenticated.

**Affected Components:** `POST /signup`, `identity.db`.

**Impact:** Reveals which email addresses have Halonyx accounts, enabling targeted phishing or social engineering.

**Mitigation:**
- Return a uniform response regardless of whether the email exists (e.g., `"Check your email for your access token"`).
- Add consistent artificial delay to equalize response times.
- Require email verification before revealing registration status.

**Status:** ⚠️ Unmitigated.

---

### 3.7 Threat T-07 — SQL Injection via Unvalidated USID Input

**Category:** Injection / Data Integrity
**STRIDE:** Tampering, Information Disclosure
**Severity:** 🟠 High

**Description:**
Most database queries use parameterized statements, which is good. However, the USID and email inputs receive only basic validation:
```javascript
if (!email || !email.includes('@')) ...
if (!usid || usid.trim() === '') ...
```
No format validation enforces that the USID is a 64-character hex string. If any code path uses string interpolation instead of prepared statements, malformed USIDs could inject SQL. Additionally, the `cleanup-duplicates` endpoint builds a `WHERE id IN (...)` clause dynamically:
```javascript
const placeholders = toDelete.map(() => '?').join(',');
db.run(`DELETE FROM contacts WHERE user_id = ? AND id IN (${placeholders})`, ...)
```
While this specific instance is safe (integer IDs, parameterized), the pattern is fragile and must be audited carefully.

**Attack Vector:** Remote, authenticated (for most USID inputs) or unauthenticated (`/signup` email).

**Affected Components:** All SQL-touching endpoints.

**Impact:** Data exfiltration, data corruption, or authentication bypass if parameterization is ever bypassed.

**Mitigation:**
- Validate USID format: `if (!/^[0-9a-f]{64}$/.test(usid))` before any DB query.
- Validate email with a proper RFC 5322 regex or a library like `validator.js`.
- Audit all dynamic SQL construction; enforce a linting rule against string-interpolated queries.

**Status:** ⚡ Partially mitigated.

---

### 3.8 Threat T-08 — WebSocket Identity Hijacking (Unauthenticated Registration)

**Category:** Authentication / Spoofing
**STRIDE:** Spoofing
**Severity:** 🟠 High

**Description:**
WebSocket registration requires only a USID in the `register` message. No JWT or session token is checked:
```javascript
if (data.type === 'register') {
    const { usid } = data;
    const hashed = hashUSID(usid);
    idDb.get('SELECT name FROM users_metadata WHERE hashed_usid = ?', [hashed], ...);
}
```
If an attacker obtains another user's plaintext USID (via T-02 or other leakage), they can open a WebSocket connection and register as that user. The legitimate user's messages would then be delivered to the attacker's socket.

**Attack Vector:** Remote. Requires knowledge of the target's plaintext USID.

**Affected Components:** WebSocket `register` handler, `clients` Map.

**Impact:** Message interception. Attacker receives all messages intended for the victim until the victim reconnects and re-registers, evicting the attacker's socket.

**Mitigation:**
- Require a JWT token in the WebSocket `register` message and verify it server-side before adding to the `clients` Map.
- Reject duplicate registrations for the same hashed USID (or evict old with a challenge).

**Status:** ⚠️ Unmitigated.

---

### 3.9 Threat T-09 — Missing HTTPS / TLS Enforcement

**Category:** Transport Security
**STRIDE:** Information Disclosure, Tampering
**Severity:** 🟠 High

**Description:**
The server is configured to listen on HTTP (`http.createServer(app)`) on port 3000 with no TLS. WebSocket connections use `ws://` (unencrypted) rather than `wss://`. While message content is end-to-end encrypted, metadata — hashed USIDs, timestamps, contact lookups, public key bundles, JWT tokens — is transmitted in cleartext. An adversary on the network path can perform:
- Passive surveillance of communication metadata.
- Active MitM to inject or replay API responses.
- JWT theft from HTTP headers.

**Attack Vector:** Network (same LAN, ISP, or any on-path attacker).

**Affected Components:** All HTTP REST endpoints, WebSocket connections, static file serving.

**Impact:** Metadata leakage (who communicates with whom, when), JWT theft, public key bundle tampering (enabling MITM of E2EE sessions).

**Mitigation:**
- Terminate TLS with a reverse proxy (Nginx / Caddy) in front of the Node.js server.
- Redirect all HTTP to HTTPS and all WS to WSS.
- Set `Strict-Transport-Security` (HSTS) header.
- **Note:** Mitigated in production deployment (Render terminates TLS at edge). Unmitigated for self-hosted deployments without a reverse proxy.

**Status:** ⚡ Partially mitigated.

---

### 3.10 Threat T-10 — Private Keys Stored in Browser localStorage (Persistence Risk)

**Category:** Key Material Exposure
**STRIDE:** Information Disclosure
**Severity:** 🟠 High

**Description:**
The frontend uses `localStorage` for the JWT token and USID (`localStorage.getItem('token')`, `localStorage.getItem('usid')`). The Signal Protocol private keys may also be persisted for session resumption. `localStorage` is accessible to any JavaScript running on the same origin, making it a target for XSS attacks. Additionally, it persists across browser restarts and is often included in browser backups or sync.

**Attack Vector:** XSS, malicious browser extensions, physical access to device, browser sync compromise.

**Affected Components:** `frontend/js/app.js` state management.

**Impact:** Private key exfiltration, persistent unauthorized access.

**Mitigation:**
- Store JWT in an `HttpOnly` cookie to prevent JavaScript access.
- Store private key material in the non-extractable Web Crypto API (`extractable: false`) and never serialize it to localStorage.
- Implement an idle timeout that clears sensitive state from memory.
- **Note:** Partially mitigated. Signal Protocol private keys are stored as non-exportable `CryptoKey` objects in IndexedDB. JWT and USID in `localStorage` remain an issue.

**Status:** ⚡ Partially mitigated.

---

### 3.11 Threat T-11 — Missing Content Security Policy (XSS Risk)

**Category:** Injection
**STRIDE:** Tampering, Information Disclosure
**Severity:** 🟠 High

**Description:**
The server has no Content Security Policy (CSP) header. The frontend loads protocol scripts via `/protocol/*` dynamically. Without a CSP, any XSS vulnerability in the SPA would allow injected scripts to access `localStorage` (JWT, USID), intercept WebSocket messages, and exfiltrate cryptographic key material.

**Attack Vector:** Reflected or stored XSS in user-controlled input fields (display name, message content rendered via `innerHTML`).

**Affected Components:** `frontend/index.html`, `frontend/js/app.js`, message rendering (`renderMessages()`).

**Impact:** Full session hijack, private key exfiltration, message interception.

**Mitigation:**
- Add a strict CSP header: `Content-Security-Policy: default-src 'self'; script-src 'self'; connect-src 'self' ws://localhost:8081`.
- Audit all DOM writes for `innerHTML` usage; replace with `textContent` or `createElement`.
- Sanitize all user-supplied content before rendering.

**Status:** ⚠️ Unmitigated.

---

### 3.12 Threat T-12 — SHA-256 Hashed USID Is a Weak Pseudonym

**Category:** Privacy / Anonymity
**STRIDE:** Information Disclosure
**Severity:** 🟡 Medium

**Description:**
The USID is a 256-bit random value, so its SHA-256 hash is computationally irreversible. However, the hashed USID is used as a routing identifier on the wire and stored in the database. If an attacker can observe network traffic (see T-09) they can build a social graph of who communicates with whom based on hashed USIDs, even without decrypting message content. Hashed USIDs are also returned verbatim from `GET /contacts`.

**Attack Vector:** Network traffic analysis, database read access.

**Affected Components:** WebSocket message routing, `GET /contacts` response, `contacts` table.

**Impact:** Communication metadata leakage — attacker learns the contact graph without reading message content.

**Mitigation:**
- Use per-session ephemeral routing tokens instead of persistent hashed USIDs on the WebSocket wire.
- Do not return contact hashed USIDs directly from `GET /contacts`; return opaque client-side names.
- Consider onion-style routing or mix-net for metadata protection.

**Status:** ⚡ Partially mitigated.

---

### 3.13 Threat T-13 — No Message Persistence / Audit Integrity

**Category:** Integrity / Non-Repudiation
**STRIDE:** Repudiation
**Severity:** 🟡 Medium

**Description:**
Messages are relayed in real-time and deleted from the mailbox after delivery. There is no server-side message log. While this protects privacy, it also means there is no audit trail for abuse (e.g., harassment).

**Attack Vector:** Any authenticated user.

**Affected Components:** WebSocket message handler, UDP broadcast handler.

**Impact:** Inability to investigate abuse, harassment, or false emergency alerts.

**Mitigation:**
- ✅ Emergency broadcast events are now logged with sender hashed USID (truncated), source IP/port, timestamp, and delivery count.
- ✅ All rate-limit violations, bans, oversized payloads, and unauthorized attempts are logged with source identifiers.
- ✅ Emergency broadcasts are rate-limited per user (1/60s) with auto-ban after 3 violations.
- ⚠️ Remaining: Formal append-only audit log file (separate from stdout) not yet implemented.

**Status:** ⚡ Partially mitigated.

---

### 3.14 Threat T-14 — Denial of Service via Mailbox Flooding

**Category:** Availability
**STRIDE:** Denial of Service
**Severity:** 🟡 Medium

**Description:**
Any authenticated user can send unlimited messages to an offline recipient. Each message is inserted into the `mailbox` table with no size or count cap. An attacker can fill the SQLite database (and thus disk) by sending millions of messages to a target user's hashed USID.

**Attack Vector:** Remote, authenticated.

**Affected Components:** `mailbox` table, `app.db` disk storage.

**Impact:** Disk exhaustion causing server crash; reconnect storm as victim flushes a massive mailbox.

**Mitigation:**
- Enforce a per-recipient mailbox cap (e.g., 200 messages).
- Return an error to the sender and drop excess messages.
- Add a TTL index to auto-expire old mailbox entries.

**Status:** ⚠️ Unmitigated.

---

### 3.15 Threat T-15 — Public Key Bundle Tampering (MITM on E2EE Setup)

**Category:** Integrity / Key Authenticity
**STRIDE:** Tampering, Spoofing
**Severity:** 🟠 High

**Description:**
When Alice fetches Bob's public key to initiate X3DH, she calls `GET /pubkey/:hashedUsid`. The server returns the bundle from `keys.db` or `app.db`. There is no mechanism to verify that the returned public key is authentic — no certificate pinning, no out-of-band fingerprint verification, and no signed record linking the key to the identity. A compromised server or MitM attacker can substitute a different public key, causing Alice to establish an E2EE session with the attacker instead of Bob.

**Attack Vector:** Compromised server, network MitM (see T-09).

**Affected Components:** `GET /pubkey/:hashedUsid`, X3DH initiator flow in `frontend/js/app.js`.

**Impact:** Complete E2EE bypass. All messages Alice sends to Bob go to the attacker who can read and re-encrypt them for Bob, performing a transparent MitM.

**Mitigation:**
- Implement safety number / key fingerprint display for out-of-band verification (as done in Signal).
- Have users sign their public key with their identity key and verify the signature client-side before using the bundle.
- Use a transparency log (key server with append-only audit) to detect key substitution.
- **Note:** Safety Numbers UI implemented — allows out-of-band fingerprint verification. Formal pre-key signature verification (Ed25519) not yet wired into X3DH verification step.

**Status:** ⚡ Partially mitigated.

---

### 3.16 Threat T-16 — WebRTC / WebTorrent IP Leak & Public STUN/TURN Metadata Exposure

**Category:** Privacy / Information Disclosure
**STRIDE:** Information Disclosure
**Severity:** 🟠 High

**Description:**
WebTorrent uses WebRTC for peer-to-peer data channels. This requires STUN/TURN servers for NAT traversal and public trackers (e.g., `openwebtorrent.com`) for peer discovery. Connecting to public trackers and third-party TURN servers (e.g., `openrelay.metered.ca`) leaks user IP addresses and metadata to those providers. Additionally, establishing a direct P2P connection exposes the user's public IP address to the peer they are communicating with, bypassing the privacy guarantees of the central server.

**Attack Vector:** Network observation by peer or third-party infrastructure providers.

**Affected Components:** `frontend/js/app.js` (WebTorrent initialization and tracker config).

**Impact:** Deanonymization. An attacker communicating with a victim can discover their real IP address. Third-party STUN/TURN/Tracker providers can log when users are online and potentially their metadata.

**Mitigation:**
- Host a private, self-hosted TURN server (e.g., Coturn) to prevent metadata leaks to third parties.
- Host a private WebTorrent tracker.
- Warn users via UI that P2P file transfers expose their IP address to the recipient.

**Status:** ⚠️ Unmitigated.

---

### 3.17 Threat T-17 — OPK Exhaustion / X3DH Fallback

**Category:** Cryptographic Weakness / Forward Secrecy
**STRIDE:** Information Disclosure
**Severity:** 🟠 High

**Description:**
One-time pre-keys (OPKs) are consumed every time a new peer initiates a session. If a user receives many first-messages without coming online to replenish their OPK pool, the pool drains. Once empty, the X3DH protocol falls back to a weaker 3-DH initialization that lacks full forward secrecy if the signed pre-key is compromised.

**Attack Vector:** An attacker deliberately opens many sessions to exhaust the OPK pool, or normal heavy usage drains the pool, leaving the user vulnerable to forward-secrecy degradation on subsequent connections.

**Affected Components:** `protocol/signal_protocol.js`, `backend/server.js` (Key bundle storage).

**Impact:** Loss of optimal forward secrecy for new sessions established after OPKs run out.

**Mitigation:** ✅ **Mitigated.** Client-side OPK count monitoring implemented via IndexedDB. Automated OPK replenishment (`POST /keys/replenish`) triggers when the pool drops below a safe threshold (e.g., 20 keys).

---

### 3.18 Threat T-18 — Vulnerable Transitive Dependencies

**Category:** Supply Chain / Dependency Risk
**STRIDE:** Varies by dependency (Denial of Service, Tampering, Information Disclosure)
**Severity:** 🟠 High

**Description:**
An `npm audit` run reports 22 known vulnerabilities across the dependency tree (2 low, 4 moderate, 16 high). These are introduced transitively through `sqlite3` (via `node-gyp` → `tar` / `make-fetch-happen` → `@tootallnate/once`), `webtorrent` (via `bittorrent-tracker` → `ip`), and directly through `nodemailer`, `express` / `body-parser` (via `qs`), `ws`, `minimatch`, `path-to-regexp`, `picomatch`, and `brace-expansion`. Several are ReDoS (regular-expression denial-of-service) vectors in glob/route-matching libraries; `ip` has an SSRF miscategorization bug; `ws` has an uninitialized-memory disclosure issue and a fragment-based memory-exhaustion DoS; `nodemailer` has multiple SMTP command-injection and SSRF issues (relevant only if the mail-sending code path is exercised in production).

**Attack Vector:** Varies per CVE. Several are remotely triggerable via crafted input to routing (`path-to-regexp`, `qs`) or glob matching (`minimatch`, `picomatch`). The `ws` issues are directly reachable by any WebSocket peer, which is significant given `ws` is Halonyx's live message-relay transport.

**Affected Components:** Backend dependency tree — `sqlite3`, `webtorrent`, `express`, `ws`, build tooling (`node-gyp`, `tar`, `make-fetch-happen`).

**Impact:** Ranges from build-tool-only exposure with no runtime impact (the `node-gyp` / `tar` chain, only active during `npm install`) to directly reachable runtime denial-of-service (`ws`, since it is the live transport library through which all messages are relayed).

**Mitigation:**
- Run `npm audit fix` (no `--force`) to resolve the six non-breaking-change vulnerabilities (`brace-expansion`, `minimatch`, `path-to-regexp`, `picomatch`, `qs`, `ws`) with no compatibility risk.
- Schedule the three breaking-change upgrades (`sqlite3` → 6.0.1, `webtorrent` → new major, `nodemailer` → 9.0.3) as a deliberate, tested migration rather than an automatic `--force` fix, since these touch core storage, file-transfer, and mail code paths.
- CI (Halonyx CI workflow) runs `npm audit --audit-level=high` on every push/PR as a non-blocking step, so new vulnerabilities remain visible without blocking merges over pre-existing dependency debt.

**Status:** ⚡ Partially mitigated (visibility via CI; 6 of 9 non-`node-gyp`-chain issues fixable non-breaking; breaking-change upgrades pending).

---

## 4. Threat Summary Matrix

| ID | Threat | Severity | Component | Status |
|---|---|---|---|---|
| T-01 | Hardcoded JWT secret fallback | 🔴 Critical | `server.js` | ✅ Mitigated |
| T-02 | Plaintext USID in JWT payload | 🔴 Critical | `server.js`, `app.js` | ✅ Mitigated |
| T-03 | Mailbox stores plaintext messages | 🔴 Critical | `mailbox` table | ✅ Mitigated |
| T-04 | Unauthenticated UDP broadcast / UDP spamming | 🔴 Critical | UDP server, WS bridge | ✅ Mitigated |
| T-05 | No rate limiting | 🟠 High | All endpoints | ⚡ Partially mitigated |
| T-06 | Email enumeration via signup | 🟠 High | `POST /signup` | ⚠️ Unmitigated |
| T-07 | SQL injection / weak input validation | 🟠 High | All DB queries | ⚡ Partially mitigated |
| T-08 | WebSocket unauthenticated registration | 🟠 High | WS `register` handler | ⚠️ Unmitigated |
| T-09 | Missing HTTPS / TLS | 🟠 High | Full stack | ⚡ Partially mitigated |
| T-10 | Private keys in localStorage | 🟠 High | `app.js` | ⚡ Partially mitigated |
| T-11 | Missing CSP / XSS risk | 🟠 High | Frontend | ⚠️ Unmitigated |
| T-12 | Hashed USID metadata leakage | 🟡 Medium | WS wire, DB | ⚡ Partially mitigated |
| T-13 | No audit trail for abuse | 🟡 Medium | WS / UDP handlers | ⚡ Partially mitigated |
| T-14 | Mailbox flooding (DoS) | 🟡 Medium | `mailbox` table | ⚠️ Unmitigated |
| T-15 | Public key tampering (MITM E2EE) | 🟠 High | `GET /pubkey`, X3DH | ⚡ Partially mitigated |
| T-16 | WebRTC / WebTorrent IP Leak | 🟠 High | WebTorrent / TURN | ⚠️ Unmitigated |
| T-17 | OPK Exhaustion / X3DH Fallback | 🟠 High | `signal_protocol.js` | ✅ Mitigated |
| T-18 | Vulnerable transitive dependencies (npm audit) | 🟠 High | Dependency tree | ⚡ Partially mitigated |

---

## 5. Prioritized Remediation Roadmap

### Phase 1 — Critical Fixes (Before Any Production Deployment)

1. ~~**T-01:** Enforce `JWT_SECRET` via environment variable; fail at startup if absent.~~ (Mitigated)
2. ~~**T-02:** Remove USID from JWT payload; derive it server-side from `userId`.~~ (Mitigated via hashedUsid in JWT payload)
3. ~~**T-03:** Ensure only ciphertext is ever stored in `mailbox`; never store `content` field.~~ (Mitigated)
4. ~~**T-04:** Bind UDP to `127.0.0.1`; add HMAC authentication to UDP messages; add rate limiting + auto-ban.~~ (Mitigated via secret token, RateBucket per-IP/global rate limiting, auto-ban, payload size/content validation)
5. **T-09:** Deploy behind an Nginx/Caddy TLS reverse proxy; enforce HTTPS.

### Phase 2 — High Priority (Within First Sprint Post-Launch)

6. **T-08:** Require JWT verification in WebSocket `register` message.
7. ~~**T-05 (partial):** Add rate limiting to signup, key upload, UDP, and WS emergency endpoints.~~ (Mitigated: `express-rate-limit` on signup/key endpoints; `RateBucket` on UDP + WS emergency)
7b. **T-05 (remaining):** Add mailbox size caps and WebSocket connection limits per IP.
8. **T-10:** Use `HttpOnly` cookies for JWT; use non-extractable Web Crypto keys.
9. **T-11:** Add CSP headers; audit all `innerHTML` usage.
10. **T-15:** Implement safety number UI for key fingerprint verification.
11. **T-18 (partial):** Run `npm audit fix` to resolve the six non-breaking dependency vulnerabilities (`brace-expansion`, `minimatch`, `path-to-regexp`, `picomatch`, `qs`, `ws`) — no compatibility risk, immediate action.

### Phase 3 — Medium Priority (Ongoing Hardening)

12. **T-06:** Uniform signup response regardless of email existence.
13. **T-07:** Add strict USID and email format validation before all DB queries.
14. **T-14:** Enforce mailbox size cap (200 messages per recipient).
15. ~~**T-13 (partial):** Log emergency broadcast events with sender identity and delivery count.~~ (Mitigated via console logging with source identification)
15b. **T-13 (remaining):** Implement formal append-only audit log file separate from stdout.
16. **T-12:** Investigate ephemeral routing tokens to reduce metadata linkability.
17. **T-18 (remaining):** Plan and test the three breaking-change dependency upgrades (`sqlite3` → 6.0.1, `webtorrent` → latest major, `nodemailer` → 9.0.3) as a deliberate migration.

---

*Generated: 2026-06-30*
*Last Updated: 2026-07-18 — UDP anti-spam controls (RateBucket, per-IP/global rate limiting, auto-ban, payload validation); added T-18 (vulnerable transitive dependencies via npm audit)*

## Security Disclaimer

This threat model represents the current security analysis of Halonyx at the time of writing.
While the system implements multiple security mechanisms inspired by modern encrypted messaging protocols, no software system can be considered completely secure.

Threats, mitigations, and architectural assumptions documented here are subject to change as the project evolves. Security analysis is an ongoing process involving continuous review, testing, benchmarking, and hardening.

Halonyx is currently an academic and research-oriented project and has not undergone independent cryptographic or professional security auditing.