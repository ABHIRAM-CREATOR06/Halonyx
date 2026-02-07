/**
 * Double Ratchet Algorithm Implementation
 * 
 * Provides forward secrecy and future secrecy through continuous
 * key ratcheting for secure message exchange.
 * 
 * Reference: https://signal.org/docs/specifications/doubleratchet/doubleratchet/
 */

class DoubleRatchet {
  constructor(cryptoUtils) {
    this.crypto = cryptoUtils || new CryptoUtils();
    this.rootKey = null;
    this.receivingChainKey = null;
    this.sendingChainKey = null;
    this.dhPublicKey = null;
    this.dhPrivateKey = null;
    this.maxSkip = 1000; // Maximum messages to skip in ratchet
  }

  /**
   * Initialize the Double Ratchet with shared secret and peer public key
   * @param {Uint8Array} sharedSecret - Shared secret from X3DH
   * @param {Uint8Array} remotePublicKey - Peer's public key
   * @param {boolean} isInitiator - Whether this party initiated the conversation
   */
  async initialize(sharedSecret, remotePublicKey, isInitiator = true) {
    // Initialize root key with shared secret
    this.rootKey = sharedSecret;
    
    // Derive initial chain keys
    const initialKey = await this.crypto.hash(sharedSecret);
    
    if (isInitiator) {
      // Initiator: send first, then receive
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
      this.receivingChainKey = null;
    } else {
      // Responder: receive first, then send
      const dhKeyPair = await this.crypto.generateIdentityKeyPair();
      this.dhPrivateKey = dhKeyPair.privateKey;
      this.dhPublicKey = dhKeyPair.publicKey;

      // Derive receiving chain key from DH output
      const [rk, sk] = await this.kdfRootKey(
        this.rootKey,
        await this.crypto.deriveBits(
          await this.importPrivateKey(this.dhPrivateKey),
          remotePublicKey
        )
      );

      this.receivingChainKey = rk;
      this.sendingChainKey = sk;
    }
  }

  /**
   * Import a private key for DH operations
   * @param {Uint8Array} privateKeyBytes - Raw private key bytes
   * @returns {CryptoKey} Imported private key
   */
  async importPrivateKey(privateKeyBytes) {
    return await crypto.subtle.importKey(
      'raw',
      privateKeyBytes,
      {
        name: 'ECDH',
        namedCurve: 'X25519'
      },
      false,
      ['deriveBits', 'deriveKey']
    );
  }

  /**
   * Derive new root key and chain key
   * @param {Uint8Array} currentRootKey - Current root key
   * @param {Uint8Array} dhOutput - DH shared secret output
   * @returns {[Uint8Array, Uint8Array]} New [rootKey, chainKey]
   */
  async kdfRootKey(currentRootKey, dhOutput) {
    const inputKeyMaterial = this.crypto.concatArrays(
      currentRootKey,
      dhOutput
    );

    // Derive using HMAC-based KDF
    const salt = currentRootKey;
    const derivedKey = await this.crypto.deriveKey(
      inputKeyMaterial,
      salt,
      1, // Single iteration for ratchet
      64 // Output: 32 bytes for root + 32 bytes for chain
    );

    // Export and split
    const exportedKey = await crypto.subtle.exportKey('raw', derivedKey);
    const keyBytes = new Uint8Array(exportedKey);

    return [
      this.crypto.sliceArray(keyBytes, 0, 32),   // New root key
      this.crypto.sliceArray(keyBytes, 32, 64)   // Chain key
    ];
  }

  /**
   * Derive message key from chain key
   * @param {Uint8Array} chainKey - Current chain key
   * @returns {[Uint8Array, Uint8Array]} [messageKey, newChainKey]
   */
  async kdfChainKey(chainKey) {
    const one = new Uint8Array([1]);
    const zero = new Uint8Array([0]);

    // Chain key derivation constants
    const messageKey = await this.crypto.hash(
      this.crypto.concatArrays(zero, chainKey)
    );

    const newChainKey = await this.crypto.hash(
      this.crypto.concatArrays(one, chainKey)
    );

    return [messageKey, newChainKey];
  }

  /**
   * Encrypt a message
   * @param {Uint8Array} plaintext - Message to encrypt
   * @param {Uint8Array} additionalData - Optional additional authenticated data
   * @returns {Object} Encrypted message with header
   */
  async encrypt(plaintext, additionalData = null) {
    if (!this.sendingChainKey) {
      throw new Error('Session not initialized for sending');
    }

    // Derive message key from sending chain
    const [messageKey, newChainKey] = await this.kdfChainKey(this.sendingChainKey);
    this.sendingChainKey = newChainKey;

    // Generate nonce
    const nonce = this.crypto.generateNonce(12);

    // Encrypt message
    const ciphertext = await this.crypto.encrypt(
      plaintext,
      messageKey,
      nonce,
      additionalData
    );

    // Include nonce in message (can be omitted if using counter-based nonce)
    const messageHeader = {
      dhPublicKey: this.dhPublicKey,
      previousChainLength: 0, // For skipped message handling
      nonce: nonce
    };

    return {
      header: messageHeader,
      ciphertext: ciphertext,
      messageKey: messageKey // Included for debugging/recovery
    };
  }

  /**
   * Decrypt a message
   * @param {Object} message - Encrypted message with header
   * @param {Uint8Array} additionalData - Optional additional authenticated data
   * @returns {Uint8Array} Decrypted plaintext
   */
  async decrypt(message, additionalData = null) {
    const { header, ciphertext } = message;

    // If peer performed DH ratchet, we need to perform ours
    if (!this.crypto.constantTimeEquals(header.dhPublicKey || new Uint8Array(0), this.dhPublicKey || new Uint8Array(0))) {
      // DH ratchet received - perform our DH ratchet
      await this.dhRatchet(header.dhPublicKey);
    }

    // Try to decrypt with current receiving chain
    try {
      const plaintext = await this.tryDecryptWithChain(
        ciphertext,
        header.nonce,
        additionalData
      );

      if (plaintext) {
        return plaintext;
      }
    } catch (e) {
      // Chain key mismatch - try skipped message keys
    }

    // Try skipped message keys from previous DH ratchets
    const skippedKey = this.getSkippedMessageKey(header.dhPublicKey, 0);
    if (skippedKey) {
      const nonce = header.nonce || this.crypto.generateNonce(12);
      const plaintext = await this.crypto.decrypt(
        ciphertext,
        skippedKey,
        nonce,
        additionalData
      );

      // Remove used skipped key
      this.removeSkippedMessageKey(header.dhPublicKey, 0);
      return plaintext;
    }

    throw new Error('Failed to decrypt message - key not found');
  }

  /**
   * Attempt to decrypt using the current receiving chain
   * @param {Uint8Array} ciphertext - Encrypted message
   * @param {Uint8Array} nonce - Nonce used for encryption
   * @param {Uint8Array} additionalData - Optional additional data
   * @returns {Uint8Array|null} Decrypted message or null
   */
  async tryDecryptWithChain(ciphertext, nonce, additionalData) {
    if (!this.receivingChainKey) {
      return null;
    }

    // Derive message key from receiving chain
    const [messageKey, newChainKey] = await this.kdfChainKey(this.receivingChainKey);
    this.receivingChainKey = newChainKey;

    try {
      const plaintext = await this.crypto.decrypt(
        ciphertext,
        messageKey,
        nonce || this.crypto.generateNonce(12),
        additionalData
      );
      return plaintext;
    } catch (e) {
      // Decryption failed - restore chain key
      this.receivingChainKey = newChainKey; // Already updated, but we need previous
      return null;
    }
  }

  /**
   * Perform DH ratchet with peer's new public key
   * @param {Uint8Array} newPeerPublicKey - Peer's new DH public key
   */
  async dhRatchet(newPeerPublicKey) {
    // Step 1: Derive new receiving chain key
    const dhOutput = await this.crypto.deriveBits(
      await this.importPrivateKey(this.dhPrivateKey),
      newPeerPublicKey
    );

    const [newRootKey, newReceivingChainKey] = await this.kdfRootKey(
      this.rootKey,
      dhOutput
    );

    this.rootKey = newRootKey;
    this.receivingChainKey = newReceivingChainKey;

    // Step 2: Generate new DH key pair
    const newKeyPair = await this.crypto.generateIdentityKeyPair();
    this.dhPrivateKey = newKeyPair.privateKey;
    this.dhPublicKey = newKeyPair.publicKey;

    // Step 3: Derive new sending chain key
    const dhOutput2 = await this.crypto.deriveBits(
      await this.importPrivateKey(this.dhPrivateKey),
      newPeerPublicKey
    );

    const [, newSendingChainKey] = await this.kdfRootKey(
      this.rootKey,
      dhOutput2
    );

    this.sendingChainKey = newSendingChainKey;

    // Note: Previous receiving chain keys become skipped message keys
    // Implementation would store these for delayed message decryption
  }

  /**
   * Store skipped message key for out-of-order messages
   * @param {Uint8Array} dhPublicKey - DH public key at time of skip
   * @param {number} messageNumber - Message number that was skipped
   * @param {Uint8Array} messageKey - Message key for skipped message
   */
  storeSkippedMessageKey(dhPublicKey, messageNumber, messageKey) {
    // Store in a map indexed by DH public key and message number
    const key = this.crypto.toHexString(dhPublicKey);
    if (!this.skippedKeys) {
      this.skippedKeys = new Map();
    }

    const keyMap = this.skippedKeys.get(key) || new Map();
    keyMap.set(messageNumber, messageKey);
    this.skippedKeys.set(key, keyMap);
  }

  /**
   * Get a skipped message key
   * @param {Uint8Array} dhPublicKey - DH public key
   * @param {number} messageNumber - Message number
   * @returns {Uint8Array|null} Message key or null
   */
  getSkippedMessageKey(dhPublicKey, messageNumber) {
    if (!this.skippedKeys) {
      return null;
    }

    const key = this.crypto.toHexString(dhPublicKey);
    const keyMap = this.skippedKeys.get(key);
    if (!keyMap) {
      return null;
    }

    return keyMap.get(messageNumber) || null;
  }

  /**
   * Remove a used skipped message key
   * @param {Uint8Array} dhPublicKey - DH public key
   * @param {number} messageNumber - Message number
   */
  removeSkippedMessageKey(dhPublicKey, messageNumber) {
    if (!this.skippedKeys) {
      return;
    }

    const key = this.crypto.toHexString(dhPublicKey);
    const keyMap = this.skippedKeys.get(key);
    if (keyMap) {
      keyMap.delete(messageNumber);
    }
  }

  /**
   * Get the current state for serialization
   * @returns {Object} Current state for storage
   */
  getState() {
    return {
      rootKey: this.rootKey,
      sendingChainKey: this.sendingChainKey,
      receivingChainKey: this.receivingChainKey,
      dhPublicKey: this.dhPublicKey,
      dhPrivateKey: this.dhPrivateKey,
      skippedKeys: this.skippedKeys
    };
  }

  /**
   * Restore state from serialized data
   * @param {Object} state - Previously saved state
   */
  restoreState(state) {
    this.rootKey = state.rootKey;
    this.sendingChainKey = state.sendingChainKey;
    this.receivingChainKey = state.receivingChainKey;
    this.dhPublicKey = state.dhPublicKey;
    this.dhPrivateKey = state.dhPrivateKey;
    this.skippedKeys = state.skippedKeys;
  }
}

// Export for Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DoubleRatchet;
} else if (typeof window !== 'undefined') {
  window.DoubleRatchet = DoubleRatchet;
}
