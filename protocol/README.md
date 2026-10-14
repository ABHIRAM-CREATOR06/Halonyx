# Signal Protocol Implementation

This folder contains a complete implementation of the Signal Protocol for end-to-end encrypted messaging.

## Overview

The Signal Protocol provides:
- **Forward Secrecy**: Past messages remain secure even if current keys are compromised
- **Post-Compromise Security**: Future messages are protected after any compromise
- **Message Authentication**: Cryptographic integrity protection
- **Deniability**: No cryptographic proof of message authenticity

## Architecture

### Core Components

1. **X3DH Key Exchange** (`x3dh.js`)
   - Extended Triple Diffie-Hellman key agreement
   - Perfect forward secrecy for initial key establishment
   - Uses X25519 elliptic curve cryptography

2. **Double Ratchet Algorithm** (`double_ratchet.js`)
   - Symmetric key ratcheting for ongoing conversations
   - Continuous forward secrecy
   - Handles out-of-order message delivery

3. **Key Management** (`key_management.js`)
   - Identity keys (Ed25519)
   - Signed prekeys (X25519 + Ed25519 signature)
   - One-time prekeys (X25519)

4. **Session Management** (`session.js`)
   - Manages encryption state for each conversation
   - Handles key advancement and message numbering

5. **Cryptographic Utils** (`crypto_utils.js`)
   - AES-256-GCM encryption
   - HMAC-SHA256 for integrity
   - HKDF for key derivation
   - X25519 and Ed25519 implementations

6. **Signal Envelope Protocol** (`envelope.js`)
   - Structured JSON envelope format (`v: 1`)
   - Shields thread reply parent references (`replyTo`) inside ciphertext
   - Shields group metadata and channel rosters (`group`) inside ciphertext
   - Legacy plain text message normalization

7. **Key Persistence Store** (`idb_key_store.js`)
   - IndexedDB storage for non-extractable WebCrypto `CryptoKey` objects
   - Session ratchet state serialization and restoration

## Usage

```javascript
const { SignalProtocol } = require('./protocol');

// Initialize protocol for a user
const alice = new SignalProtocol('alice_usid');

// Generate and publish prekeys
await alice.initializeKeys();

// For sending a message to Bob
const bobUsid = 'bob_usid';
const message = 'Hello, Bob!';
const encrypted = await alice.encryptMessage(bobUsid, message);

// For receiving a message from Bob
const decrypted = await alice.decryptMessage(bobUsid, encrypted);
```

## Security Properties

### Forward Secrecy
Each message uses a unique key derived from the previous message's key. Compromising one message key doesn't reveal past messages.

### Post-Compromise Security
After a compromise, new keys are established that aren't derived from the compromised keys, protecting future messages.

### Authentication
All messages include HMAC tags to prevent tampering and ensure authenticity.

### Deniability
The protocol provides cryptographic deniability - no proof that a message was sent by a particular party.

### Pairwise Multi-Party Isolation (Groups v1)
Group conversations fan out into independent Double Ratchet channels per recipient. The server has zero knowledge of group rosters, channel names, or message counts.

### Pre-Encryption DLP Guard
Enterprise client-side pattern matching intercepts API keys, private keys, and payment card numbers before payload encryption.

## Performance

- **Key Generation**: ~50ms
- **Message Encryption**: ~5ms
- **Message Decryption**: ~5ms
- **Group Fan-Out Encryption (10 members)**: ~4.5ms
- **Storage per Conversation**: ~1KB

## Files

- `README.md` - This documentation
- `SECURITY_ANALYSIS.md` - Detailed security analysis
- `envelope.js` - Versioned JSON Signal envelope module (`v: 1`)
- `x3dh.js` - X3DH key exchange implementation
- `double_ratchet.js` - Double ratchet algorithm
- `key_management.js` - Key generation and management
- `session.js` - Session state management
- `idb_key_store.js` - IndexedDB persistence for CryptoKey objects
- `crypto_utils.js` - Cryptographic primitives
- `signal_protocol.js` - Main protocol coordinator
- `test_all.js` - Comprehensive test suite