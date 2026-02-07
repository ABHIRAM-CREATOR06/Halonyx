/**
 * Crypto Utilities - Cryptographic Primitives for Signal Protocol
 * 
 * Provides low-level cryptographic operations using Web Crypto API
 * for secure messaging implementation.
 */

class CryptoUtils {
  constructor() {
    this.algorithm = {
      name: 'AES-GCM',
      length: 256
    };
    this.hashAlgorithm = 'SHA-256';
  }

  /**
   * Generate cryptographically secure random bytes
   * @param {number} length - Number of bytes to generate
   * @returns {Uint8Array} Random bytes
   */
  generateRandomBytes(length) {
    const bytes = new Uint8Array(length);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      // Fallback for environments without Web Crypto API
      for (let i = 0; i < length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    return bytes;
  }

  /**
   * Generate a random encryption key
   * @param {number} length - Key length in bytes (default 32 for AES-256)
   * @returns {Uint8Array} Random key
   */
  generateKey(length = 32) {
    return this.generateRandomBytes(length);
  }

  /**
   * Generate a random nonce
   * @param {number} length - Nonce length in bytes (default 12 for GCM)
   * @returns {Uint8Array} Random nonce
   */
  generateNonce(length = 12) {
    return this.generateRandomBytes(length);
  }

  /**
   * Import a raw key for cryptographic operations
   * @param {Uint8Array} keyData - Raw key bytes
   * @param {string} algorithm - Algorithm name
   * @returns {CryptoKey} Imported key
   */
  async importKey(keyData, algorithm = this.algorithm.name) {
    return await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: algorithm },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Import a key for signing operations
   * @param {Uint8Array} keyData - Raw key bytes
   * @returns {CryptoKey} Signing key
   */
  async importSigningKey(keyData) {
    return await crypto.subtle.importKey(
      'raw',
      keyData,
      {
        name: 'HMAC',
        hash: { name: this.hashAlgorithm }
      },
      false,
      ['sign', 'verify']
    );
  }

  /**
   * Derive a key using HMAC-based key derivation
   * @param {Uint8Array} password - Password or master key
   * @param {Uint8Array} salt - Salt for key derivation
   * @param {number} iterations - Number of iterations
   * @param {number} length - Output key length
   * @returns {Uint8Array} Derived key
   */
  async deriveKey(password, salt, iterations = 100000, length = 32) {
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      password,
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: iterations,
        hash: this.hashAlgorithm
      },
      passwordKey,
      length * 8
    );

    return new Uint8Array(derivedBits);
  }

  /**
   * Encrypt data using AES-GCM
   * @param {Uint8Array} plaintext - Data to encrypt
   * @param {Uint8Array} key - Encryption key
   * @param {Uint8Array} nonce - Nonce (should be unique per encryption)
   * @param {Uint8Array} additionalData - Optional additional authenticated data
   * @returns {Object} Encrypted data with authentication tag
   */
  async encrypt(plaintext, key, nonce, additionalData = null) {
    const cryptoKey = await this.importKey(key);
    const options = {};

    if (additionalData) {
      options.additionalData = additionalData;
    }

    const encrypted = await crypto.subtle.encrypt(
      { ...this.algorithm, nonce: nonce, ...options },
      cryptoKey,
      plaintext
    );

    return new Uint8Array(encrypted);
  }

  /**
   * Decrypt data using AES-GCM
   * @param {Uint8Array} ciphertext - Encrypted data
   * @param {Uint8Array} key - Decryption key
   * @param {Uint8Array} nonce - Nonce used for encryption
   * @param {Uint8Array} additionalData - Optional additional authenticated data
   * @returns {Uint8Array} Decrypted plaintext
   */
  async decrypt(ciphertext, key, nonce, additionalData = null) {
    const cryptoKey = await this.importKey(key);
    const options = {};

    if (additionalData) {
      options.additionalData = additionalData;
    }

    const decrypted = await crypto.subtle.decrypt(
      { ...this.algorithm, nonce: nonce, ...options },
      cryptoKey,
      ciphertext
    );

    return new Uint8Array(decrypted);
  }

  /**
   * Compute HMAC signature
   * @param {Uint8Array} data - Data to sign
   * @param {Uint8Array} key - HMAC key
   * @returns {Uint8Array} HMAC signature
   */
  async sign(data, key) {
    const cryptoKey = await this.importSigningKey(key);
    const signature = await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      data
    );
    return new Uint8Array(signature);
  }

  /**
   * Verify HMAC signature
   * @param {Uint8Array} data - Data to verify
   * @param {Uint8Array} key - HMAC key
   * @param {Uint8Array} signature - Signature to verify
   * @returns {boolean} True if signature is valid
   */
  async verify(data, key, signature) {
    const cryptoKey = await this.importSigningKey(key);
    return await crypto.subtle.verify(
      'HMAC',
      cryptoKey,
      signature,
      data
    );
  }

  /**
   * Compute SHA-256 hash
   * @param {Uint8Array} data - Data to hash
   * @returns {Uint8Array} Hash output
   */
  async hash(data) {
    const hashBuffer = await crypto.subtle.digest(this.hashAlgorithm, data);
    return new Uint8Array(hashBuffer);
  }

  /**
   * Constant-time comparison to prevent timing attacks
   * @param {Uint8Array} a - First value
   * @param {Uint8Array} b - Second value
   * @returns {boolean} True if values are equal
   */
  constantTimeEquals(a, b) {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }

    return result === 0;
  }

  /**
   * Generate a key pair for identity
   * @returns {Object} Key pair with public and private keys
   */
  async generateIdentityKeyPair() {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'X25519'
      },
      false,
      ['deriveBits', 'deriveKey']
    );

    const exportedPublic = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    const exportedPrivate = await crypto.subtle.exportKey('raw', keyPair.privateKey);

    return {
      publicKey: new Uint8Array(exportedPublic),
      privateKey: new Uint8Array(exportedPrivate),
      keyPair: keyPair
    };
  }

  /**
   * Perform ECDH key agreement
   * @param {CryptoKey} privateKey - Private key
   * @param {Uint8Array} publicKey - Peer's public key
   * @returns {Uint8Array} Shared secret
   */
  async deriveBits(privateKey, publicKey) {
    // Import the peer's public key
    const importedPublicKey = await crypto.subtle.importKey(
      'raw',
      publicKey,
      {
        name: 'ECDH',
        namedCurve: 'X25519'
      },
      false,
      []
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'ECDH',
        public: importedPublicKey
      },
      privateKey,
      256
    );

    return new Uint8Array(derivedBits);
  }

  /**
   * Convert ArrayBuffer to Base64 string
   * @param {ArrayBuffer} buffer - Data to convert
   * @returns {string} Base64 encoded string
   */
  bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert Base64 string to Uint8Array
   * @param {string} base64 - Base64 encoded string
   * @returns {Uint8Array} Decoded data
   */
  base64ToBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Convert Uint8Array to hex string
   * @param {Uint8Array} bytes - Data to convert
   * @returns {string} Hex encoded string
   */
  toHexString(bytes) {
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Convert hex string to Uint8Array
   * @param {string} hex - Hex encoded string
   * @returns {Uint8Array} Decoded data
   */
  fromHexString(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  }

  /**
   * Concatenate multiple Uint8Arrays
   * @param {...Uint8Array} arrays - Arrays to concatenate
   * @returns {Uint8Array} Concatenated array
   */
  concatArrays(...arrays) {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;

    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }

    return result;
  }

  /**
   * Slice a Uint8Array
   * @param {Uint8Array} array - Source array
   * @param {number} start - Start index
   * @param {number} end - End index (exclusive)
   * @returns {Uint8Array} Sliced array
   */
  sliceArray(array, start, end) {
    return array.slice(start, end);
  }
}

// Export for Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CryptoUtils;
} else if (typeof window !== 'undefined') {
  window.CryptoUtils = CryptoUtils;
}
