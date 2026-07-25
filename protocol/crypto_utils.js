/**
 * Crypto Utilities — Fixed & Enhanced for Halonyx Signal Protocol
 *
 * Fixes applied vs original:
 *  [Bug 1] AES-GCM: 'nonce' → 'iv' (correct Web Crypto parameter name)
 *  [Bug 2] X25519 private keys kept as CryptoKey objects — never exported raw
 *  [New]   HKDF method for Signal ratchet KDFs (replaces misused PBKDF2)
 *  [New]   Ed25519 sign / verify for pre-key signatures
 */
class CryptoUtils {
  constructor() {
    this.hashAlgorithm = 'SHA-256';
  }

  // ── Random bytes ──────────────────────────────────────────────────────────

  generateRandomBytes(length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }

  generateNonce(length = 12) {
    return this.generateRandomBytes(length);
  }

  // ── AES-GCM ───────────────────────────────────────────────────────────────

  async _importAesKey(keyData) {
    return crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  /**
   * Encrypt with AES-256-GCM.
   * @param {Uint8Array} plaintext
   * @param {Uint8Array} key        32-byte key
   * @param {Uint8Array} iv         12-byte IV  ← was incorrectly called 'nonce'
   * @param {Uint8Array} [additionalData]
   * @returns {Uint8Array} ciphertext + 16-byte GCM auth tag (concatenated by SubtleCrypto)
   */
  async encrypt(plaintext, key, iv, additionalData = null) {
    const cryptoKey = await this._importAesKey(key);
    const params = { name: 'AES-GCM', iv };                 // ← Bug 1 fixed: 'iv'
    if (additionalData) params.additionalData = additionalData;
    const buf = await crypto.subtle.encrypt(params, cryptoKey, plaintext);
    return new Uint8Array(buf);
  }

  async decrypt(ciphertext, key, iv, additionalData = null) {
    const cryptoKey = await this._importAesKey(key);
    const params = { name: 'AES-GCM', iv };                 // ← Bug 1 fixed: 'iv'
    if (additionalData) params.additionalData = additionalData;
    const buf = await crypto.subtle.decrypt(params, cryptoKey, ciphertext);
    return new Uint8Array(buf);
  }

  // ── HMAC-SHA-256 ──────────────────────────────────────────────────────────

  async _importHmacKey(keyData) {
    return crypto.subtle.importKey(
      'raw', keyData,
      { name: 'HMAC', hash: this.hashAlgorithm },
      false, ['sign', 'verify']
    );
  }

  async sign(data, key) {
    const ck = await this._importHmacKey(key);
    return new Uint8Array(await crypto.subtle.sign('HMAC', ck, data));
  }

  async verify(data, key, signature) {
    const ck = await this._importHmacKey(key);
    return crypto.subtle.verify('HMAC', ck, signature, data);
  }

  // ── SHA-256 hash ──────────────────────────────────────────────────────────

  async hash(data) {
    return new Uint8Array(await crypto.subtle.digest(this.hashAlgorithm, data));
  }

  // ── HKDF-SHA-256 ─────────────────────────────────────────────────────────
  // Required for Signal ratchet KDFs. Original code used PBKDF2 — wrong primitive.

  /**
   * HKDF-SHA-256 extract + expand.
   * @param {Uint8Array} ikm    Input keying material
   * @param {Uint8Array} salt   32-byte salt (pass new Uint8Array(32) for zero salt)
   * @param {Uint8Array} info   Context label bytes
   * @param {number}     length Output byte length
   * @returns {Uint8Array}
   */
  async hkdf(ikm, salt, info, length = 32) {
    const ikmKey = await crypto.subtle.importKey(
      'raw', ikm, { name: 'HKDF' }, false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info },
      ikmKey, length * 8
    );
    return new Uint8Array(bits);
  }

  // ── X25519 ECDH key pairs ─────────────────────────────────────────────────
  // Bug 2 fix: private keys are CryptoKey objects, never exported as raw bytes.
  // CryptoKey objects are structured-clone-compatible → store directly in IndexedDB.

  /**
   * Generate an X25519 DH key pair.
   * @returns {{ publicKey: CryptoKey, privateKey: CryptoKey, publicKeyBytes: Uint8Array }}
   *   publicKeyBytes — raw 32-byte X25519 public key for transmission / storage as bytes.
   */
  async generateDhKeyPair() {
    const kp = await crypto.subtle.generateKey(
      { name: 'X25519' },
      true,                // extractable=true: needed to export publicKey as 'raw'
      ['deriveBits']
    );
    const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
    return { publicKey: kp.publicKey, privateKey: kp.privateKey, publicKeyBytes };
  }

  // Alias kept for files that call generateIdentityKeyPair()
  async generateIdentityKeyPair() {
    return this.generateDhKeyPair();
  }

  /**
   * Import raw X25519 public key bytes → CryptoKey (for deriveBits).
   */
  async importDhPublicKey(bytes) {
    return crypto.subtle.importKey(
      'raw', bytes,
      { name: 'X25519' },
      true, []
    );
  }

  /**
   * X25519 DH: privateKey (CryptoKey) × peerPublicKey (Uint8Array) → 32-byte secret.
   */
  async deriveBits(privateKey, peerPublicKeyBytes) {
    const pub = await this.importDhPublicKey(peerPublicKeyBytes);
    const bits = await crypto.subtle.deriveBits(
      { name: 'X25519', public: pub }, privateKey, 256
    );
    return new Uint8Array(bits);
  }

  // ── Ed25519 signing ───────────────────────────────────────────────────────
  // Bug 6 fix: replaces the HMAC-based stub that always returned true.
  // Ed25519 is supported in Chrome 113+, Firefox 130+, Edge 113+.

  /**
   * Generate an Ed25519 signing key pair.
   * @returns {{ publicKey: CryptoKey, privateKey: CryptoKey, publicKeyBytes: Uint8Array }}
   */
  async generateSigningKeyPair() {
    const kp = await crypto.subtle.generateKey(
      { name: 'Ed25519' }, true, ['sign', 'verify']
    );
    const publicKeyBytes = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
    return { publicKey: kp.publicKey, privateKey: kp.privateKey, publicKeyBytes };
  }

  /**
   * Sign data with an Ed25519 private key (CryptoKey).
   */
  async signEd25519(data, privateKey) {
    return new Uint8Array(await crypto.subtle.sign('Ed25519', privateKey, data));
  }

  /**
   * Verify an Ed25519 signature.
   * @param {Uint8Array} data
   * @param {Uint8Array} signature
   * @param {Uint8Array} publicKeyBytes  raw 32-byte Ed25519 public key
   */
  async verifyEd25519(data, signature, publicKeyBytes) {
    const pub = await crypto.subtle.importKey(
      'raw', publicKeyBytes,
      { name: 'Ed25519' }, false, ['verify']
    );
    return crypto.subtle.verify('Ed25519', pub, signature, data);
  }

  // ── Constant-time comparison ──────────────────────────────────────────────

  constantTimeEquals(a, b) {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i];
    return result === 0;
  }

  // ── Encoding helpers ──────────────────────────────────────────────────────

  bufferToBase64(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }

  base64ToBuffer(base64) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  toHexString(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  fromHexString(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2)
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    return bytes;
  }

  concatArrays(...arrays) {
    const total = arrays.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const a of arrays) { out.set(a, off); off += a.length; }
    return out;
  }

  sliceArray(array, start, end) {
    return array.slice(start, end);
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = CryptoUtils;
else if (typeof window !== 'undefined') window.CryptoUtils = CryptoUtils;
