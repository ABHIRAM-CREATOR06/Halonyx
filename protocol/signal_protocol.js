/**
 * Signal Protocol - Main Protocol Coordinator
 * 
 * Central coordinator for the Signal Protocol implementation,
 * integrating X3DH key exchange, Double Ratchet encryption,
 * key management, and session state.
 */

class SignalProtocol {
  constructor(options = {}) {
    // Initialize cryptographic utilities
    this.crypto = options.crypto || new CryptoUtils();
    
    // Initialize components
    this.x3dh = options.x3dh || new X3DH(this.crypto);
    this.doubleRatchet = options.doubleRatchet || new DoubleRatchet(this.crypto);
    this.keyManager = options.keyManager || new KeyManager(this.crypto);
    this.sessionManager = options.sessionManager || new SessionManager(this.crypto);
    
    // Protocol state
    this.isInitialized = false;
    this.userId = null;
    this.localAddress = null;
  }

  /**
   * Initialize the protocol stack for a user
   * @param {string} userId - User's unique identifier
   * @returns {Object} Initialization result with keys
   */
  async initialize(userId) {
    if (this.isInitialized) {
      throw new Error('Protocol already initialized');
    }

    this.userId = userId;
    
    // Initialize key manager with new identity
    const keyData = await this.keyManager.initializeIdentity(userId);
    
    this.isInitialized = true;
    
    return {
      userId: userId,
      identityKey: keyData.identityKey,
      registrationId: keyData.registrationId,
      preKeyBundle: keyData.preKeyBundles
    };
  }

  /**
   * Generate a new pre-key bundle
   * @param {number} count - Number of one-time pre-keys
   * @returns {Object} New pre-key bundle
   */
  async generatePreKeyBundle(count = 100) {
    this._checkInitialized();
    return await this.keyManager.generatePreKeyBundle(count);
  }

  /**
   * Get the current pre-key bundle
   * @returns {Object} Current pre-key bundle
   */
  getPreKeyBundle() {
    this._checkInitialized();
    return this.keyManager.exportPublicKeys();
  }

  /**
   * Start a new session with a peer
   * @param {string} peerId - Peer's unique identifier
   * @param {Object} peerBundle - Peer's pre-key bundle
   * @returns {Object} Initial message to send to peer
   */
  async startSession(peerId, peerBundle) {
    this._checkInitialized();
    
    // Create session
    await this.sessionManager.createSession(peerId, peerBundle);
    
    // Get our key bundle
    const myKeyBundle = {
      identityKey: this.keyManager.getIdentityKeyPair().publicKey,
      ephemeralKeys: peerBundle.preKeys.map(pk => ({
        publicKey: pk.publicKey,
        privateKey: null // We don't have the private key for peer's pre-keys
      }))
    };
    
    // Initialize session with X3DH
    const result = await this.sessionManager.initializeSession(
      peerId,
      myKeyBundle,
      peerBundle
    );
    
    return result.messageToSend;
  }

  /**
   * Process an incoming session initialization message
   * @param {Object} message - Initial message from peer
   * @returns {Object} Response message and established session info
   */
  async processSessionInit(message) {
    this._checkInitialized();
    
    // Get our key bundle
    const myKeyBundle = this.keyManager.getIdentityKeyPair();
    
    // Process as responder
    const result = await this.sessionManager.processInitialMessage(
      message,
      myKeyBundle
    );
    
    return {
      response: result.responseMessage,
      peerId: result.session.peerId,
      sessionState: result.session
    };
  }

  /**
   * Accept a session response and finalize
   * @param {string} peerId - Peer's unique identifier
   * @param {Object} response - Response message from peer
   */
  async acceptSessionResponse(peerId, response) {
    this._checkInitialized();
    
    const session = this.sessionManager.getSession(peerId);
    if (!session) {
      throw new Error(`No session found for peer: ${peerId}`);
    }
    
    // Finalize the session
    session.state = 'ESTABLISHED';
    session.lastActivity = Date.now();
  }

  /**
   * Encrypt a message for a peer
   * @param {string} peerId - Peer's unique identifier
   * @param {Uint8Array|string} plaintext - Message to encrypt
   * @returns {Object} Encrypted message
   */
  async encrypt(peerId, plaintext) {
    this._checkInitialized();
    
    // Convert string to Uint8Array if needed
    const data = typeof plaintext === 'string' 
      ? new TextEncoder().encode(plaintext) 
      : plaintext;
    
    // Encrypt through session manager
    const encrypted = await this.sessionManager.encryptMessage(peerId, data);
    
    return encrypted;
  }

  /**
   * Decrypt a message from a peer
   * @param {string} peerId - Peer's unique identifier
   * @param {Object} message - Encrypted message
   * @returns {Uint8Array} Decrypted plaintext
   */
  async decrypt(peerId, message) {
    this._checkInitialized();
    
    const plaintext = await this.sessionManager.decryptMessage(peerId, message);
    
    return plaintext;
  }

  /**
   * Decrypt and decode a message from a peer
   * @param {string} peerId - Peer's unique identifier
   * @param {Object} message - Encrypted message
   * @returns {string} Decoded plaintext string
   */
  async decryptToString(peerId, message) {
    const plaintext = await this.decrypt(peerId, message);
    return new TextDecoder().decode(plaintext);
  }

  /**
   * Check if a session exists with a peer
   * @param {string} peerId - Peer's unique identifier
   * @returns {boolean} True if session exists
   */
  hasSession(peerId) {
    return this.sessionManager.hasSession(peerId);
  }

  /**
   * Get session information for a peer
   * @param {string} peerId - Peer's unique identifier
   * @returns {Object|null} Session information
   */
  getSessionInfo(peerId) {
    return this.sessionManager.getSession(peerId);
  }

  /**
   * Get all active sessions
   * @returns {Array} List of active sessions
   */
  getAllSessions() {
    return this.sessionManager.getAllSessions();
  }

  /**
   * Close a session with a peer
   * @param {string} peerId - Peer's unique identifier
   */
  closeSession(peerId) {
    this.sessionManager.closeSession(peerId);
  }

  /**
   * Close all sessions
   */
  closeAllSessions() {
    this.sessionManager.closeAllSessions();
  }

  /**
   * Get the identity fingerprint for verification
   * @returns {string} Hex-encoded fingerprint
   */
  async getIdentityFingerprint() {
    this._checkInitialized();
    return await this.keyManager.getIdentityFingerprint();
  }

  /**
   * Verify a peer's identity fingerprint
   * @param {string} peerId - Peer's unique identifier
   * @param {string} fingerprint - Expected fingerprint
   * @returns {boolean} True if fingerprints match
   */
  async verifyPeerFingerprint(peerId, fingerprint) {
    this._checkInitialized();
    
    const session = this.sessionManager.getSession(peerId);
    if (!session) {
      throw new Error(`No session found for peer: ${peerId}`);
    }
    
    if (!session.peerIdentityKey) {
      throw new Error('No peer identity key in session');
    }
    
    const peerFingerprint = await this.keyManager.getPublicKeyFingerprint(
      session.peerIdentityKey
    );
    
    return peerFingerprint === fingerprint;
  }

  /**
   * Get count of available pre-keys
   * @returns {number} Number of available pre-keys
   */
  getPreKeyCount() {
    return this.keyManager.getPreKeyCount();
  }

  /**
   * Check if pre-key rotation is needed
   * @param {number} threshold - Minimum pre-keys before rotation
   * @returns {boolean} True if rotation needed
   */
  needsPreKeyRotation(threshold = 20) {
    return this.keyManager.getPreKeyCount() < threshold;
  }

  /**
   * Rotate signed pre-key (for key update)
   * @returns {Object} New signed pre-key
   */
  async rotateSignedPreKey() {
    this._checkInitialized();
    return await this.keyManager.rotateSignedPreKey();
  }

  /**
   * Generate new one-time pre-keys
   * @param {number} count - Number of pre-keys to generate
   * @returns {Array} New pre-keys
   */
  async generateNewPreKeys(count = 100) {
    this._checkInitialized();
    return await this.keyManager.generateNewPreKeys(count);
  }

  /**
   * Serialize the protocol state for storage
   * @param {string} passphrase - Optional passphrase for encryption
   * @returns {Object} Serialized state
   */
  async serialize(passphrase = null) {
    this._checkInitialized();
    
    const keyState = await this.keyManager.serialize(passphrase);
    const sessions = [];
    
    for (const session of this.sessionManager.getAllSessions()) {
      sessions.push({
        peerId: session.peerId,
        state: this.sessionManager.getSessionState(session.peerId)
      });
    }
    
    return {
      userId: this.userId,
      isInitialized: this.isInitialized,
      keyState: keyState,
      sessions: sessions,
      serializedAt: Date.now()
    };
  }

  /**
   * Restore protocol state from storage
   * @param {Object} state - Serialized state
   * @param {string} passphrase - Optional passphrase for decryption
   */
  async restore(state, passphrase = null) {
    // Restore key manager state
    await this.keyManager.restore(state.keyState, passphrase);
    
    // Restore sessions
    for (const sessionData of state.sessions) {
      const dr = new DoubleRatchet(this.crypto);
      dr.restoreState(sessionData.state.doubleRatchetState);
      
      this.sessionManager.restoreSession(sessionData.state, dr);
    }
    
    this.userId = state.userId;
    this.isInitialized = state.isInitialized;
  }

  /**
   * Clear all local data (logout)
   */
  clear() {
    this.sessionManager.closeAllSessions();
    this.keyManager.clear();
    this.isInitialized = false;
    this.userId = null;
  }

  /**
   * Get protocol version information
   * @returns {Object} Version info
   */
  getVersion() {
    return {
      protocol: 'Signal',
      version: '1.0.0',
      implementation: 'Halonyx',
      features: [
        'X3DH key exchange',
        'Double Ratchet encryption',
        'Forward secrecy',
        'Future secrecy'
      ]
    };
  }

  /**
   * Check if protocol is initialized
   * @throws {Error} If not initialized
   */
  _checkInitialized() {
    if (!this.isInitialized) {
      throw new Error('Signal Protocol not initialized. Call initialize() first.');
    }
  }
}

// Export for Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SignalProtocol;
} else if (typeof window !== 'undefined') {
  window.SignalProtocol = SignalProtocol;
}
