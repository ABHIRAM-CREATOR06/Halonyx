/**
 * IDBKeyStore — IndexedDB-backed persistence for Signal Protocol keys.
 * CryptoKey objects remain in IndexedDB; private key bytes are never serialized.
 */
class IDBKeyStore {
  constructor(dbName = 'HalonyxKeyStore', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this._db = null;
    this.userId = null;
  }

  setUserId(userId) {
    if (typeof userId !== 'string' || !userId) throw new Error('A valid account ID is required for key storage');
    this.userId = userId;
  }

  _accountKey(key) {
    if (!this.userId) throw new Error('Key storage is not bound to an account');
    return `${key}:${this.userId}`;
  }

  _sessionKey(peerId) {
    if (typeof peerId !== 'string' || !peerId) throw new Error('A valid peer ID is required');
    if (!this.userId) throw new Error('Key storage is not bound to an account');
    return JSON.stringify([this.userId, peerId]);
  }

  async open() {
    if (this._db) return;
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is unavailable; saved encryption keys were not changed');
    await new Promise((resolve, reject) => {
      let settled = false;
      const req = indexedDB.open(this.dbName, this.version);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('identity')) db.createObjectStore('identity', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'peerId' });
      };
      req.onsuccess = (e) => {
        if (settled) {
          e.target.result.close();
          return;
        }
        settled = true;
        this._db = e.target.result;
        this._db.onversionchange = () => {
          this._db.close();
          this._db = null;
        };
        resolve();
      };
      req.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error(`Could not open local key storage: ${req.error?.name || 'IndexedDB error'}`));
        }
      };
      req.onblocked = () => {
        if (!settled) {
          settled = true;
          reject(new Error('Local key storage is blocked by another open tab; close other Halonyx tabs and retry'));
        }
      };
    });
  }

  _tx(store, mode = 'readonly') {
    if (!this._db) throw new Error('Local key storage is not open');
    return this._db.transaction(store, mode).objectStore(store);
  }

  _get(store, key) {
    return new Promise((resolve, reject) => {
      const req = this._tx(store).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  _getAll(store) {
    return new Promise((resolve, reject) => {
      const req = this._tx(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  _write(stores, action) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(stores, 'readwrite');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Local key storage write failed'));
      tx.onabort = () => reject(tx.error || new Error('Local key storage write was aborted'));
      action(tx);
    });
  }

  async saveIdentity(identity) {
    const id = this._accountKey('self');
    await this._write('identity', (tx) => {
      tx.objectStore('identity').put({ ...identity, id, ownerUserId: this.userId });
      tx.objectStore('identity').put({ id: this._accountKey('identity-status'), version: 1 });
    });
  }

  async loadIdentity() {
    const saved = await this._get('identity', this._accountKey('self'));
    const marker = await this._get('identity', this._accountKey('identity-status'));
    if (marker && marker.version !== 1) throw new Error('Saved identity marker version is unsupported; local data was preserved');
    if (!saved && marker) {
      throw new Error('Saved encryption identity is missing; no replacement identity was generated and local data was preserved');
    }
    return saved;
  }

  async loadLegacyData() {
    const [identity, opkState, sessions] = await Promise.all([
      this._get('identity', 'self'),
      this._get('identity', 'opkState'),
      this._getAll('sessions'),
    ]);
    return {
      identity,
      opkState,
      sessions: sessions.filter((session) => !session.ownerUserId && !session.remotePeerId),
    };
  }

  async adoptLegacyData(validate) {
    if (!this.userId) throw new Error('Key storage is not bound to an account');
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(['identity', 'sessions'], 'readwrite');
      const identities = tx.objectStore('identity');
      const sessionsStore = tx.objectStore('sessions');
      let legacyIdentity;
      let targetIdentity;
      let targetMarker;
      let legacyOpk;
      let legacySessions;
      let completedReads = 0;
      const fail = (error) => {
        try { tx.abort(); } catch (_) {}
        reject(error);
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error('Legacy key migration failed; original local data was preserved'));
      tx.onabort = () => reject(tx.error || new Error('Legacy key migration was aborted; original local data was preserved'));

      const requests = [
        identities.get('self'),
        identities.get(this._accountKey('self')),
        identities.get(this._accountKey('identity-status')),
        identities.get('opkState'),
        sessionsStore.getAll(),
      ];
      const values = new Array(requests.length);
      requests.forEach((req, index) => {
        req.onsuccess = () => {
          values[index] = req.result ?? null;
          completedReads++;
          if (completedReads !== requests.length) return;
          [legacyIdentity, targetIdentity, targetMarker, legacyOpk, legacySessions] = values;
          try {
            if (!legacyIdentity) throw new Error('No legacy identity is available to adopt');
            if (legacyIdentity.ownerUserId) throw new Error('This legacy identity has already been associated with an account');
            if (targetIdentity || targetMarker) throw new Error('An account-scoped identity already exists; legacy data was not changed');
            const unscopedSessions = legacySessions.filter((session) => !session.ownerUserId && !session.remotePeerId);
            validate(legacyIdentity, legacyOpk, unscopedSessions);
            identities.put({ ...legacyIdentity, id: this._accountKey('self'), ownerUserId: this.userId });
            identities.put({ id: this._accountKey('identity-status'), version: 1 });
            identities.put({ ...legacyIdentity, ownerUserId: this.userId });
            if (legacyOpk && !legacyOpk.ownerUserId) {
              identities.put({ ...legacyOpk, id: this._accountKey('opkState'), ownerUserId: this.userId });
              identities.put({ ...legacyOpk, ownerUserId: this.userId });
            }
            for (const session of unscopedSessions) {
              sessionsStore.put({ ...session, peerId: this._sessionKey(session.peerId), remotePeerId: session.peerId, ownerUserId: this.userId });
              sessionsStore.put({ ...session, ownerUserId: this.userId });
            }
          } catch (error) {
            fail(error);
          }
        };
        req.onerror = () => fail(req.error || new Error('Could not read legacy local key data'));
      });
    });
  }

  async clearIdentity() {
    await this._write('identity', (tx) => {
      tx.objectStore('identity').delete(this._accountKey('self'));
      tx.objectStore('identity').delete(this._accountKey('identity-status'));
    });
  }

  async saveOpkState(opkState) {
    await this._write('identity', (tx) => {
      tx.objectStore('identity').put({ ...opkState, id: this._accountKey('opkState'), ownerUserId: this.userId });
    });
  }

  async loadOpkState() {
    return this._get('identity', this._accountKey('opkState'));
  }

  async saveSession(peerId, ratchetState) {
    const key = this._sessionKey(peerId);
    await this._write('sessions', (tx) => {
      tx.objectStore('sessions').put({ peerId: key, remotePeerId: peerId, ownerUserId: this.userId, ratchetState });
    });
  }

  async loadSession(peerId) {
    const record = await this._get('sessions', this._sessionKey(peerId));
    return record ? { peerId, ratchetState: record.ratchetState } : null;
  }

  async deleteSession(peerId) {
    await this._write('sessions', (tx) => tx.objectStore('sessions').delete(this._sessionKey(peerId)));
  }

  async loadAllSessions() {
    const sessions = await this._getAll('sessions');
    return sessions
      .filter((session) => session.ownerUserId === this.userId && typeof session.remotePeerId === 'string')
      .map(({ remotePeerId, ratchetState }) => ({ peerId: remotePeerId, ratchetState }));
  }

  async clearAll() {
    await new Promise((resolve, reject) => {
      const tx = this._db.transaction(['identity', 'sessions'], 'readwrite');
      const identityStore = tx.objectStore('identity');
      const sessionsStore = tx.objectStore('sessions');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Local key deletion failed'));
      tx.onabort = () => reject(tx.error || new Error('Local key deletion was aborted'));
      const identityRequest = identityStore.getAll();
      identityRequest.onsuccess = () => {
        for (const record of identityRequest.result || []) {
          if (record.ownerUserId === this.userId || record.id === this._accountKey('identity-status')) identityStore.delete(record.id);
        }
      };
      identityRequest.onerror = () => tx.abort();
      const sessionRequest = sessionsStore.getAll();
      sessionRequest.onsuccess = () => {
        for (const session of sessionRequest.result || []) {
          if (session.ownerUserId === this.userId) sessionsStore.delete(session.peerId);
        }
      };
      sessionRequest.onerror = () => tx.abort();
    });
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = IDBKeyStore;
else if (typeof window !== 'undefined') window.IDBKeyStore = IDBKeyStore;
