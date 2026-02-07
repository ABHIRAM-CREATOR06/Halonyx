/**
 * Key Management - Key Generation and Management
 * 
 * Handles generation, storage, and lifecycle management of cryptographic keys
 * for the Signal Protocol implementation.
 */

class KeyManager {
  constructor(cryptoUtils) {
    this.crypto = cryptoUtils || new CryptoUtils();
    this.identityKeyPair = null;
    this.registrationId = null;
    this.preKeyBundles = [];
    this.signedPreKeyPairs = [];
    this.sessionState = new Map();
  }

  /**
   * Initialize the key manager with a new identity
   * @param {string} userId - User identifier
   * @returns {Object} Initialized key data
   */
  async initializeIdentity(userId) {
    // Generate identity key pair
    this.identityKeyPair = await this.crypto.generateIdentityKeyPair();
    
    // Generate random registration ID
    this.registrationId = Math.floor(Math.random() * 0xFFFF);

    // Generate initial pre-key bundles
    const preKeyCount = 100;
    const bundle = await this.generatePreKeyBundle(preKeyCount);
    this.preKeyBundles = bundle.preKeys;

    return {
      userId: userId,
      identityKey: this.identityKeyPair.publicKey,
      registrationId: this.registrationId,
      preKeyBundles: bundle
    };
  }

  /**
   * Generate a pre-key bundle
   * @param {number} count - Number of one-time pre-keys to generate
   * @returns {Object} Pre-key bundle with signed pre-key
   */
  async generatePreKeyBundle(count = 100) {
    // Generate signed pre-key
    const signedPreKey = await this.crypto.generateIdentityKeyPair();
    
    // Sign the signed pre-key with identity key
    const signature = await this.crypto.sign(
      signedPreKey.publicKey,
      this.identityKeyPair.privateKey
    );

    // Generate one-time pre-keys
    const oneTimePreKeys = [];
    for (let i = 0; i < count; i++) {
      const ephemeralKey = await this.crypto.generateIdentityKeyPair();
      oneTimePreKeys.push({
        id: this.generateKeyId(),
        publicKey: ephemeralKey.publicKey,
        privateKey: ephemeralKey.privateKey // Store for local use
      });
    }

    // Store signed pre-key
    this.signedPreKeyPairs.push({
      id: this.generateKeyId(),
      publicKey: signedPreKey.publicKey,
      privateKey: signedPreKey.privateKey,
      signature: signature,
      created: Date.now()
    });

    return {
      registrationId: this.registrationId,
      identityKey: this.identityKeyPair.publicKey,
      signedPreKey: {
        id: this.signedPreKeyPairs[0].id,
        publicKey: signedPreKey.publicKey,
        signature: signature
      },
      preKeys: oneTimePreKeys.map(pk => ({
        id: pk.id,
        publicKey: pk.publicKey
      })),
      created: Date.now()
    };
  }

  /**
   * Generate a unique key ID
   * @returns {number} Unique key identifier
   */
  generateKeyId() {
    return Math.floor(Math.random() * 0xFFFFFF);
  }

  /**
   * Get a pre-key bundle for a peer
   * @param {number} preKeyId - Specific pre-key ID (optional)
   * @returns {Object|null} Pre-key bundle or null if none available
   */
  getPreKeyBundle(preKeyId = null) {
    if (this.preKeyBundles.length === 0) {
      return null;
    }

    if (preKeyId) {
      const index = this.preKeyBundles.findIndex(pk => pk.id === preKeyId);
      if (index !== -1) {
        const bundle = this.preKeyBundles[index];
        this.preKeyBundles.splice(index, 1); // Remove used pre-key
        return bundle;
      }
      return null;
    }

    // Return and remove first available pre-key
    const bundle = this.preKeyBundles.shift();
    return bundle;
  }

  /**
   * Store session state for a peer
   * @param {string} peerId - Peer's user ID
   * @param {Object} state - Session state to store
   */
  setSessionState(peerId, state) {
    this.sessionState.set(peerId, state);
  }

  /**
   * Get session state for a peer
   * @param {string} peerId - Peer's user ID
   * @returns {Object|null} Session state or null
   */
  getSessionState(peerId) {
    return this.sessionState.get(peerId) || null;
  }

  /**
   * Remove session state for a peer
   * @param {string} peerId - Peer's user ID
   */
  removeSessionState(peerId) {
    this.sessionState.delete(peerId);
  }

  /**
   * Get the current identity key pair
   * @returns {Object} Identity key pair
   */
  getIdentityKeyPair() {
    return this.identityKeyPair;
  }

  /**
   * Get the current registration ID
   * @returns {number} Registration ID
   */
  getRegistrationId() {
    return this.registrationId;
  }

  /**
   * Rotate signed pre-key
   * @returns {Object} New signed pre-key bundle
   */
  async rotateSignedPreKey() {
    const signedPreKey = await this.crypto.generateIdentityKeyPair();
    
    const signature = await this.crypto.sign(
      signedPreKey.publicKey,
      this.identityKeyPair.privateKey
    );

    this.signedPreKeyPairs.push({
      id: this.generateKeyId(),
      publicKey: signedPreKey.publicKey,
      privateKey: signedPreKey.privateKey,
      signature: signature,
      created: Date.now()
    });

    return {
      id: this.signedPreKeyPairs[this.signedPreKeyPairs.length - 1].id,
      publicKey: signedPreKey.publicKey,
      signature: signature
    };
  }

  /**
   * Generate new one-time pre-keys
   * @param {number} count - Number of pre-keys to generate
   * @returns {Array} New pre-key bundles
   */
  async generateNewPreKeys(count = 100) {
    const newPreKeys = [];
    
    for (let i = 0; i < count; i++) {
      const ephemeralKey = await this.crypto.generateIdentityKeyPair();
      const preKey = {
        id: this.generateKeyId(),
        publicKey: ephemeralKey.publicKey,
        privateKey: ephemeralKey.privateKey
      };
      
      this.preKeyBundles.push(preKey);
      newPreKeys.push({
        id: preKey.id,
        publicKey: preKey.publicKey
      });
    }

    return newPreKeys;
  }

  /**
   * Get count of available pre-keys
   * @returns {number} Number of available pre-keys
   */
  getPreKeyCount() {
    return this.preKeyBundles.length;
  }

  /**
   * Serialize key manager state for storage
   * @param {string} passphrase - Optional passphrase for encryption
   * @returns {Object} Serialized state
   */
  async serialize(passphrase = null) {
    const state = {
      registrationId: this.registrationId,
      identityKey: this.identityKeyPair ? this.crypto.bufferToBase64(this.identityKeyPair.publicKey) : null,
      // Note: Private keys should be encrypted or handled by secure storage
      signedPreKeyId: this.signedPreKeyPairs.length > 0 ? this.signedPreKeyPairs[this.signedPreKeyPairs.length - 1].id : null,
      preKeyCount: this.preKeyBundles.length,
      created: Date.now()
    };

    if (passphrase) {
      // Encrypt sensitive data
      const salt = this.crypto.generateRandomBytes(16);
      const encryptionKey = await this.crypto.deriveKey(
        new TextEncoder().encode(passphrase),
        salt,
        100000,
        32
      );

      // In production, private keys would be stored securely
      // This is a simplified serialization for demonstration
      state.encrypted = true;
    }

    return state;
  }

  /**
   * Restore key manager state from storage
   * @param {Object} state - Serialized state
   * @param {string} passphrase - Optional passphrase for decryption
   */
  async restore(state, passphrase = null) {
    this.registrationId = state.registrationId;
    
    if (state.identityKey) {
      // In production, private key would be retrieved from secure storage
      // This is a placeholder
      console.warn('Private key restoration requires secure storage implementation');
    }

    if (state.encrypted && passphrase) {
      // Decrypt sensitive data
      console.warn('Decryption not implemented - requires secure storage');
    }
  }

  /**
   * Clear all keys and state (for logout/account deletion)
   */
  clear() {
    this.identityKeyPair = null;
    this.registrationId = null;
    this.preKeyBundles = [];
    this.signedPreKeyPairs = [];
    this.sessionState.clear();
  }

  /**
   * Export public keys for sharing
   * @returns {Object} Public keys to share
   */
  exportPublicKeys() {
    return {
      identityKey: this.identityKeyPair ? this.identityKeyPair.publicKey : null,
      registrationId: this.registrationId,
      signedPreKey: this.signedPreKeyPairs.length > 0 ? {
        id: this.signedPreKeyPairs[0].id,
        publicKey: this.signedPreKeyPairs[0].publicKey,
        signature: this.signedPreKeyPairs[0].signature
      } : null,
      preKeyCount: this.preKeyBundles.length
    };
  }

  /**
   * Get fingerprint of identity key for verification
   * @returns {string} Hex-encoded fingerprint
   */
  async getIdentityFingerprint() {
    if (!this.identityKeyPair) {
      throw new Error('Identity not initialized');
    }

    const hash = await this.crypto.hash(this.identityKeyPair.publicKey);
    return this.crypto.toHexString(hash);
  }

  /**
   * Generate a local identity fingerprint
   * @param {Uint8Array} publicKey - Public key to create fingerprint for
   * @returns {string} Hex-encoded fingerprint
   */
  async getPublicKeyFingerprint(publicKey) {
    const hash = await this.crypto.hash(publicKey);
    return this.crypto.toHexString(hash);
  }
}

// Export for Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = KeyManager;
} else if (typeof window !== 'undefined') {
  window.KeyManager = KeyManager;
}
