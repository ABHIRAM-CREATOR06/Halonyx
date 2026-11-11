const test = require("node:test");
const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");

globalThis.crypto = webcrypto;
globalThis.btoa = globalThis.btoa || ((value) => Buffer.from(value, "binary").toString("base64"));
globalThis.atob = globalThis.atob || ((value) => Buffer.from(value, "base64").toString("binary"));

class FakeRequest {
  constructor() {
    this.result = undefined;
    this.error = null;
  }
}

let failPutAt = 0;

class FakeTransaction {
  constructor(database, names) {
    this.database = database;
    this.names = Array.isArray(names) ? names : [names];
    this.pending = 0;
    this.aborted = false;
    this.completed = false;
    this.putCount = 0;
    this.snapshots = new Map(this.names.map((name) => [name, new Map(Array.from(database.stores.get(name), ([key, value]) => [key, structuredClone(value)]))]));
  }

  objectStore(name) {
    assert.ok(this.names.includes(name), `store ${name} is in this transaction`);
    const records = this.database.stores.get(name);
    assert.ok(records, `store ${name} exists`);
    const requestFor = (operation) => {
      const request = new FakeRequest();
      this.pending++;
      setTimeout(() => {
        if (this.aborted) return;
        try {
          request.result = operation(records);
          request.onsuccess?.({ target: request });
        } catch (error) {
          request.error = error;
          request.onerror?.({ target: request });
          this.abort();
          return;
        }
        this.pending--;
        this.completeWhenIdle();
      }, 0);
      return request;
    };
    return {
      get: (key) => requestFor((store) => store.has(key) ? structuredClone(store.get(key)) : undefined),
      getAll: () => requestFor((store) => Array.from(store.values(), (value) => structuredClone(value))),
      put: (value) => requestFor((store) => {
        this.putCount++;
        if (failPutAt && this.putCount === failPutAt) {
          failPutAt = 0;
          const error = new Error("Synthetic quota exceeded");
          error.name = "QuotaExceededError";
          throw error;
        }
        const copy = structuredClone(value);
        const key = copy.id ?? copy.peerId;
        if (key === undefined) throw new Error("Missing key path");
        store.set(key, copy);
        return key;
      }),
      delete: (key) => requestFor((store) => store.delete(key)),
      clear: () => requestFor((store) => store.clear()),
    };
  }

  completeWhenIdle() {
    if (this.pending !== 0 || this.completed || this.aborted) return;
    setTimeout(() => {
      if (this.pending === 0 && !this.completed && !this.aborted) {
        this.completed = true;
        this.oncomplete?.({ target: this });
      }
    }, 0);
  }

  abort() {
    if (this.aborted || this.completed) return;
    this.aborted = true;
    for (const [name, snapshot] of this.snapshots) {
      const store = this.database.stores.get(name);
      store.clear();
      for (const [key, value] of snapshot) store.set(key, structuredClone(value));
    }
    this.onabort?.({ target: this });
  }
}

class FakeDatabase {
  constructor(name) {
    this.name = name;
    this.stores = new Map();
    this.objectStoreNames = { contains: (store) => this.stores.has(store) };
  }

  createObjectStore(name) {
    this.stores.set(name, new Map());
    return {};
  }

  transaction(names) {
    return new FakeTransaction(this, names);
  }

  close() {}
}

class FakeIndexedDB {
  constructor() {
    this.databases = new Map();
    this.blockNextOpen = false;
  }

  open(name, version) {
    const request = new FakeRequest();
    setTimeout(() => {
      if (this.blockNextOpen) {
        this.blockNextOpen = false;
        request.onblocked?.({ target: request });
        return;
      }
      let database = this.databases.get(name);
      const isNew = !database;
      if (!database) {
        database = new FakeDatabase(name);
        this.databases.set(name, database);
      }
      request.result = database;
      if (isNew) request.onupgradeneeded?.({ target: { result: database, oldVersion: 0, newVersion: version } });
      request.onsuccess?.({ target: request });
    }, 0);
    return request;
  }

  reset() {
    this.databases.clear();
    this.blockNextOpen = false;
  }
}

const fakeIndexedDB = new FakeIndexedDB();
globalThis.indexedDB = fakeIndexedDB;
globalThis.CryptoUtils = require("../protocol/crypto_utils");
globalThis.X3DH = require("../protocol/x3dh");
globalThis.IDBKeyStore = require("../protocol/idb_key_store");
globalThis.DoubleRatchet = require("../protocol/double_ratchet");
const IDBKeyStore = globalThis.IDBKeyStore;
const CryptoUtils = globalThis.CryptoUtils;
const X3DH = globalThis.X3DH;
const SignalProtocol = require("../protocol/signal_protocol");

function protocolFor(userId) {
  const protocol = new SignalProtocol();
  protocol.replenishPreKeysIfNecessary = async () => {};
  return protocol;
}

function successfulFetch() {
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => "" });
}

async function seedLegacy(identity, opkState = null, sessions = []) {
  const store = new IDBKeyStore();
  await store.open();
  await store._write(["identity", "sessions"], (tx) => {
    tx.objectStore("identity").put({ id: "self", ...identity });
    if (opkState) tx.objectStore("identity").put({ id: "opkState", ...opkState });
    for (const session of sessions) tx.objectStore("sessions").put(session);
  });
  return store;
}

test.beforeEach(() => {
  fakeIndexedDB.reset();
  failPutAt = 0;
  successfulFetch();
});

test("CryptoKey identity persists across store instances and is isolated per account", async (t) => {
  if (!webcrypto.subtle) return t.skip("Web Crypto is unavailable");
  const accountA = new IDBKeyStore("persistence-test");
  accountA.setUserId("account-a");
  await accountA.open();
  const identity = await new X3DH(new CryptoUtils()).generateKeyBundle();
  await accountA.saveIdentity(identity);

  const reopened = new IDBKeyStore("persistence-test");
  reopened.setUserId("account-a");
  await reopened.open();
  const restored = await reopened.loadIdentity();
  assert.deepEqual(restored.identityPublicBytes, identity.identityPublicBytes);
  assert.equal(restored.identityPrivateKey.type, "private");
  assert.equal(restored.identityPrivateKey.algorithm.name, "X25519");
  const peer = await new CryptoUtils().generateDhKeyPair();
  const shared = await new CryptoUtils().deriveBits(restored.identityPrivateKey, peer.publicKeyBytes);
  assert.equal(shared.length, 32);

  const otherAccount = new IDBKeyStore("persistence-test");
  otherAccount.setUserId("account-b");
  await otherAccount.open();
  assert.equal(await otherAccount.loadIdentity(), null);
});

test("legacy identity is adopted only after confirmation and remains isolated", async () => {
  const utils = new CryptoUtils();
  const identity = await new X3DH(utils).generateKeyBundle();
  const opk = await utils.generateDhKeyPair();
  const ratchetKey = await utils.generateDhKeyPair();
  const ratchetState = {
    version: 3,
    rootKey: new Uint8Array(32),
    sendingChainKey: new Uint8Array(32),
    receivingChainKey: null,
    dhPublicKeyBytes: ratchetKey.publicKeyBytes,
    dhPrivateKey: ratchetKey.privateKey,
    _lastPeerRatchetKey: null,
    _pendingRemoteKey: null,
  };
  const legacyOpk = { count: 1, keys: [{ id: 1, privateKey: opk.privateKey }], lastKeyId: 1 };
  await seedLegacy(identity, legacyOpk, [{ peerId: "peer-a", ratchetState }]);
  const previousWindow = globalThis.window;
  let confirmCount = 0;
  globalThis.window = { confirm: () => { confirmCount++; return true; } };

  const accountA = protocolFor("account-a");
  await accountA.init("account-a", "not-a-secret-test-token");
  assert.equal(confirmCount, 1);
  assert.deepEqual(accountA.identity.identityPublicBytes, identity.identityPublicBytes);
  assert.equal(accountA.sessions.has("peer-a"), true);
  assert.equal((await accountA.idb.loadOpkState()).count, 1);

  const accountB = protocolFor("account-b");
  await accountB.init("account-b", "not-a-secret-test-token");
  assert.equal(confirmCount, 1);
  assert.notDeepEqual(accountB.identity.identityPublicBytes, identity.identityPublicBytes);
  assert.equal(await accountB.idb.loadOpkState(), null);
  assert.equal(accountB.sessions.size, 0);

  await accountB.clear();
  const reopenedA = new IDBKeyStore();
  reopenedA.setUserId("account-a");
  await reopenedA.open();
  assert.deepEqual((await reopenedA.loadIdentity()).identityPublicBytes, identity.identityPublicBytes);
  assert.equal((await reopenedA.loadAllSessions()).length, 1);
  globalThis.window = previousWindow;
});

test("declined legacy adoption preserves the old record and does not generate a new identity", async () => {
  const identity = await new X3DH(new CryptoUtils()).generateKeyBundle();
  await seedLegacy(identity);
  const previousWindow = globalThis.window;
  globalThis.window = { confirm: () => false };
  const protocol = protocolFor("account-a");
  let generated = false;
  protocol.x3dh.generateKeyBundle = async () => { generated = true; throw new Error("unexpected generation"); };

  await assert.rejects(protocol.init("account-a", "test-token"), /not adopted/);
  assert.equal(generated, false);
  const legacy = await protocol.idb._get("identity", "self");
  assert.equal(legacy.ownerUserId, undefined);
  assert.equal(await protocol.idb._get("identity", "self:account-a"), null);
  globalThis.window = previousWindow;
});

test("consumed OPK state remains consumed after reopening the account store", async () => {
  const utils = new CryptoUtils();
  const protocol = protocolFor("account-a");
  protocol.userId = "account-a";
  protocol.idb.setUserId("account-a");
  await protocol.idb.open();
  protocol.identity = await new X3DH(utils).generateKeyBundle();
  const opk = await utils.generateDhKeyPair();
  await protocol.idb.saveOpkState({ count: 1, keys: [{ id: 7, privateKey: opk.privateKey }], lastKeyId: 7 });
  protocol.crypto.verifyEd25519 = async () => true;
  protocol.crypto.base64ToBuffer = () => new Uint8Array(32);
  protocol.x3dh.processInitialMessage = async () => ({ sharedSecret: new Uint8Array(32) });
  protocol.replenishPreKeysIfNecessary = async () => {};

  await protocol.acceptSession("peer-a", {
    senderIdentityPublic: "ignored",
    ephemeralPublic: "ignored",
    senderSpkPublic: "ignored",
    senderSpkSignature: "ignored",
    senderSigningPublic: "ignored",
    ratchetPublic: "ignored",
    opkId: 7,
  });

  const reopened = new IDBKeyStore();
  reopened.setUserId("account-a");
  await reopened.open();
  const saved = await reopened.loadOpkState();
  assert.equal(saved.count, 0);
  assert.deepEqual(saved.keys, []);
});

test("unsupported saved ratchet state fails without deleting the stored session", async () => {
  const protocol = protocolFor("account-a");
  await protocol.init("account-a", "test-token");
  await protocol.idb.saveSession("peer-a", { version: 999 });

  const reopened = protocolFor("account-a");
  await assert.rejects(reopened.init("account-a", "test-token"), /malformed or unsupported/);
  assert.equal((await reopened.idb.loadSession("peer-a")).ratchetState.version, 999);
});

test("malformed or missing saved identity fails without replacing stored data", async () => {
  const store = new IDBKeyStore();
  store.setUserId("account-a");
  await store.open();
  await store._write("identity", (tx) => {
    tx.objectStore("identity").put({ id: "self:account-a", ownerUserId: "account-a", identityPrivateKey: { type: "private" } });
    tx.objectStore("identity").put({ id: "identity-status:account-a", version: 1 });
  });
  const protocol = protocolFor("account-a");
  let generated = false;
  protocol.x3dh.generateKeyBundle = async () => { generated = true; throw new Error("unexpected generation"); };

  await assert.rejects(protocol.init("account-a", "test-token"), /malformed or incompatible/);
  assert.equal(generated, false);
  assert.ok(await store._get("identity", "self:account-a"));

  await store._write("identity", (tx) => {
    tx.objectStore("identity").delete("self:account-a");
  });
  await assert.rejects(protocol.init("account-a", "test-token"), /Saved encryption identity is missing/);
});

test("IndexedDB blocked state returns a recoverable error without deleting local records", async () => {
  fakeIndexedDB.blockNextOpen = true;
  const store = new IDBKeyStore();
  store.setUserId("account-a");
  await assert.rejects(store.open(), /blocked by another open tab/);
});

test("quota abort does not leave a partial identity or completion marker", async () => {
  const store = new IDBKeyStore("quota-test");
  store.setUserId("account-a");
  await store.open();
  const identity = await new X3DH(new CryptoUtils()).generateKeyBundle();
  failPutAt = 2;
  await assert.rejects(store.saveIdentity(identity), /aborted|failed/i);
  assert.equal(await store._get("identity", "self:account-a"), null);
  assert.equal(await store._get("identity", "identity-status:account-a"), null);
});

test("unavailable IndexedDB fails closed", async () => {
  const previous = globalThis.indexedDB;
  delete globalThis.indexedDB;
  const store = new IDBKeyStore();
  store.setUserId("account-a");
  await assert.rejects(store.open(), /IndexedDB is unavailable/);
  globalThis.indexedDB = previous;
});
