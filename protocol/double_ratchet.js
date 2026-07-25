/**
 * Double Ratchet Algorithm — Fixed Implementation
 *
 * Bug 3 fix: kdfRootKey now uses HKDF (Signal spec) instead of PBKDF2.
 * Bug 4 fix: kdfRootKey no longer calls exportKey() on a non-extractable key.
 *            HKDF.deriveBits() returns raw bytes directly — no export needed.
 *
 * Private DH keys are CryptoKey objects throughout (never raw Uint8Array).
 * CryptoKey objects are structured-clone-compatible → stored directly in IndexedDB.
 *
 * Reference: https://signal.org/docs/specifications/doubleratchet/
 */
class DoubleRatchet {
  constructor(cryptoUtils) {
    this.crypto = cryptoUtils || new CryptoUtils();

    // Ratchet state (Uint8Array for chain keys; CryptoKey for DH keys)
    this.rootKey          = null; // Uint8Array 32 bytes
    this.sendingChainKey  = null; // Uint8Array 32 bytes
    this.receivingChainKey = null; // Uint8Array 32 bytes
    this.dhPublicKeyBytes = null; // Uint8Array — our current ratchet public key (sent in headers)
    this.dhPrivateKey     = null; // CryptoKey  — our current ratchet private key
    this.skippedKeys      = new Map(); // hex(dhPub+msgNum) → Uint8Array msgKey

    this._ratchetInfo  = new TextEncoder().encode('HalonyxRatchet');
    this._chainInfo    = new TextEncoder().encode('HalonyxChain');
  }

  /**
   * Initialize the Double Ratchet from the X3DH shared secret.
   *
   * @param {Uint8Array} sharedSecret   32-byte output from X3DH
   * @param {Uint8Array} remotePublicKeyBytes  Peer's ratchet public key (their SPK public bytes)
   * @param {boolean}    isInitiator
   */
  async initialize(sharedSecret, remotePublicKeyBytes, isInitiator) {
    this.rootKey = sharedSecret;

    // Generate our first ratchet DH key pair
    const kp = await this.crypto.generateDhKeyPair();
    this.dhPrivateKey     = kp.privateKey;     // CryptoKey
    this.dhPublicKeyBytes = kp.publicKeyBytes; // Uint8Array

    if (isInitiator) {
      // Initiator performs the first DH ratchet step immediately
      const dhOut = await this.crypto.deriveBits(this.dhPrivateKey, remotePublicKeyBytes);
      const [newRoot, sendCK] = await this._kdfRootKey(this.rootKey, dhOut);
      this.rootKey          = newRoot;
      this.sendingChainKey  = sendCK;
      this.receivingChainKey = null; // set when first message arrives
    } else {
      // Responder waits; initiator's first message will trigger the ratchet
      this.sendingChainKey  = null;
      this.receivingChainKey = null;
      // Store the remote key so we can ratchet when we first need to send
      this._pendingRemoteKey = remotePublicKeyBytes;
    }
  }

  // ── KDF functions ─────────────────────────────────────────────────────────

  /**
   * KDF_RK: derive new (rootKey, chainKey) from current rootKey and DH output.
   * Bug 3 & 4 fix: uses HKDF, returns raw bytes — no exportKey() call.
   */
  async _kdfRootKey(rootKey, dhOutput) {
    const ikm     = this.crypto.concatArrays(rootKey, dhOutput);
    const derived = await this.crypto.hkdf(ikm, rootKey, this._ratchetInfo, 64);
    return [derived.slice(0, 32), derived.slice(32, 64)];
  }

  /**
   * KDF_CK: derive (messageKey, newChainKey) from current chain key.
   * Uses HMAC-SHA-256 with fixed constants per the Signal spec.
   */
  async _kdfChainKey(chainKey) {
    const msgKey      = await this.crypto.sign(new Uint8Array([1]), chainKey);
    const newChainKey = await this.crypto.sign(new Uint8Array([2]), chainKey);
    return [msgKey.slice(0, 32), newChainKey];
  }

  // ── DH Ratchet step ───────────────────────────────────────────────────────

  async _dhRatchetReceive(newRemotePublicBytes) {
    // Step 1: derive new receiving chain key
    const dhOut1 = await this.crypto.deriveBits(this.dhPrivateKey, newRemotePublicBytes);
    const [root1, recvCK] = await this._kdfRootKey(this.rootKey, dhOut1);
    this.rootKey           = root1;
    this.receivingChainKey = recvCK;

    // Step 2: generate our new ratchet key pair
    const kp = await this.crypto.generateDhKeyPair();
    this.dhPrivateKey     = kp.privateKey;
    this.dhPublicKeyBytes = kp.publicKeyBytes;

    // Step 3: derive new sending chain key
    const dhOut2 = await this.crypto.deriveBits(this.dhPrivateKey, newRemotePublicBytes);
    const [root2, sendCK] = await this._kdfRootKey(this.rootKey, dhOut2);
    this.rootKey         = root2;
    this.sendingChainKey = sendCK;
  }

  // ── Encrypt ───────────────────────────────────────────────────────────────

  async encrypt(plaintext, additionalData = null) {
    // Responder: perform first send-ratchet lazily on first outbound message
    if (!this.sendingChainKey && this._pendingRemoteKey) {
      const dhOut = await this.crypto.deriveBits(this.dhPrivateKey, this._pendingRemoteKey);
      const [newRoot, sendCK] = await this._kdfRootKey(this.rootKey, dhOut);
      this.rootKey         = newRoot;
      this.sendingChainKey = sendCK;
      this._pendingRemoteKey = null;
    }

    if (!this.sendingChainKey) throw new Error('[DR] Not initialized for sending');

    const [msgKey, newCK] = await this._kdfChainKey(this.sendingChainKey);
    this.sendingChainKey = newCK;

    const iv         = this.crypto.generateNonce(12);
    const data       = typeof plaintext === 'string' ? new TextEncoder().encode(plaintext) : plaintext;
    const ciphertext = await this.crypto.encrypt(data, msgKey, iv, additionalData);

    return {
      header: { dhPublicKeyBytes: this.dhPublicKeyBytes, iv },
      ciphertext,
    };
  }

  // ── Decrypt ───────────────────────────────────────────────────────────────

  async decrypt(message, additionalData = null) {
    const { header, ciphertext } = message;
    const { dhPublicKeyBytes, iv } = header;

    // Check if this is a new ratchet key from the peer
    const isDifferentKey = !this.dhPublicKeyBytes ||
      !this.crypto.constantTimeEquals(dhPublicKeyBytes, this._lastPeerRatchetKey || new Uint8Array(0));

    if (isDifferentKey) {
      this._lastPeerRatchetKey = dhPublicKeyBytes;
      await this._dhRatchetReceive(dhPublicKeyBytes);
    }

    if (!this.receivingChainKey) throw new Error('[DR] No receiving chain key');

    const [msgKey, newCK] = await this._kdfChainKey(this.receivingChainKey);
    this.receivingChainKey = newCK;

    const plaintext = await this.crypto.decrypt(ciphertext, msgKey, iv, additionalData);
    return new TextDecoder().decode(plaintext);
  }

  // ── State serialization for IndexedDB ────────────────────────────────────
  // CryptoKey objects are structured-clone-compatible — stored as-is in IDB.

  getState() {
    return {
      rootKey:               this.rootKey,
      sendingChainKey:       this.sendingChainKey,
      receivingChainKey:     this.receivingChainKey,
      dhPublicKeyBytes:      this.dhPublicKeyBytes,
      dhPrivateKey:          this.dhPrivateKey,        // CryptoKey — IDB handles this
      _lastPeerRatchetKey:   this._lastPeerRatchetKey,
      _pendingRemoteKey:     this._pendingRemoteKey,
    };
  }

  restoreState(state) {
    this.rootKey               = state.rootKey;
    this.sendingChainKey       = state.sendingChainKey;
    this.receivingChainKey     = state.receivingChainKey;
    this.dhPublicKeyBytes      = state.dhPublicKeyBytes;
    this.dhPrivateKey          = state.dhPrivateKey;   // CryptoKey — restored directly
    this._lastPeerRatchetKey   = state._lastPeerRatchetKey;
    this._pendingRemoteKey     = state._pendingRemoteKey;
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = DoubleRatchet;
else if (typeof window !== 'undefined') window.DoubleRatchet = DoubleRatchet;
