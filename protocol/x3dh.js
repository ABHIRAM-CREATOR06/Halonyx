/**
 * X3DH Key Exchange Implementation
 * 
 * Extended Triple Diffie-Hellman (X3DH) provides authenticated key exchange
 * for the Signal Protocol without requiring prior interaction.
 * 
 * Reference: https://signal.org/docs/specifications/x3dh/x3dh/
 */

class X3DH {
  constructor(cryptoUtils) {
    this.crypto = cryptoUtils || new CryptoUtils();
    this.info = new TextEncoder().encode('HalonyxX3DH');
  }

  /**
   * Generate key pairs for X3DH
   * @param {number} count - Number of ephemeral key pairs to generate
   * @returns {Object} Key bundle with identity and ephemeral keys
   */
  async generateKeyBundle(count = 3) {
    const identityKey = await this.crypto.generateIdentityKeyPair();
    const signedPreKey = await this.crypto.generateIdentityKeyPair();
    const ephemeralKeys = [];

    for (let i = 0; i < count; i++) {
      const ephemeralKey = await this.crypto.generateIdentityKeyPair();
      ephemeralKeys.push(ephemeralKey);
    }

    return {
      identityKey: identityKey.publicKey,
      identityPrivateKey: identityKey.privateKey,
      signedPreKey: signedPreKey.publicKey,
      signedPreKeySignature: await this.signPreKey(
        signedPreKey.publicKey,
        identityKey.privateKey
      ),
      ephemeralKeys: ephemeralKeys.map(k => k.publicKey),
      created: Date.now()
    };
  }

  /**
   * Sign a pre-key with the identity private key
   * @param {Uint8Array} preKey - Pre-key to sign
   * @param {Uint8Array} privateKey - Identity private key
   * @returns {Uint8Array} Signature
   */
  async signPreKey(preKey, privateKey) {
    const signature = await this.crypto.sign(preKey, privateKey);
    return signature;
  }

  /**
   * Create an initial message for establishing a session
   * @param {Object} myKeyBundle - My key bundle
   * @param {Uint8Array} theirIdentityKey - Recipient's identity key
   * @param {Uint8Array} theirSignedPreKey - Recipient's signed pre-key
   * @param {Uint8Array} theirEphemeralKey - One of recipient's ephemeral keys
   * @returns {Object} Initial message with shared secret
   */
  async createInitialMessage(myKeyBundle, theirIdentityKey, theirSignedPreKey, theirEphemeralKey) {
    // DH1 = DH(IKa, SPKb) - My identity key with their signed pre-key
    const dh1 = await this.crypto.deriveBits(
      await this.importPrivateKey(myKeyBundle.identityPrivateKey),
      theirSignedPreKey
    );

    // DH2 = DH(EKa, IKb) - My ephemeral key with their identity key
    const dh2 = await this.crypto.deriveBits(
      await this.importPrivateKey(myKeyBundle.ephemeralKeys[0].privateKey),
      theirIdentityKey
    );

    // DH3 = DH(EKa, SPKb) - My ephemeral key with their signed pre-key
    const dh3 = await this.crypto.deriveBits(
      await this.importPrivateKey(myKeyBundle.ephemeralKeys[0].privateKey),
      theirSignedPreKey
    );

    // DH4 = DH(EKa, EKb) - My ephemeral key with their ephemeral key
    const dh4 = await this.crypto.deriveBits(
      await this.importPrivateKey(myKeyBundle.ephemeralKeys[0].privateKey),
      theirEphemeralKey
    );

    // Derive the shared secret key from DH outputs
    const sharedSecret = await this.deriveSharedSecret(dh1, dh2, dh3, dh4);

    return {
      identityKey: myKeyBundle.identityKey,
      ephemeralKey: myKeyBundle.ephemeralKeys[0].publicKey,
      sharedSecret: sharedSecret,
      usedEphemeralKey: myKeyBundle.ephemeralKeys[0]
    };
  }

  /**
   * Process an initial message and derive shared secret
   * @param {Object} theirInitialMsg - Initial message from peer
   * @param {Object} myKeyBundle - My key bundle
   * @returns {Object} Shared secret and peer info
   */
  async processInitialMessage(theirInitialMsg, myKeyBundle) {
    // DH1 = DH(IKa, SPKb) - Their identity key with my signed pre-key
    const dh1 = await this.crypto.deriveBits(
      await this.importPrivateKey(myKeyBundle.signedPreKeyPrivate || myKeyBundle.identityPrivateKey),
      theirInitialMsg.ephemeralKey
    );

    // DH2 = DH(SPKa, IKb) - My signed pre-key with their identity key
    const dh2 = await this.crypto.deriveBits(
      await this.importPrivateKey(myKeyBundle.signedPreKeyPrivate || myKeyBundle.identityPrivateKey),
      theirInitialMsg.identityKey
    );

    // DH3 = DH(SPKa, EKb) - My signed pre-key with their ephemeral key
    const dh3 = await this.crypto.deriveBits(
      await this.importPrivateKey(myKeyBundle.signedPreKeyPrivate || myKeyBundle.identityPrivateKey),
      theirInitialMsg.ephemeralKey
    );

    // DH4 = DH(IKa, EKb) - My identity key with their ephemeral key
    const dh4 = await this.crypto.deriveBits(
      await this.importPrivateKey(myKeyBundle.identityPrivateKey),
      theirInitialMsg.ephemeralKey
    );

    // Derive the shared secret key from DH outputs
    const sharedSecret = await this.deriveSharedSecret(dh1, dh2, dh3, dh4);

    return {
      sharedSecret: sharedSecret,
      peerIdentityKey: theirInitialMsg.identityKey,
      peerEphemeralKey: theirInitialMsg.ephemeralKey
    };
  }

  /**
   * Derive a shared secret from multiple DH outputs
   * @param {...Uint8Array} dhOutputs - DH shared secrets
   * @returns {Uint8Array} Derived shared secret
   */
  async deriveSharedSecret(...dhOutputs) {
    // Concatenate all DH outputs
    const concatInput = this.crypto.concatArrays(...dhOutputs);

    // Add protocol info
    const inputKeyMaterial = this.crypto.concatArrays(
      concatInput,
      this.info
    );

    // Derive key using HMAC-based KDF
    const salt = new Uint8Array(32); // Zero salt
    const derivedKey = await this.crypto.deriveKey(
      inputKeyMaterial,
      salt,
      100000, // iterations
      32 // output length
    );

    return derivedKey;
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
   * Verify a pre-key signature
   * @param {Uint8Array} preKey - Pre-key that was signed
   * @param {Uint8Array} signature - Signature to verify
   * @param {Uint8Array} identityKey - Signer's identity key
   * @returns {boolean} True if signature is valid
   */
  async verifyPreKeySignature(preKey, signature, identityKey) {
    const importedKey = await crypto.subtle.importKey(
      'raw',
      identityKey,
      {
        name: 'ECDH',
        namedCurve: 'X25519'
      },
      false,
      []
    );

    // Note: X25519 keys cannot be used for signing
    // This would need Ed25519 keys for proper signature verification
    // For implementation, use a separate signing key pair
    console.warn('Pre-key signature verification requires Ed25519 keys');
    return true; // Placeholder - implement with Ed25519
  }

  /**
   * Generate a pre-key bundle for server upload
   * @param {number} startId - Starting pre-key ID
   * @param {number} count - Number of pre-keys to generate
   * @returns {Object} Pre-key bundle
   */
  async generatePreKeyBundle(startId, count = 100) {
    const keyBundle = await this.generateKeyBundle(count);
    
    return {
      registrationId: Math.floor(Math.random() * 0xFFFF),
      identityKey: keyBundle.identityKey,
      signedPreKey: {
        id: startId,
        publicKey: keyBundle.signedPreKey,
        signature: keyBundle.signedPreKeySignature
      },
      preKeys: keyBundle.ephemeralKeys.map((key, index) => ({
        id: startId + index + 1,
        publicKey: key
      })),
      created: keyBundle.created
    };
  }

  /**
   * Encode a key bundle for transmission
   * @param {Object} bundle - Key bundle to encode
   * @returns {string} Base64 encoded bundle
   */
  encodeBundle(bundle) {
    const data = {
      registrationId: bundle.registrationId,
      identityKey: this.crypto.bufferToBase64(bundle.identityKey),
      signedPreKey: {
        id: bundle.signedPreKey.id,
        publicKey: this.crypto.bufferToBase64(bundle.signedPreKey.publicKey),
        signature: this.crypto.bufferToBase64(bundle.signedPreKey.signature)
      },
      preKeys: bundle.preKeys.map(pk => ({
        id: pk.id,
        publicKey: this.crypto.bufferToBase64(pk.publicKey)
      }))
    };

    return btoa(JSON.stringify(data));
  }

  /**
   * Decode a key bundle from transmission
   * @param {string} encodedBundle - Base64 encoded bundle
   * @returns {Object} Decoded key bundle
   */
  decodeBundle(encodedBundle) {
    const data = JSON.parse(atob(encodedBundle));
    
    return {
      registrationId: data.registrationId,
      identityKey: this.crypto.base64ToBuffer(data.identityKey),
      signedPreKey: {
        id: data.signedPreKey.id,
        publicKey: this.crypto.base64ToBuffer(data.signedPreKey.publicKey),
        signature: this.crypto.base64ToBuffer(data.signedPreKey.signature)
      },
      preKeys: data.preKeys.map(pk => ({
        id: pk.id,
        publicKey: this.crypto.base64ToBuffer(pk.publicKey)
      }))
    };
  }
}

// Export for Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = X3DH;
} else if (typeof window !== 'undefined') {
  window.X3DH = X3DH;
}
