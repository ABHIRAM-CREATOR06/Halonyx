# Halonyx Architecture

Halonyx is a self-hostable browser messenger that combines a Node.js relay with browser-side cryptography. The server provides identity registration, public-key bundle exchange, authenticated REST endpoints, WebSocket delivery, offline message queuing, and an emergency broadcast bridge. Private cryptographic material and message-session state are intended to remain in the user’s browser.

This document describes the implementation represented by the repository source, including its security boundaries and current operational limitations.

## System overview

The system has three primary zones:

1. **The browser client** renders the messenger UI, stores local state, runs the Signal-style protocol implementation, and manages WebTorrent file transfers.

1. **The Halonyx server** exposes the HTTP API and WebSocket relay from one Node.js process. It routes messages and stores only the data required for identity lookup, public-key distribution, contacts, and offline delivery.

1. **Peer-to-peer transport** moves file bytes directly between browsers over WebRTC. The server transports the magnet URI through the chat channel but is not intended to carry the file contents.

![Halonyx system architecture](https://private-us-east-1.manuscdn.com/sessionFile/iWstP6NEWtXvDYvZZ6pRmQ/sandbox/KTyEnpLqpYAbhXj6NHzFHy-images_1790221923378_na1fn_L2hvbWUvdWJ1bnR1L0hhbG9ueXgvZG9jcy9pbWFnZXMvc3lzdGVtLWFyY2hpdGVjdHVyZQ.png?Expires=1790394728&Signature=MEUCIATxDxhDQfYeEkV3jwKzekD6Gf1JFeC1y7dQnjdfGQlQAiEAnq4s958L8K3x4cP9zXpWQF8SoNX8Dew-plF1ri-6JII_&Key-Pair-Id=K1K5N5YNBUUMMN)

*Figure 1. Runtime components and the main trust boundaries.*

## Repository-to-runtime mapping

| Runtime responsibility | Main implementation | Architectural role |
| --- | --- | --- |
| Browser UI | [`frontend/index.html`](frontend/index.html), [`frontend/js/app.js`](frontend/js/app.js), [`frontend/css/style.css`](frontend/css/style.css) | User interface, local state, REST and WebSocket client, file-transfer controls |
| HTTP API and static hosting | [`backend/server.js`](backend/server.js) | Express routes, JWT authentication, static frontend and protocol assets |
| Real-time relay | [`backend/server.js`](backend/server.js) | WebSocket registration, message forwarding, X3DH-init relay, offline mailbox flush |
| Protocol coordinator | [`protocol/signal_protocol.js`](protocol/signal_protocol.js) | Identity initialization, public bundle upload, session lifecycle, encryption and decryption |
| Initial key agreement | [`protocol/x3dh.js`](protocol/x3dh.js) | X3DH-style key bundle generation and shared-secret derivation |
| Ongoing session protection | [`protocol/double_ratchet.js`](protocol/double_ratchet.js) | Message-key advancement, ratchet state, forward-secrecy and post-compromise goals |
| Browser key persistence | [`protocol/idb_key_store.js`](protocol/idb_key_store.js) | IndexedDB persistence for CryptoKey objects and session state |
| Operational storage | [`backend/db/schema.sql`](backend/db/schema.sql) | Users, contacts, and offline mailbox |
| Identity storage | [`backend/db/identity_schema.sql`](backend/db/identity_schema.sql) | Name, email, and hashed USID registry |
| Public-key storage | [`backend/db/key_schema.sql`](backend/db/key_schema.sql) | Public X3DH bundles keyed by hashed USID |
| Container deployment | [`Dockerfile`](Dockerfile), [`docker-compose.yml`](docker-compose.yml) | Node.js runtime image and persistent SQLite volume |

## Browser architecture

The browser creates a `SignalProtocol` instance during startup. It opens IndexedDB, restores the user identity and any compatible ratchet sessions, and uploads a public bundle when a new identity is created. Private keys are held as browser `CryptoKey` objects; the server receives public bundle material only.

The browser uses `localStorage` for the JWT token, USID, contact aliases, theme settings, and message-history rendering state. IndexedDB stores identity keys, pre-keys, one-time pre-keys, and Double Ratchet session state. This distinction is important: browser-local message history is a separate persistence path from the server’s encrypted offline mailbox.

The client uses the same origin for REST and WebSocket traffic. The WebSocket scheme is selected from the page scheme: `wss://` for HTTPS deployments and `ws://` for HTTP development deployments. WebTorrent is initialized in the browser with WebRTC tracker and ICE-server configuration.

## Server architecture

`backend/server.js` creates an HTTP server, attaches Express to it, and attaches a `ws` WebSocket server to the same listener. The default HTTP port is `3000`. The emergency bridge binds a UDP socket to loopback port `9000`.

The HTTP layer provides registration, connection, contact management, key-bundle operations, and authenticated resource access. JWTs are issued during registration or connection and are checked by the `authenticate` middleware for protected routes. Signup and key-upload endpoints have dedicated rate limiters.

The WebSocket layer keeps an in-memory map from a canonical hashed USID to the active socket. It handles four important message classes:

- `register` associates a socket with a verified identity and flushes queued messages.

- `x3dh_init` forwards the initiator’s public handshake payload to the intended peer.

- `message` forwards an encrypted payload immediately when the recipient is online, or writes it to the offline mailbox when the recipient is unavailable.

- `emergency_broadcast` sends a bounded, rate-limited message through the loopback UDP bridge and fans it out to connected clients.

The relay does not need a session private key. Its normal message-routing path treats the encrypted message as an opaque payload.

## Secure message flow

The following sequence shows the intended secure path from first contact through an online or offline message delivery.

![Halonyx secure message flow](https://private-us-east-1.manuscdn.com/sessionFile/iWstP6NEWtXvDYvZZ6pRmQ/sandbox/KTyEnpLqpYAbhXj6NHzFHy-images_1790221923378_na1fn_L2hvbWUvdWJ1bnR1L0hhbG9ueXgvZG9jcy9pbWFnZXMvc2VjdXJlLW1lc3NhZ2UtZmxvdw.png?Expires=1790394728&Signature=MEYCIQDw5OAmyiGO3LxX5hjhPzQ~FI0f1glK5oE5rLzkqTLBDQIhALKnl9kuyMCN7H~OUE-mG1H03sqllGNOAsHfrMN0mExj&Key-Pair-Id=K1K5N5YNBUUMMN)

*Figure 2. Public-key exchange, X3DH initialization, ratchet encryption, relay, and mailbox delivery.*

A first conversation begins when the initiator fetches the peer’s public bundle from `/keys/:hashedUsid`. The initiator verifies the signed pre-key, computes the X3DH shared secret, initializes a Double Ratchet session locally, and sends an `x3dh_init` payload over WebSocket. The recipient verifies the incoming signed pre-key, derives the matching secret, initializes its responder ratchet, and persists the session locally.

For subsequent messages, the sender encrypts the plaintext in the browser and sends the resulting ciphertext and ratchet header to the relay. If the peer is connected, the relay forwards the payload. If the peer is offline, the relay stores the encrypted payload in the `mailbox` table, returns a queued status, and flushes then deletes the rows when the peer registers again.

## Cryptographic boundary

The cryptographic boundary is deliberately placed in the browser:

- **X3DH-style setup:** [`protocol/x3dh.js`](protocol/x3dh.js) generates identity, signing, and signed-pre-key material. The shared secret is derived from the DH outputs with HKDF-SHA-256.

- **Double Ratchet:** [`protocol/double_ratchet.js`](protocol/double_ratchet.js) maintains the per-peer ratchet and derives message keys.

- **Protocol orchestration:** [`protocol/signal_protocol.js`](protocol/signal_protocol.js) coordinates bundle upload, bundle retrieval, session creation, encryption, decryption, and persistence.

- **Safety verification:** the client computes safety numbers from identity material and warns when the observed identity changes.

- **Server-visible material:** the server receives identity references, JWTs, public bundles, routing metadata, and encrypted mailbox content. It is not designed to receive private browser keys.

The protocol documentation in [`protocol/README.md`](protocol/README.md) and [`protocol/SECURITY_ANALYSIS.md`](protocol/SECURITY_ANALYSIS.md) contains the project’s detailed cryptographic assumptions and limitations.

## Storage isolation

Halonyx uses three SQLite databases rather than one shared database. The databases are linked operationally by the hashed USID, not by storing a plaintext identity value in every table.

![Halonyx storage and file-transfer architecture](https://private-us-east-1.manuscdn.com/sessionFile/iWstP6NEWtXvDYvZZ6pRmQ/sandbox/KTyEnpLqpYAbhXj6NHzFHy-images_1790221923378_na1fn_L2hvbWUvdWJ1bnR1L0hhbG9ueXgvZG9jcy9pbWFnZXMvc3RvcmFnZS1hbmQtdHJhbnNmZXI.png?Expires=1790394728&Signature=MEUCIQCqTEQ11k6SnhD8cq~JaoxkNq-ceTb8IEK9Shj1iXPdJgIgaWntbR8VlwzDaFBceCXkj8Q5mWpvwAVmVmnebXWAiIU_&Key-Pair-Id=K1K5N5YNBUUMMN)

*Figure 3. Browser-local persistence, server-side database separation, and peer-to-peer file transfer.*

### `identity.db`

`identity.db` stores the persona-level registry in `users_metadata`: name, email, hashed USID, and creation time. It also contains the server configuration table defined by `identity_schema.sql`.

### `app.db`

`app.db` stores application relationships and delivery state. The `users` table holds the hashed USID and a public-key bundle reference, `contacts` stores contact relationships, and `mailbox` stores encrypted payloads for offline recipients. Mailbox rows are deleted after the server flushes them on reconnect, giving the current implementation at-most-once mailbox delivery semantics.

### `keys.db`

`keys.db` stores the serialized public key bundle used for X3DH setup. It does not store the corresponding private keys. The bundle is addressed by hashed USID and is served through authenticated key-management routes.

## Peer-to-peer file transfer

File transfer follows a different data path from text messages. The sender’s browser seeds a file through WebTorrent and sends the resulting magnet URI as chat content. The recipient receives the magnet URI through the relay, then downloads the file directly from the sender’s WebRTC data channel when a peer connection can be established.

Public trackers assist with peer discovery. They are not intended to receive the file contents. STUN and TURN configuration is supplied to WebRTC for NAT traversal. Transfer progress, speed, and seeding ratio are rendered in the browser.

## Deployment architecture

The Docker image uses Node.js 20 Alpine, installs native build dependencies for `sqlite3`, copies the backend, frontend, and protocol directories, exposes port `3000`, and declares `/app/backend/db` as a persistent volume. Docker Compose maps the host port from `PORT` and stores database state in the named `halonyx-db-data` volume.

```
Browser
  │ HTTPS / WSS
  ▼
halonyx-app container :3000
  ├── Express REST API
  ├── WebSocket relay
  ├── Static frontend and protocol assets
  └── /app/backend/db  ← persistent volume
        ├── identity.db
        ├── app.db
        ├── keys.db
        └── .jwt_secret
```

The application also creates or loads a JWT secret from `JWT_SECRET` or `backend/db/.jwt_secret`. A deployment should persist the database directory and provide a stable secret through an environment variable or a protected persistent volume.

## Security boundaries and current limitations

The architecture provides a strong separation between browser-held private keys and server-held relay data, but the repository describes itself as a final-year project rather than a production messenger. The following limitations should remain visible to maintainers and deployers:

1. **Transport security depends on deployment.** Production deployments should terminate HTTPS and use WSS. The development configuration also supports plain HTTP and WS.

1. **The relay still sees metadata.** It can observe connection state, routing identifiers, timing, mailbox presence, and WebSocket traffic patterns even when message content is encrypted.

1. **Local browser storage is sensitive.** `localStorage` contains message-history state and authentication material. A browser compromise or same-origin script compromise can expose local data.

1. **The current client has a plaintext fallback path.** In `sendMessage()`, if no Signal session exists or encryption throws, the client can send a `content` field rather than an encrypted payload. This behavior should be treated as an implementation limitation and reviewed before production use.

1. **Files are not end-to-end encrypted by the protocol layer.** WebTorrent provides peer-to-peer transport, while the magnet URI is carried inside chat. Deployers should not interpret tracker-assisted WebRTC transfer as equivalent to application-layer file encryption.

1. **The UDP emergency bridge is local to the server process.** It uses loopback binding, payload limits, token validation, and rate limits, but it is a separate broadcast path from ordinary encrypted chat.

## Local development

```bash
git clone https://github.com/ABHIRAM-CREATOR06/Halonyx.git
cd Halonyx
npm install
npm start
```

Open `http://localhost:3000`. Docker Compose is available for a persistent local deployment:

```bash
docker compose up -d --build
```

## Diagram sources

The PNG figures in `docs/images/` are generated from the Mermaid sources in `docs/diagrams/`. To regenerate them after an architecture change:

```bash
manus-render-diagram docs/diagrams/system-architecture.mmd docs/images/system-architecture.png
manus-render-diagram docs/diagrams/secure-message-flow.mmd docs/images/secure-message-flow.png
manus-render-diagram docs/diagrams/storage-and-transfer.mmd docs/images/storage-and-transfer.png
```

## References

[1]: https://github.com/ABHIRAM-CREATOR06/Halonyx "Halonyx source repository"

[2]: https://github.com/ABHIRAM-CREATOR06/Halonyx/blob/main/backend/server.js "Halonyx server implementation"

[3]: https://github.com/ABHIRAM-CREATOR06/Halonyx/blob/main/protocol/signal_protocol.js "Halonyx Signal protocol coordinator"

[4]: https://github.com/ABHIRAM-CREATOR06/Halonyx/blob/main/protocol/x3dh.js "Halonyx X3DH implementation"

[5]: https://github.com/ABHIRAM-CREATOR06/Halonyx/blob/main/protocol/double_ratchet.js "Halonyx Double Ratchet implementation"

[6]: https://signal.org/docs/specifications/x3dh/ "Signal X3DH specification"

[7]: https://signal.org/docs/specifications/doubleratchet/ "Signal Double Ratchet specification"

[8]: https://webtorrent.io/docs "WebTorrent documentation"

[9]: https://github.com/ABHIRAM-CREATOR06/Halonyx/blob/main/Dockerfile "Halonyx container definition"

[10]: https://github.com/ABHIRAM-CREATOR06/Halonyx/blob/main/docker-compose.yml "Halonyx Docker Compose definition"

The architecture diagrams and explanations in this document are derived from the repository source at [1], especially the server implementation [2], client protocol coordinator [3], X3DH implementation [4], Double Ratchet implementation [5], and deployment definitions [9] [10].