# Halonyx Software Design Document

**Version:** 1.0  
**Date:** 2026-02-23  
**Project Name:** Halonyx - Secure Messaging Application  
**Document Type:** Software Design Document (SDD)

---

## 1. Executive Summary

### 1.1 Project Overview

Halonyx is a secure messaging web application that provides end-to-end encrypted communication using the Signal Protocol. The application implements USID (Unique Secure Identifier) based identity management, enabling users to communicate securely without exposing their personal information. The system combines modern cryptographic techniques with a user-friendly interface to deliver private, tamper-proof messaging capabilities.

### 1.2 Scope

This document describes the architectural design, component interactions, data models, and security mechanisms of the Halonyx secure messaging system. The scope encompasses:

- User registration and identity management via USID
- End-to-end encryption using Signal Protocol (X3DH + Double Ratchet)
- Real-time messaging via WebSocket connections
- Emergency broadcast functionality via UDP
- Contact management and session handling
- Frontend user interface with Material Design 3 styling

### 1.3 Goals and Objectives

| Objective | Description |
|-----------|-------------|
| **Security** | Provide end-to-end encryption with forward secrecy and post-compromise security |
| **Privacy** | Enable anonymous communication without exposing personal identifiers |
| **Reliability** | Ensure message delivery through multiple transport mechanisms |
| **Usability** | Deliver an intuitive, accessible user interface |
| **Extensibility** | Support future features like group messaging and multi-device sync |

---

## 2. System Architecture

### 2.1 High-Level Architecture

The Halonyx system follows a three-tier architecture consisting of:

1. **Presentation Layer** — Frontend web application (HTML/CSS/JavaScript)
2. **Application Layer** — Node.js backend with REST API and WebSocket server
3. **Data Layer** — SQLite databases for persistence

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  frontend/index.html  │  frontend/css/style.css        │    │
│  │  frontend/js/app.js  │  Material Design 3 Components   │    │
│  └─────────────────────────────────────────────────────────┘    │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP/WebSocket
┌────────────────────────────▼────────────────────────────────────┐
│                    APPLICATION LAYER                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Express.js     │  │  WebSocket      │  │  UDP Server     │  │
│  │  REST API       │  │  Server         │  │  (Broadcast)    │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Signal Protocol Implementation (protocol/)             │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      DATA LAYER                                 │
│  ┌──────────────────────────┐  ┌───────────────────────────┐  │
│  │  app.db (Operational)    │  │  identity.db (Metadata)   │  │
│  │  - users                 │  │  - users_metadata         │  │
│  │  - contacts              │  │                           │  │
│  └──────────────────────────┘  └───────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Runtime | Node.js | — |
| Web Framework | Express.js | ^4.18.2 |
| Database | SQLite3 | ^5.1.6 |
| Real-time Communication | WebSocket (ws) | ^8.14.2 |
| Authentication | JSON Web Token (JWT) | ^9.0.2 |
| Email | Nodemailer | ^6.9.7 |
| Frontend | Vanilla JavaScript + CSS3 | — |
| Cryptography | Web Crypto API | — |

---

## 3. Component Specifications

### 3.1 Frontend Components

#### 3.1.1 User Interface Structure

The frontend is a single-page application (SPA) contained within [`frontend/index.html`](frontend/index.html:1). It implements the following views:

| View | Component ID | Description |
|------|--------------|-------------|
| Splash Screen | `#splash-screen` | Initial loading and branding display |
| Registration | `#registration-form` | User signup form with name/email input |
| Main Dashboard | `#main-view` | Primary application container |
| Contacts List | `#contacts-screen` | List of added contacts with FAB for adding |
| Chat Interface | `#chat-screen` | Message composition and display area |
| Profile Dialog | `#profile-dialog` | USID display and copy functionality |
| Add Contact Dialog | `#add-contact-dialog` | Modal for entering contact USID |

#### 3.1.2 Application Logic

The frontend application logic resides in [`frontend/js/app.js`](frontend/js/app.js:1) and provides:

```javascript
// Core state management
let token = localStorage.getItem('token');        // JWT authentication token
let myUsid = localStorage.getItem('usid');        // Current user's USID
let currentChatUsid = null;                       // Active chat partner (hashed)
let contacts = [];                                // Contact list
let messageHistory = {};                          // Local message cache
```

**Key Functions:**

| Function | Purpose |
|----------|---------|
| [`signup()`](frontend/js/app.js:121) | Handle user registration via REST API |
| [`connectWS()`](frontend/js/app.js:61) | Establish WebSocket connection for real-time messaging |
| [`sendMessage()`](frontend/js/app.js:213) | Send encrypted message to recipient |
| [`addContact()`](frontend/js/app.js:184) | Add new contact by USID |
| [`renderMessages()`](frontend/js/app.js:288) | Display message conversation |
| [`showEmergencyAlert()`](frontend/js/app.js:332) | Handle emergency broadcast notifications |

#### 3.1.3 Styling

The application uses Material Design 3 (M3) theming implemented in [`frontend/css/style.css`](frontend/css/style.css:1). The CSS includes:

- Custom CSS properties for theming
- M3 surface tones and elevation
- Responsive layouts for mobile and desktop
- Animations for screen transitions and micro-interactions
- Emergency alert banner styling

### 3.2 Backend Components

#### 3.2.1 Server Architecture

The backend server is implemented in [`backend/server.js`](backend/server.js:1) using Express.js and provides:

**REST API Endpoints:**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/signup` | POST | Register new user with name and email |
| `/add-contact` | POST | Add contact by USID (authenticated) |
| `/contacts` | GET | Retrieve user's contact list (authenticated) |

**Server Configuration:**

```javascript
const app = express();
app.use(express.json());
app.use(express.static('frontend'));
app.listen(3000, () => console.log('Server running on port 3000'));
```

#### 3.2.2 Authentication

User authentication uses JWT (JSON Web Tokens) with the following flow:

1. User submits name and email via `/signup` endpoint
2. Server generates a unique USID (256-bit random identifier)
3. Server hashes the USID using SHA-256 for privacy
4. Server creates JWT token with `userId` and `usid` claims
5. Subsequent requests include JWT in Authorization header

**JWT Secret Configuration:**

```javascript
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
```

#### 3.2.3 Real-Time Messaging

The WebSocket server runs on port 8081 and manages:

| Message Type | Direction | Description |
|--------------|-----------|-------------|
| `register` | Client → Server | Register connection with USID |
| `registered` | Server → Client | Confirm successful registration |
| `message` | Bidirectional | Send encrypted message content |
| `emergency_broadcast` | Client → Server | Trigger emergency broadcast |
| `error` | Server → Client | Error notifications |

**Client Registration Flow:**

```javascript
ws.on('message', (message) => {
    const data = JSON.parse(message.toString());
    if (data.type === 'register') {
        const hashed = hashUSID(data.usid);
        // Verify against identity database
        idDb.get('SELECT name FROM users_metadata WHERE hashed_usid = ?', [hashed], 
            (err, row) => {
                if (row) {
                    clients.set(hashed, ws);
                    ws.send(JSON.stringify({ type: 'registered', success: true }));
                }
            });
    }
});
```

#### 3.2.4 Emergency Broadcast System

The system includes a UDP-based emergency broadcast mechanism:

- **UDP Server**: Listens on port 9000
- **WebSocket to UDP Bridge**: Forwards emergency messagesSocket clients
- **Broadcast from Web Distribution**: Sends emergency alerts to all connected clients

```javascript
const UDP_PORT = 9000;
const udpServer = dgram.createSocket('udp4');

udpServer.on('message', (msg, rinfo) => {
    // Broadcast to all WebSocket clients
    clients.forEach((clientWs) => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(broadcastData);
        }
    });
});
```

### 3.3 Protocol Components

The Signal Protocol implementation resides in the [`protocol/`](protocol/) directory and provides end-to-end encryption. This section describes each component.

#### 3.3.1 Cryptographic Primitives ([`protocol/crypto_utils.js`](protocol/crypto_utils.js:1))

The `CryptoUtils` class provides low-level cryptographic operations:

| Operation | Algorithm | Purpose |
|-----------|-----------|---------|
| Encryption | AES-256-GCM | Authenticated encryption for messages |
| Key Derivation | PBKDF2 + HMAC-SHA256 | Derive keys from shared secrets |
| Hashing | SHA-256 | Hash functions for fingerprints |
| Key Exchange | X25519 (ECDH) | Elliptic curve Diffie-Hellman |
| Signing | HMAC-SHA256 | Message authentication |

**Key Methods:**

```javascript
// Generate cryptographically secure random bytes
generateRandomBytes(length)

// Encrypt data using AES-GCM
async encrypt(plaintext, key, nonce, additionalData = null)

// Derive key using HMAC-based KDF
async deriveKey(password, salt, iterations = 100000, length = 32)

// Generate X25519 key pair for ECDH
async generateIdentityKeyPair()

// Constant-time comparison to prevent timing attacks
constantTimeEquals(a, b)
```

#### 3.3.2 X3DH Key Exchange ([`protocol/x3dh.js`](protocol/x3dh.js:1))

The X3DH (Extended Triple Diffie-Hellman) protocol provides authenticated key exchange without prior interaction:

**Key Bundle Structure:**

```javascript
{
    identityKey: Uint8Array,           // Long-term identity public key
    signedPreKey: Uint8Array,          // Medium-term signed pre-key
    signedPreKeySignature: Uint8Array, // Signature by identity key
    ephemeralKeys: Uint8Array[]       // One-time ephemeral keys
}
```

**DH Computations:**

| DH Operation | Description |
|--------------|-------------|
| DH1 = DH(IKa, SPKb) | Identity key with signed pre-key |
| DH2 = DH(EKa, IKb) | Ephemeral key with identity key |
| DH3 = DH(EKa, SPKb) | Ephemeral key with signed pre-key |
| DH4 = DH(EKa, EKb) | Ephemeral key with ephemeral key |

The shared secret is derived using HKDF:

```javascript
async deriveSharedSecret(...dhOutputs) {
    const concatInput = this.crypto.concatArrays(...dhOutputs);
    const inputKeyMaterial = this.crypto.concatArrays(concatInput, this.info);
    const derivedKey = await this.crypto.deriveKey(
        inputKeyMaterial, 
        new Uint8Array(32),  // Zero salt
        100000,              // Iterations
        32                   // Output length
    );
    return derivedKey;
}
```

#### 3.3.3 Double Ratchet Algorithm ([`protocol/double_ratchet.js`](protocol/double_ratchet.js:1))

The Double Ratchet provides continuous key ratcheting for forward secrecy and post-compromise security:

**Ratchet Components:**

| Ratchet Type | Description |
|--------------|-------------|
| DH Ratchet | Performs ECDH on each message for continuous key agreement |
| Symmetric Ratchet | Derives new message keys from chain keys |

**Initialization (Initiator):**

```javascript
async initialize(sharedSecret, remotePublicKey, isInitiator = true) {
    this.rootKey = sharedSecret;
    
    // Generate new DH key pair
    const dhKeyPair = await this.crypto.generateIdentityKeyPair();
    this.dhPrivateKey = dhKeyPair.privateKey;
    this.dhPublicKey = dhKeyPair.publicKey;

    // Derive sending and receiving chain keys
    const [sk, rk] = await this.kdfRootKey(
        this.rootKey,
        await this.crypto.deriveBits(
            await this.importPrivateKey(this.dhPrivateKey),
            remotePublicKey
        )
    );
    this.sendingChainKey = sk;
    this.rootKey = rk;
}
```

**Message Encryption:**

```javascript
async encrypt(plaintext, additionalData = null) {
    // Derive message key from sending chain
    const [messageKey, newChainKey] = await this.kdfChainKey(this.sendingChainKey);
    this.sendingChainKey = newChainKey;

    // Encrypt with AES-256-GCM
    const nonce = this.crypto.generateNonce(12);
    const ciphertext = await this.crypto.encrypt(plaintext, messageKey, nonce, additionalData);

    return { header: { dhPublicKey: this.dhPublicKey, nonce }, ciphertext };
}
```

#### 3.3.4 Key Management ([`protocol/key_management.js`](protocol/key_management.js:1))

The `KeyManager` class handles cryptographic key lifecycle:

**Key Types:**

| Key Type | Lifetime | Purpose |
|----------|----------|---------|
| Identity Key | Long-term | User's long-term identifier |
| Signed Pre-Key | Medium-term | Signed by identity key, rotated periodically |
| One-Time Pre-Keys | Short-term | Used once for initial key exchange |
| Session Keys | Per-message | Derived from Double Ratchet |

**Pre-Key Bundle Generation:**

```javascript
async generatePreKeyBundle(count = 100) {
    // Generate signed pre-key
    const signedPreKey = await this.crypto.generateIdentityKeyPair();
    const signature = await this.crypto.sign(signedPreKey.publicKey, this.identityKeyPair.privateKey);

    // Generate one-time pre-keys
    const oneTimePreKeys = [];
    for (let i = 0; i < count; i++) {
        const ephemeralKey = await this.crypto.generateIdentityKeyPair();
        oneTimePreKeys.push({ id: this.generateKeyId(), publicKey: ephemeralKey.publicKey });
    }

    return { signedPreKey, preKeys: oneTimePreKeys, signature };
}
```

#### 3.3.5 Session Management ([`protocol/session.js`](protocol/session.js:1))

The `SessionManager` class manages Signal Protocol session state:

**Session States:**

| State | Description |
|-------|-------------|
| CREATING | Session being initialized |
| INITIALIZED | X3DH complete, awaiting first message |
| ESTABLISHED | Full bidirectional communication |
| CLOSED | Session terminated |

**Session Creation:**

```javascript
async createSession(peerId, peerBundle) {
    const session = {
        peerId,
        registrationId: peerBundle.registrationId,
        isInitiator: true,
        state: 'CREATING',
        peerIdentityKey: peerBundle.identityKey,
        doubleRatchet: null
    };
    this.sessions.set(peerId, session);
    return session;
}
```

#### 3.3.6 Protocol Coordinator ([`protocol/signal_protocol.js`](protocol/signal_protocol.js:1))

The `SignalProtocol` class integrates all components:

```javascript
class SignalProtocol {
    constructor(options = {}) {
        this.crypto = options.crypto || new CryptoUtils();
        this.x3dh = options.x3dh || new X3DH(this.crypto);
        this.doubleRatchet = options.doubleRatchet || new DoubleRatchet(this.crypto);
        this.keyManager = options.keyManager || new KeyManager(this.crypto);
        this.sessionManager = options.sessionManager || new SessionManager(this.crypto);
    }

    async initialize(userId) {
        const keyData = await this.keyManager.initializeIdentity(userId);
        this.isInitialized = true;
        return { userId, identityKey: keyData.identityKey, preKeyBundle: keyData.preKeyBundles };
    }

    async encrypt(peerId, plaintext) {
        return await this.sessionManager.encryptMessage(peerId, plaintext);
    }

    async decrypt(peerId, message) {
        return await this.sessionManager.decryptMessage(peerId, message);
    }
}
```

---

## 4. Data Architecture

### 4.1 Database Schema

Halonyx uses two SQLite databases:

#### 4.1.1 Identity Database ([`backend/db/identity.db`](backend/db/identity.db))

Stores persona-level metadata and USID mappings:

```sql
-- identity_schema.sql
CREATE TABLE IF NOT EXISTS users_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    hashed_usid TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | Unique user identifier |
| name | TEXT | NOT NULL | Display name |
| email | TEXT | NOT NULL, UNIQUE | User email (for verification) |
| hashed_usid | TEXT | NOT NULL, UNIQUE | SHA-256 hash of USID |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Registration timestamp |

#### 4.1.2 Operational Database ([`backend/db/app.db`](backend/db/app.db))

Stores runtime operational data:

```sql
-- schema.sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hashed_usid TEXT NOT NULL UNIQUE,
    public_key_bundle TEXT
);

CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    contact_hashed_usid TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**users table:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | Unique user identifier |
| hashed_usid | TEXT | NOT NULL, UNIQUE | SHA-256 hash of USID |
| public_key_bundle | TEXT | NULLABLE | Serialized pre-key bundle |

**contacts table:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | Unique contact entry |
| user_id | INTEGER | NOT NULL, FOREIGN KEY | Owner of the contact |
| contact_hashed_usid | TEXT | NOT NULL | Hashed USID of contact |

### 4.2 USID Generation and Management

USIDs are generated using cryptographically secure random bytes:

```javascript
// backend/utils.js
function generateUSID() {
    return crypto.randomBytes(32).toString('hex');  // 256-bit random identifier
}

function hashUSID(usid) {
    return crypto.createHash('sha256').update(usid).digest('hex');  // SHA-256 hash
}
```

**USID Lifecycle:**

1. **Generation**: 256-bit random hex string created on signup
2. **Hashing**: USID hashed with SHA-256 for privacy-preserving storage
3. **Registration**: Hashed USID stored in identity database
4. **Authentication**: JWT token contains plaintext USID for session management

---

## 5. Security Architecture

### 5.1 Threat Model

The system protects against:

| Threat | Mitigation |
|--------|------------|
| Passive Eavesdropping | End-to-end encryption (AES-256-GCM) |
| Active MITM | X3DH authenticated key exchange |
| Server Compromise | Forward secrecy via Double Ratchet |
| Device Loss | Session keys in memory only |
| Replay Attacks | Message ratcheting and nonces |
| Forward Secrecy | Per-message key derivation |

### 5.2 Security Properties

**Forward Secrecy:**
Each message uses a unique key derived from the previous message's chain key. Compromising one message key does not reveal past messages.

**Post-Compromise Security:**
After a compromise, new keys are established that are not derived from the compromised keys, protecting future messages.

**Authentication:**
All messages include HMAC tags to prevent tampering and ensure authenticity.

**Deniability:**
The protocol provides cryptographic deniability—no cryptographic proof exists that a message was sent by a particular party.

### 5.3 Cryptographic Specifications

| Primitive | Algorithm | Key Size | Nonce Size |
|-----------|-----------|----------|------------|
| Symmetric Encryption | AES-256-GCM | 256 bits | 96 bits |
| Key Derivation | HKDF (PBKDF2) | 256 bits | — |
| Hashing | SHA-256 | 256 bits | — |
| Key Exchange | X25519 (ECDH) | 256 bits | — |
| Message Authentication | HMAC-SHA256 | 256 bits | — |

### 5.4 Security Analysis

Detailed security analysis is provided in [`protocol/SECURITY_ANALYSIS.md`](protocol/SECURITY_ANALYSIS.md:1).

---

## 6. Interface Specifications

### 6.1 REST API

#### 6.1.1 User Registration

**Endpoint:** `POST /signup`

**Request:**

```json
{
    "name": "John Doe",
    "email": "john@example.com"
}
```

**Response (Success):**

```json
{
    "message": "Account created",
    "usid": "a1b2c3d4e5f6...",
    "token": "eyJhbGciOiJIUzI1..."
}
```

**Response (Error):**

```json
{
    "error": "Valid email is required"
}
```

#### 6.1.2 Add Contact

**Endpoint:** `POST /add-contact`

**Headers:** `Authorization: Bearer <token>`

**Request:**

```json
{
    "usid": "recipient-usid-here"
}
```

**Response (Success):**

```json
{
    "message": "Contact John added"
}
```

**Response (Error):**

```json
{
    "error": "USID not found in identity registry"
}
```

#### 6.1.3 Get Contacts

**Endpoint:** `GET /contacts`

**Headers:** `Authorization: Bearer <token>`

**Response:**

```json
["hashed-usid-1", "hashed-usid-2", "hashed-usid-3"]
```

### 6.2 WebSocket Protocol

#### 6.2.1 Connection Registration

**Client → Server:**

```json
{
    "type": "register",
    "usid": "user-usid-here"
}
```

**Server → Client:**

```json
{
    "type": "registered",
    "success": true
}
```

#### 6.2.2 Message Send

**Client → Server:**

```json
{
    "type": "message",
    "to": "recipient-hashed-usid",
    "content": "Hello, secure world!"
}
```

**Server → Client:**

```json
{
    "type": "message",
    "from": "sender-hashed-usid",
    "content": "Hello, secure world!",
    "timestamp": "2026-02-23T06:47:00.000Z"
}
```

#### 6.2.3 Emergency Broadcast

**Client → Server:**

```json
{
    "type": "emergency_broadcast",
    "content": "EMERGENCY ALERT: Immediate assistance required!"
}
```

**Server → Client:**

```json
{
    "type": "emergency_broadcast",
    "content": "EMERGENCY ALERT: Immediate assistance required!",
    "from": "sender-hashed-usid",
    "timestamp": "2026-02-23T06:47:00.000Z"
}
```

---

## 7. System Flow Diagrams

### 7.1 User Registration Flow

```
┌─────────┐         ┌─────────────┐         ┌──────────────┐
│ Client  │         │   Express   │         │  SQLite DB   │
└────┬────┘         └──────┬──────┘         └──────┬───────┘
     │                      │                      │
     │ POST /signup         │                      │
     │ {name, email}       │                      │
     │─────────────────────>│                      │
     │                      │                      │
     │                      │ Generate USID        │
     │                      │ Hash USID            │
     │                      │─────────────────────>│
     │                      │                      │
     │                      │ Insert metadata      │
     │                      │ Insert user          │
     │                      │─────────────────────>│
     │                      │                      │
     │ Response            │                      │
     │ {usid, token}       │                      │
     │<─────────────────────│                      │
```

### 7.2 Message Delivery Flow

```
┌─────────┐         ┌─────────────┐         ┌─────────────┐
│ Sender  │         │   Server    │         │  Recipient │
└────┬────┘         └──────┬──────┘         └──────┬─────┘
     │                      │                      │
     │ WS Message          │                      │
     │ {to, content}      │                      │
     │─────────────────────│                      │
     │                      │                      │
     │                      │ Lookup recipient    │
     │                      │ in active clients   │
     │                      │                      │
     │                      │ Forward message     │
     │                      │─────────────────────>│
```

### 7.3 Emergency Broadcast Flow

```
┌─────────┐    ┌───────────┐    ┌─────────────┐    ┌───────────┐
│ Sender  │    │ WebSocket │    │    UDP     │    │  Clients  │
└────┬────┘    └─────┬─────┘    └──────┬──────┘    └─────┬─────┘
     │               │               │                 │
     │ Emergency     │               │                 │
     │ Broadcast     │               │                 │
     │──────────────>│               │                 │
     │               │               │                 │
     │               │ UDP Message  │                 │
     │               │──────────────>│                 │
     │               │               │                 │
     │               │   Broadcast  │                 │
     │               │──────────────>│                 │
```

---

## 8. Deployment and Configuration

### 8.1 Dependencies

```json
{
    "dependencies": {
        "express": "^4.18.2",
        "sqlite3": "^5.1.6",
        "nodemailer": "^6.9.7",
        "ws": "^8.14.2",
        "jsonwebtoken": "^9.0.2",
        "crypto": "^1.0.1"
    }
}
```

### 8.2 Running the Application

```bash
# Install dependencies
npm install

# Start server
npm start

# Development mode with auto-reload
npm run dev
```

The server starts on:
- **HTTP:** http://localhost:3000
- **WebSocket:** ws://localhost:8081
- **UDP:** localhost:9000

---

## 9. File Structure

```
Halonyx/
├── package.json                    # Project configuration
├── package-lock.json               # Dependency lock file
├── start_server.bat                # Windows startup script
│
├── backend/
│   ├── server.js                   # Express.js server + WebSocket + UDP
│   ├── email.js                    # Email notification module
│   ├── utils.js                    # USID generation and hashing
│   ├── test_udp.js                 # UDP testing utility
│   │
│   └── db/
│       ├── app.db                  # Operational SQLite database
│       ├── identity.db             # Identity SQLite database
│       ├── schema.sql              # Operational database schema
│       └── identity_schema.sql     # Identity database schema
│
├── frontend/
│   ├── index.html                  # Single-page application
│   ├── css/
│   │   └── style.css               # Material Design 3 styling
│   └── js/
│       └── app.js                  # Frontend application logic
│
└── protocol/
    ├── README.md                   # Protocol overview
    ├── SECURITY_ANALYSIS.md        # Security analysis document
    ├── signal_protocol.js          # Main protocol coordinator
    ├── x3dh.js                     # X3DH key exchange
    ├── double_ratchet.js           # Double Ratchet algorithm
    ├── key_management.js          # Key generation and storage
    ├── session.js                  # Session state management
    └── crypto_utils.js             # Cryptographic primitives
```

---

## 10. Future Enhancements

The following enhancements are planned for future versions:

1. **Post-Quantum Cryptography**: Prepare for quantum-resistant algorithms
2. **Multi-Device Support**: Extended session management for multiple devices
3. **Group Messaging**: Sender Keys for efficient group encryption
4. **Verification Protocol**: QR code and fingerprint verification UI
5. **File Attachments**: Encrypted file sharing capability
6. **Voice/Video Calls**: Encrypted real-time communication
7. **Message Deletion**: Remote message deletion for privacy

---

## 11. References

- [Signal Protocol Specification](https://signal.org/docs/)
- [X3DH Key Agreement](https://signal.org/docs/specifications/x3dh/)
- [Double Ratchet Algorithm](https://signal.org/docs/specifications/doubleratchet/)
- [Web Crypto API](https://www.w3.org/TR/WebCryptoAPI/)
- [Curve25519/X25519](https://cr.yp.to/ecdh.html)
- [Material Design 3](https://m3.material.io/)

---

*Document Version: 1.4*  
*Last Updated: 2026-05-21*  
*Classification: Internal Use Only*
