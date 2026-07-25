/**
 * IDBKeyStore — IndexedDB-backed persistence for Signal Protocol keys
 *
 * Plan B: keys survive page reloads. CryptoKey objects are stored directly
 * using the structured clone algorithm — IndexedDB supports this natively,
 * so private keys are never exported to raw bytes or JWK.
 *
 * Object stores:
 *   'identity'  — one row: { id: 'self', ...keyMaterial }
 *   'sessions'  — one row per peer: { peerId, ratchetState }
 */
class IDBKeyStore {
  constructor(dbName = 'HalonyxKeyStore', version = 1) {
    this.dbName  = dbName;
    this.version = version;
    this._db     = null;
  }

  async open() {
    if (this._db) return;
    await new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.version);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('identity')) {
          db.createObjectStore('identity', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'peerId' });
        }
      };

      req.onsuccess  = (e) => { this._db = e.target.result; resolve(); };
      req.onerror    = ()  => reject(req.error);
    });
  }

  _tx(store, mode = 'readonly') {
    return this._db.transaction(store, mode).objectStore(store);
  }

  _get(store, key) {
    return new Promise((resolve, reject) => {
      const req = this._tx(store).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => reject(req.error);
    });
  }

  _put(store, value) {
    return new Promise((resolve, reject) => {
      const req = this._tx(store, 'readwrite').put(value);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  _delete(store, key) {
    return new Promise((resolve, reject) => {
      const req = this._tx(store, 'readwrite').delete(key);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  // ── Identity ──────────────────────────────────────────────────────────────

  /**
   * Persist identity key material.
   * All CryptoKey objects are stored directly via structured clone.
   *
   * @param {{
   *   identityPrivateKey:      CryptoKey,
   *   identityPublicBytes:     Uint8Array,
   *   signingPrivateKey:       CryptoKey,
   *   signingPublicBytes:      Uint8Array,
   *   signedPreKeyPrivate:     CryptoKey,
   *   signedPreKeyPublicBytes: Uint8Array,
   *   signedPreKeySignature:   Uint8Array,
   * }} identity
   */
  async saveIdentity(identity) {
    await this._put('identity', { id: 'self', ...identity });
  }

  /** @returns {Object|null} the saved identity or null if none */
  async loadIdentity() {
    return this._get('identity', 'self');
  }

  async clearIdentity() {
    await this._delete('identity', 'self');
  }

  // ── One-Time Pre-Keys (OPK) ───────────────────────────────────────────────

  async saveOpkState(opkState) {
    await this._put('identity', { id: 'opkState', ...opkState });
  }

  async loadOpkState() {
    return this._get('identity', 'opkState');
  }

  // ── Sessions (Double Ratchet state per peer) ──────────────────────────────

  /**
   * Persist a DoubleRatchet state for a peer.
   * The state object from dr.getState() contains CryptoKey → IDB handles it.
   *
   * @param {string} peerId
   * @param {Object} ratchetState  from DoubleRatchet.getState()
   */
  async saveSession(peerId, ratchetState) {
    await this._put('sessions', { peerId, ratchetState });
  }

  /** @returns {{ peerId, ratchetState }|null} */
  async loadSession(peerId) {
    return this._get('sessions', peerId);
  }

  async deleteSession(peerId) {
    await this._delete('sessions', peerId);
  }

  /** Load all sessions (returns array of { peerId, ratchetState }) */
  async loadAllSessions() {
    return new Promise((resolve, reject) => {
      const req = this._tx('sessions').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => reject(req.error);
    });
  }

  // ── Nuclear clear (logout) ────────────────────────────────────────────────

  async clearAll() {
    await new Promise((resolve, reject) => {
      const tx = this._db.transaction(['identity', 'sessions'], 'readwrite');
      tx.objectStore('identity').clear();
      tx.objectStore('sessions').clear();
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = IDBKeyStore;
else if (typeof window !== 'undefined') window.IDBKeyStore = IDBKeyStore;
