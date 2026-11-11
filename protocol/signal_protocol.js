/**
 * SignalProtocol — Main E2EE Coordinator for Halonyx
 *
 * Orchestrates:
 *   - Identity generation & IndexedDB persistence (Plan B)
 *   - X3DH session initiation (initiator & responder paths)
 *   - Double Ratchet encrypt / decrypt per session
 *   - Public key bundle upload to / fetch from server
 *
 * Usage:
 *   const sp = new SignalProtocol();
 *   await sp.init(myUsid, authToken);        // generates or restores identity
 *   await sp.openSession(peerUsid);          // X3DH as initiator
 *   const enc = await sp.encrypt(peerUsid, 'hello');   // → { header, ciphertext }
 *   const txt = await sp.decrypt(peerUsid, enc);        // → 'hello'
 */
class SignalProtocol {
  constructor() {
    this.crypto   = new CryptoUtils();
    this.x3dh     = new X3DH(this.crypto);
    this.idb      = new IDBKeyStore();

    this.identity     = null;
    this.sessions     = new Map(); // peerId → DoubleRatchet instance
    this._sessionMeta = new Map(); // peerId → { peerIdentityPublicBytes }
    this.userId   = null;
    this.token    = null;
    this._ready   = false;
  }

  _validateCryptoKey(key, algorithm, usage) {
    return !!key && key.type === 'private' && key.algorithm?.name === algorithm &&
      Array.from(key.usages || []).includes(usage);
  }

  _validateIdentity(identity, allowUnowned = false) {
    const bytes = (value, length) => value instanceof Uint8Array && value.length === length;
    if (!identity || (identity.ownerUserId !== this.userId && !(allowUnowned && identity.ownerUserId === undefined)) ||
        !bytes(identity.identityPublicBytes, 32) ||
        !bytes(identity.signingPublicBytes, 32) || !bytes(identity.signedPreKeyPublicBytes, 32) ||
        !bytes(identity.signedPreKeySignature, 64) ||
        !this._validateCryptoKey(identity.identityPrivateKey, 'X25519', 'deriveBits') ||
        !this._validateCryptoKey(identity.signedPreKeyPrivate, 'X25519', 'deriveBits') ||
        !this._validateCryptoKey(identity.signingPrivateKey, 'Ed25519', 'sign')) {
      throw new Error('Saved encryption identity is malformed or incompatible; local data was preserved');
    }
  }

  _validateOpkState(state) {
    if (state == null) return;
    if (state.ownerUserId !== undefined && state.ownerUserId !== this.userId ||
        !Number.isInteger(state.count) || !Array.isArray(state.keys) || state.count !== state.keys.length ||
        !Number.isInteger(state.lastKeyId) || state.lastKeyId < 0 ||
        new Set(state.keys.map((entry) => entry?.id)).size !== state.keys.length ||
        state.keys.some((entry) => !Number.isInteger(entry.id) || entry.id < 1 || entry.id > state.lastKeyId ||
          !this._validateCryptoKey(entry.privateKey, 'X25519', 'deriveBits'))) {
      throw new Error('Saved pre-key state is malformed; local data was preserved');
    }
  }

  _validateRatchetState(state) {
    const bytes = (value, optional = false) => optional && value == null || value instanceof Uint8Array && value.length === 32;
    if (!state || state.version !== 3 || !bytes(state.rootKey) || !bytes(state.dhPublicKeyBytes) ||
        !bytes(state.sendingChainKey, true) || !bytes(state.receivingChainKey, true) ||
        !bytes(state._lastPeerRatchetKey, true) || !bytes(state._pendingRemoteKey, true) ||
        !this._validateCryptoKey(state.dhPrivateKey, 'X25519', 'deriveBits')) {
      throw new Error('A saved peer session is malformed or unsupported; local session data was preserved');
    }
  }

  // ── Initialization ────────────────────────────────────────────────────────

  /**
   * Initialize the protocol stack.
   * Restores identity from IndexedDB if available (Plan B),
   * otherwise generates a fresh identity and uploads the public bundle.
   *
   * @param {string} userId   raw USID stored in localStorage
   * @param {string} token    JWT auth token
   */
  async init(userId, token) {
    this.userId = userId;
    this.token  = token;

    this.idb.setUserId(userId);
    await this.idb.open();

    let stored = await this.idb.loadIdentity();
    if (stored) {
      this._validateIdentity(stored);
      console.log('[Signal] Restored identity from IndexedDB');
      this.identity = stored;
    } else {
      const legacy = await this.idb.loadLegacyData();
      const unownedSessions = legacy.sessions;
      const hasUnownedData = !!legacy.opkState && !legacy.opkState.ownerUserId || unownedSessions.length > 0;

      if (legacy.identity?.ownerUserId === userId) {
        throw new Error('The previously adopted local identity is missing; no replacement identity was generated');
      }
      if (legacy.identity && !legacy.identity.ownerUserId) {
        if (legacy.opkState?.ownerUserId && legacy.opkState.ownerUserId !== userId) {
          throw new Error('Legacy key records have conflicting account ownership; local data was preserved');
        }
        this._validateIdentity(legacy.identity, true);
        this._validateOpkState(legacy.opkState);
        for (const { ratchetState } of unownedSessions) this._validateRatchetState(ratchetState);
        const confirmed = typeof window !== 'undefined' && typeof window.confirm === 'function' &&
          window.confirm(`A legacy encryption identity without account metadata was found on this device. Use it for the account ${userId}? This will associate that saved identity with this account. Other accounts on this browser will receive separate identities. The original local records will be preserved.`);
        if (!confirmed) throw new Error('Saved local identity was not adopted; existing key data was preserved');
        await this.idb.adoptLegacyData((identity, opkState, sessions) => {
          this._validateIdentity(identity, true);
          this._validateOpkState(opkState);
          for (const { ratchetState } of sessions) this._validateRatchetState(ratchetState);
        });
        stored = await this.idb.loadIdentity();
        this._validateIdentity(stored);
        this.identity = stored;
      } else if (hasUnownedData || legacy.identity?.ownerUserId) {
        if (legacy.identity?.ownerUserId && legacy.identity.ownerUserId !== userId && !hasUnownedData) {
          // A different account already owns the preserved legacy records.
        } else {
          throw new Error('Incomplete or already-associated legacy key data was found; local data was preserved and no new identity was generated');
        }
        console.log('[Signal] Generating identity in this account’s isolated local store');
        const bundle = await this.x3dh.generateKeyBundle();
        this._validateIdentity(bundle, true);
        await this.idb.saveIdentity(bundle);
        this.identity = bundle;
      } else {
        const opkState = await this.idb.loadOpkState();
        const sessions = await this.idb.loadAllSessions();
        if (opkState || sessions.length) {
          throw new Error('Saved account key material exists without its identity; local data was preserved and no replacement was generated');
        }
        console.log('[Signal] Generating new identity…');
        const bundle = await this.x3dh.generateKeyBundle();
        this._validateIdentity(bundle, true);
        await this.idb.saveIdentity(bundle);
        this.identity = bundle;
      }
    }
    this._validateOpkState(await this.idb.loadOpkState());
    // Always sync public bundle to server so keys.db is kept populated
    try {
      await this._uploadPublicBundle();
    } catch (uploadErr) {
      console.warn('[Signal] Key bundle upload error during init:', uploadErr);
    }

    // Restore any persisted sessions
    const savedSessions = await this.idb.loadAllSessions();
    for (const { ratchetState } of savedSessions) this._validateRatchetState(ratchetState);
    for (const { peerId, ratchetState } of savedSessions) {
      const dr = new DoubleRatchet(this.crypto);
      dr.restoreState(ratchetState);
      this.sessions.set(peerId, dr);
      console.log(`[Signal] Restored session with ${peerId.substring(0, 12)}…`);
    }

    this._ready = true;
    console.log('[Signal] Protocol ready');
    this.replenishPreKeysIfNecessary().catch(() => {
      console.warn('[Signal] Pre-key replenishment failed; existing local keys were preserved');
    });
  }

  // ── Key bundle upload / fetch ─────────────────────────────────────────────

  async _uploadPublicBundle() {
    const encoded = this.x3dh.encodePublicBundle(this.identity);
    const res = await fetch('/keys/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body: JSON.stringify({ bundle: encoded }),
    });
    if (res.status === 401) {
      if (typeof window !== 'undefined' && typeof window.handleAuthError === 'function') {
        window.handleAuthError("Session expired during key upload");
      }
    }
    if (!res.ok) console.error('[Signal] Key bundle upload failed', await res.text());
    else console.log('[Signal] Public key bundle uploaded');
  }

  async replenishPreKeysIfNecessary() {
    let opkState = await this.idb.loadOpkState() || { count: 0, keys: [], lastKeyId: 0 };
    this._validateOpkState(opkState);
    if (opkState.count < 20) {
      console.log(`[Signal] OPK count low (${opkState.count}), generating fresh batch…`);
      const newPreKeys = [];
      const newPrivateKeys = [];
      
      let currentId = opkState.lastKeyId;
      for (let i = 0; i < 100; i++) {
        const ek = await this.crypto.generateDhKeyPair();
        currentId++;
        const id = currentId;
        newPreKeys.push({ id, publicKey: this.crypto.bufferToBase64(ek.publicKeyBytes) });
        newPrivateKeys.push({ id, privateKey: ek.privateKey });
      }
      
      const res = await fetch('/keys/replenish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify({ preKeys: newPreKeys }),
      });
      
      if (res.status === 401) {
        if (typeof window !== 'undefined' && typeof window.handleAuthError === 'function') {
          window.handleAuthError("Session expired during key replenishment");
        }
      }

      if (res.ok) {
        opkState.keys = opkState.keys.concat(newPrivateKeys);
        opkState.count = opkState.keys.length;
        opkState.lastKeyId = currentId;
        await this.idb.saveOpkState(opkState);
        console.log(`[Signal] Pre-keys replenished successfully. New count: ${opkState.count}`);
      } else {
        console.error('[Signal] Failed to replenish pre-keys');
      }
    }
  }

  async _fetchPeerBundle(peerUsid) {
    const res = await fetch(`/keys/${encodeURIComponent(peerUsid)}`);
    if (!res.ok) throw new Error(`[Signal] No key bundle for peer ${peerUsid.substring(0, 12)}`);
    const { bundle, opk } = await res.json();
    const decoded = this.x3dh.decodePublicBundle(bundle);
    decoded.opk = opk || null;
    return decoded;
  }

  // ── Session management ────────────────────────────────────────────────────

  /**
   * Open a session with a peer as initiator (X3DH → Double Ratchet).
   * If a session already exists in memory or IDB, returns immediately.
   *
   * @param {string} peerUsid   hashed USID of the peer
   * @returns {{ ephemeralPublicBytes: Uint8Array }}  initial message payload to send over WS
   */
  async openSession(peerUsid) {
    if (this.sessions.has(peerUsid)) {
      console.log(`[Signal] Session with ${peerUsid.substring(0,12)} already open`);
      return null;
    }

    const peerBundle = await this._fetchPeerBundle(peerUsid);

    let theirOpkBytes = null;
    let opkId = null;
    if (peerBundle.opk && peerBundle.opk.publicKey) {
      try {
        theirOpkBytes = this.crypto.base64ToBuffer(peerBundle.opk.publicKey);
        opkId = peerBundle.opk.id;
      } catch (opkErr) {
        console.warn('[Signal] Could not parse peer OPK, falling back to 3-DH:', opkErr);
      }
    }

    // X3DH — initiator path (4-DH if OPK present, else 3-DH fallback)
    const { ephemeralPublicBytes, sharedSecret, usedOpk } = await this.x3dh.createInitialMessage(
      this.identity.identityPrivateKey,
      this.identity.identityPublicBytes,
      peerBundle.identityPublicBytes,
      peerBundle.signedPreKeyPublicBytes,
      peerBundle.signedPreKeySignature,
      peerBundle.signingPublicBytes,
      theirOpkBytes,
    );

    // Initialize Double Ratchet (initiator)
    const dr = new DoubleRatchet(this.crypto);
    await dr.initialize(sharedSecret, peerBundle.signedPreKeyPublicBytes, true);
    this.sessions.set(peerUsid, dr);
    this._sessionMeta.set(peerUsid, { peerIdentityPublicBytes: peerBundle.identityPublicBytes });
    await this.idb.saveSession(peerUsid, dr.getState());

    console.log(`[Signal] Session opened with ${peerUsid.substring(0,12)}… (${usedOpk ? '4-DH' : '3-DH fallback'})`);

    // Return the X3DH initial message payload (sent over WS so peer can respond)
    return {
      type:                   'x3dh_init',
      senderIdentityPublic:   this.crypto.bufferToBase64(this.identity.identityPublicBytes),
      senderSigningPublic:    this.crypto.bufferToBase64(this.identity.signingPublicBytes),
      senderSpkPublic:        this.crypto.bufferToBase64(this.identity.signedPreKeyPublicBytes),
      senderSpkSignature:     this.crypto.bufferToBase64(this.identity.signedPreKeySignature),
      ephemeralPublic:        this.crypto.bufferToBase64(ephemeralPublicBytes),
      ratchetPublic:          this.crypto.bufferToBase64(dr.dhPublicKeyBytes),
      opkId:                  usedOpk ? opkId : null,
    };
  }

  /**
   * Process an incoming X3DH init message (responder path).
   * Creates a session and saves it to IDB.
   *
   * @param {string} peerUsid
   * @param {Object} msg   the x3dh_init payload received over WS
   */
  async acceptSession(peerUsid, msg) {
    if (this.sessions.has(peerUsid)) return;

    const theirIdentityPublicBytes  = this.crypto.base64ToBuffer(msg.senderIdentityPublic);
    const theirEphemeralPublicBytes = this.crypto.base64ToBuffer(msg.ephemeralPublic);

    // Verify their signed pre-key before using it
    const theirSpkPublicBytes = this.crypto.base64ToBuffer(msg.senderSpkPublic);
    const theirSpkSignature   = this.crypto.base64ToBuffer(msg.senderSpkSignature);
    const theirSigningPublic  = this.crypto.base64ToBuffer(msg.senderSigningPublic);
    const valid = await this.crypto.verifyEd25519(theirSpkPublicBytes, theirSpkSignature, theirSigningPublic);
    if (!valid) throw new Error('[Signal] Peer SPK signature invalid — rejecting session');

    // Look up one-time prekey if initiator used DH4
    let myOpkPrivate = null;
    const opkState = (await this.idb.loadOpkState()) || { count: 0, keys: [], lastKeyId: 0 };
    this._validateOpkState(opkState);
    if (msg.opkId !== undefined && msg.opkId !== null && Array.isArray(opkState.keys)) {
      const idx = opkState.keys.findIndex((k) => k.id === msg.opkId);
      if (idx !== -1) {
        myOpkPrivate = opkState.keys[idx].privateKey;
        opkState.keys.splice(idx, 1);
        opkState.count = opkState.keys.length;
        await this.idb.saveOpkState(opkState);
        this.replenishPreKeysIfNecessary();
      }
    }

    // X3DH — responder path (4-DH if OPK was matched, else 3-DH fallback)
    const { sharedSecret } = await this.x3dh.processInitialMessage(
      theirIdentityPublicBytes,
      theirEphemeralPublicBytes,
      this.identity.identityPrivateKey,
      this.identity.signedPreKeyPrivate,
      myOpkPrivate,
    );

    // Use initiator's ratchet public key if provided, else fall back to identity public
    const theirRatchetPublicBytes = msg.ratchetPublic
      ? this.crypto.base64ToBuffer(msg.ratchetPublic)
      : theirIdentityPublicBytes;

    // Initialize Double Ratchet (responder)
    const dr = new DoubleRatchet(this.crypto);
    await dr.initialize(
      sharedSecret,
      theirRatchetPublicBytes,
      false,
      {
        privateKey: this.identity.signedPreKeyPrivate,
        publicKeyBytes: this.identity.signedPreKeyPublicBytes,
      },
    );
    this.sessions.set(peerUsid, dr);
    this._sessionMeta.set(peerUsid, { peerIdentityPublicBytes: theirIdentityPublicBytes });
    await this.idb.saveSession(peerUsid, dr.getState());

    console.log(`[Signal] Accepted session from ${peerUsid.substring(0,12)}… (${myOpkPrivate ? '4-DH' : '3-DH fallback'})`);
  }

  // ── Encrypt / Decrypt ─────────────────────────────────────────────────────

  /**
   * Encrypt a plaintext string for a peer.
   * @returns {{ header: { dhPublicKeyBytes, iv }, ciphertext: Uint8Array }}
   */
  async encrypt(peerUsid, plaintext) {
    const dr = this.sessions.get(peerUsid);
    if (!dr) throw new Error(`[Signal] No session with ${peerUsid}`);

    const result = await dr.encrypt(plaintext);

    // Persist updated ratchet state after every encrypt
    await this.idb.saveSession(peerUsid, dr.getState());

    // Encode for wire transmission
    return {
      header: {
        dhPublicKeyBytes: this.crypto.bufferToBase64(result.header.dhPublicKeyBytes),
        iv:               this.crypto.bufferToBase64(result.header.iv),
      },
      ciphertext: this.crypto.bufferToBase64(result.ciphertext),
    };
  }

  /**
   * Decrypt an incoming encrypted message from a peer.
   * @param {string} peerUsid
   * @param {{ header, ciphertext }} wireMsg  encoded payload from WS
   * @returns {string} plaintext
   */
  async decrypt(peerUsid, wireMsg) {
    const dr = this.sessions.get(peerUsid);
    if (!dr) throw new Error(`[Signal] No session with ${peerUsid}`);

    const msg = {
      header: {
        dhPublicKeyBytes: this.crypto.base64ToBuffer(wireMsg.header.dhPublicKeyBytes),
        iv:               this.crypto.base64ToBuffer(wireMsg.header.iv),
      },
      ciphertext: this.crypto.base64ToBuffer(wireMsg.ciphertext),
    };

    const plaintext = await dr.decrypt(msg);

    // Persist updated ratchet state after every decrypt
    await this.idb.saveSession(peerUsid, dr.getState());

    return plaintext;
  }

  hasSession(peerUsid) {
    return this.sessions.has(peerUsid);
  }

  /**
   * Compute a Safety Number for the session with a peer.
   *
   * Algorithm (deterministic on both sides):
   *   1. Sort both identity public key byte arrays lexicographically
   *      so Alice and Bob use the same ordering regardless of who calls.
   *   2. HKDF-SHA-256(IKM = concat(keyA, keyB), salt = zeros, info = label)
   *      → 30 bytes of output.
   *   3. Split into 12 chunks of 2.5 bytes → each chunk → mod 100 000
   *      → zero-padded to 5 digits.
   *
   * If Alice and Bob see the same number, no key was substituted.
   *
   * @param {string} peerUsid
   * @returns {string}  e.g. "05 123 45 678 901 23 456 78 901 234 567 89"
   *                    formatted as four rows of three 5-digit groups
   */
  async computeSafetyNumber(peerUsid) {
    if (!this.identity) throw new Error('[Signal] Not initialized');

    const session = this._sessionMeta.get(peerUsid);
    if (!session || !session.peerIdentityPublicBytes)
      throw new Error('[Signal] No session or missing peer identity key');

    const myKey   = this.identity.identityPublicBytes;
    const peerKey = session.peerIdentityPublicBytes;

    // Canonical order: lexicographically smaller key goes first
    const cmp = this._compareBytes(myKey, peerKey);
    const [keyA, keyB] = cmp <= 0 ? [myKey, peerKey] : [peerKey, myKey];

    const ikm  = this.crypto.concatArrays(keyA, keyB);
    const salt = new Uint8Array(32);
    const info = new TextEncoder().encode('HalonyxSafetyNumber');
    const out  = await this.crypto.hkdf(ikm, salt, info, 30);

    return this._formatSafetyNumber(out);
  }

  /** Lexicographic byte comparison. Returns negative, 0, or positive. */
  _compareBytes(a, b) {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return a.length - b.length;
  }

  /**
   * Convert 30 raw bytes to 12 groups of 5 digits.
   * Each group is derived from a rolling 4-byte window → mod 100 000.
   */
  _formatSafetyNumber(bytes) {
    const groups = [];
    for (let i = 0; i < 12; i++) {
      let val = 0;
      for (let j = 0; j < 4; j++) {
        val = val * 256 + bytes[(i * 2 + j) % bytes.length];
      }
      groups.push(String(Math.abs(val % 100000)).padStart(5, '0'));
    }
    // Return as 4 rows of 3 groups for display
    return [
      groups.slice(0, 3).join(' '),
      groups.slice(3, 6).join(' '),
      groups.slice(6, 9).join(' '),
      groups.slice(9, 12).join(' '),
    ].join('\n');
  }


  async closeSession(peerUsid) {
    this.sessions.delete(peerUsid);
    this._sessionMeta.delete(peerUsid);
    await this.idb.deleteSession(peerUsid);
  }

  /** Explicit local-data deletion for the currently initialized account. */
  async clear() {
    this.sessions.clear();
    this.identity = null;
    this._ready   = false;
    await this.idb.clearAll();
  }

  get isReady() { return this._ready; }
}

if (typeof module !== 'undefined' && module.exports) module.exports = SignalProtocol;
else if (typeof window !== 'undefined') window.SignalProtocol = SignalProtocol;
