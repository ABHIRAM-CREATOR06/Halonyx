/**
 * Session Management - Session State Management
 * 
 * Manages the state and lifecycle of Signal Protocol sessions
 * between two parties.
 */

class SessionManager {
  constructor(cryptoUtils) {
    this.crypto = cryptoUtils || new CryptoUtils();
    this.sessions = new Map(); // Map of peerId -> session state
    this.pendingSessions = new Map(); // Map of pending session data
  }

  /**
   * Create a new session with a peer
   * @param {string} peerId - Peer's unique identifier
   * @param {Object} peerBundle - Peer's pre-key bundle
   * @returns {Object} Session creation result
   */
  async createSession(peerId, peerBundle) {
    if (this.sessions.has(peerId)) {
      throw new Error(`Session already exists for peer: ${peerId}`);
    }

    const session = {
      peerId: peerId,
      registrationId: peerBundle.registrationId,
      isInitiator: true,
      state: 'CREATING',
      created: Date.now(),
      lastActivity: Date.now(),
      messageCount: 0,
      peerIdentityKey: peerBundle.identityKey,
      peerSignedPreKey: peerBundle.signedPreKey?.publicKey,
      peerEphemeralKey: null,
      localEphemeralKey: null,
      sharedSecret: null,
      doubleRatchet: null
    };

    this.sessions.set(peerId, session);
    return session;
  }

  /**
   * Initialize session with peer's pre-key bundle
   * @param {string} peerId - Peer's unique identifier
   * @param {Object} myKeyBundle - My key bundle
   * @param {Object} peerBundle - Peer's pre-key bundle
   * @returns {Object} Initial message for peer
   */
  async initializeSession(peerId, myKeyBundle, peerBundle) {
    const session = this.sessions.get(peerId);
    if (!session) {
      throw new Error(`No session found for peer: ${peerId}`);
    }

    // Select a pre-key from peer's bundle
    const preKey = peerBundle.preKeys[0];
    if (!preKey) {
      throw new Error('No pre-keys available in peer bundle');
    }

    // Perform X3DH key exchange
    const x3dh = new X3DH(this.crypto);
    
    const initialMessage = await x3dh.createInitialMessage(
      myKeyBundle,
      peerBundle.identityKey,
      peerBundle.signedPreKey.publicKey,
      preKey.publicKey
    );

    // Initialize Double Ratchet
    const dr = new DoubleRatchet(this.crypto);
    await dr.initialize(
      initialMessage.sharedSecret,
      peerBundle.identityKey,
      true
    );

    // Update session state
    session.state = 'INITIALIZED';
    session.doubleRatchet = dr;
    session.peerIdentityKey = peerBundle.identityKey;
    session.peerSignedPreKey = peerBundle.signedPreKey.publicKey;
    session.peerEphemeralKey = initialMessage.ephemeralKey;
    session.localEphemeralKey = initialMessage.usedEphemeralKey;
    session.sharedSecret = initialMessage.sharedSecret;
    session.usedPreKeyId = preKey.id;

    return {
      session: session,
      messageToSend: {
        type: 'INITIAL',
        identityKey: initialMessage.identityKey,
        ephemeralKey: initialMessage.ephemeralKey,
        preKeyId: preKey.id,
        sharedSecret: initialMessage.sharedSecret
      }
    };
  }

  /**
   * Process an initial message from a peer
   * @param {Object} message - Initial message from peer
   * @param {Object} myKeyBundle - My key bundle
   * @returns {Object} Response message and session
   */
  async processInitialMessage(message, myKeyBundle) {
    // Create pending session
    const pendingId = this.crypto.toHexString(message.identityKey);
    
    const pendingSession = {
      peerIdentityKey: message.identityKey,
      peerEphemeralKey: message.ephemeralKey,
      receivedAt: Date.now()
    };

    this.pendingSessions.set(pendingId, pendingSession);

    // Perform X3DH as responder
    const x3dh = new X3DH(this.crypto);
    
    const result = await x3dh.processInitialMessage(
      message,
      myKeyBundle
    );

    // Create session for this peer
    const peerId = this.crypto.toHexString(message.identityKey);
    const session = {
      peerId: peerId,
      registrationId: myKeyBundle.registrationId,
      isInitiator: false,
      state: 'RESPONDING',
      created: Date.now(),
      lastActivity: Date.now(),
      messageCount: 0,
      peerIdentityKey: message.identityKey,
      peerEphemeralKey: message.ephemeralKey,
      sharedSecret: result.sharedSecret,
      doubleRatchet: null
    };

    // Initialize Double Ratchet
    const dr = new DoubleRatchet(this.crypto);
    await dr.initialize(
      result.sharedSecret,
      message.identityKey,
      false
    );

    session.doubleRatchet = dr;
    this.sessions.set(peerId, session);

    // Remove from pending
    this.pendingSessions.delete(pendingId);

    return {
      session: session,
      responseMessage: {
        type: 'RESPONSE',
        identityKey: myKeyBundle.identityKey,
        ephemeralKey: dr.dhPublicKey,
        sharedSecret: result.sharedSecret
      }
    };
  }

  /**
   * Encrypt a message for a peer
   * @param {string} peerId - Peer's unique identifier
   * @param {Uint8Array} plaintext - Message to encrypt
   * @returns {Object} Encrypted message
   */
  async encryptMessage(peerId, plaintext) {
    const session = this.sessions.get(peerId);
    if (!session) {
      throw new Error(`No session found for peer: ${peerId}`);
    }

    if (!session.doubleRatchet) {
      throw new Error('Session not initialized');
    }

    // Encrypt using Double Ratchet
    const result = await session.doubleRatchet.encrypt(plaintext);

    // Update session state
    session.messageCount++;
    session.lastActivity = Date.now();

    return {
      type: 'MESSAGE',
      peerId: peerId,
      header: {
        dhPublicKey: result.header.dhPublicKey,
        previousChainLength: result.header.previousChainLength,
        nonce: result.header.nonce
      },
      ciphertext: result.ciphertext,
      messageNumber: session.messageCount
    };
  }

  /**
   * Decrypt a message from a peer
   * @param {string} peerId - Peer's unique identifier
   * @param {Object} message - Encrypted message
   * @returns {Uint8Array} Decrypted plaintext
   */
  async decryptMessage(peerId, message) {
    let session = this.sessions.get(peerId);
    
    // If no session, try to find pending session by peer key
    if (!session) {
      const pendingId = this.crypto.toHexString(message.header.dhPublicKey);
      session = this.sessions.get(pendingId);
      
      if (session) {
        // Update peerId reference
        this.sessions.delete(pendingId);
        this.sessions.set(peerId, session);
        session.peerId = peerId;
      }
    }

    if (!session) {
      throw new Error(`No session found for peer: ${peerId}`);
    }

    if (!session.doubleRatchet) {
      throw new Error('Session not initialized');
    }

    // Decrypt using Double Ratchet
    const plaintext = await session.doubleRatchet.decrypt(message);

    // Update session state
    session.messageCount++;
    session.lastActivity = Date.now();

    return plaintext;
  }

  /**
   * Get an existing session
   * @param {string} peerId - Peer's unique identifier
   * @returns {Object|null} Session or null
   */
  getSession(peerId) {
    return this.sessions.get(peerId) || null;
  }

  /**
   * Check if a session exists
   * @param {string} peerId - Peer's unique identifier
   * @returns {boolean} True if session exists
   */
  hasSession(peerId) {
    return this.sessions.has(peerId);
  }

  /**
   * Close and remove a session
   * @param {string} peerId - Peer's unique identifier
   */
  closeSession(peerId) {
    const session = this.sessions.get(peerId);
    if (session) {
      // Clear sensitive data
      session.doubleRatchet = null;
      session.sharedSecret = null;
      this.sessions.delete(peerId);
    }
  }

  /**
   * Close all sessions
   */
  closeAllSessions() {
    for (const peerId of this.sessions.keys()) {
      this.closeSession(peerId);
    }
  }

  /**
   * Get all active sessions
   * @returns {Array} List of active sessions
   */
  getAllSessions() {
    const sessions = [];
    for (const [peerId, session] of this.sessions) {
      sessions.push({
        peerId: peerId,
        isInitiator: session.isInitiator,
        state: session.state,
        created: session.created,
        lastActivity: session.lastActivity,
        messageCount: session.messageCount
      });
    }
    return sessions;
  }

  /**
   * Get session state for persistence
   * @param {string} peerId - Peer's unique identifier
   * @returns {Object|null} Serializable session state
   */
  getSessionState(peerId) {
    const session = this.sessions.get(peerId);
    if (!session) {
      return null;
    }

    return {
      peerId: session.peerId,
      registrationId: session.registrationId,
      isInitiator: session.isInitiator,
      state: session.state,
      created: session.created,
      lastActivity: session.lastActivity,
      messageCount: session.messageCount,
      peerIdentityKey: session.peerIdentityKey ? this.crypto.bufferToBase64(session.peerIdentityKey) : null,
      peerSignedPreKey: session.peerSignedPreKey ? this.crypto.bufferToBase64(session.peerSignedPreKey) : null,
      peerEphemeralKey: session.peerEphemeralKey ? this.crypto.bufferToBase64(session.peerEphemeralKey) : null,
      doubleRatchetState: session.doubleRatchet ? session.doubleRatchet.getState() : null
    };
  }

  /**
   * Restore a session from persisted state
   * @param {Object} state - Persisted session state
   * @param {DoubleRatchet} doubleRatchet - Restored double ratchet instance
   * @returns {Object} Restored session
   */
  restoreSession(state, doubleRatchet) {
    const session = {
      peerId: state.peerId,
      registrationId: state.registrationId,
      isInitiator: state.isInitiator,
      state: state.state,
      created: state.created,
      lastActivity: state.lastActivity,
      messageCount: state.messageCount,
      doubleRatchet: doubleRatchet
    };

    if (state.peerIdentityKey) {
      session.peerIdentityKey = this.crypto.base64ToBuffer(state.peerIdentityKey);
    }
    if (state.peerSignedPreKey) {
      session.peerSignedPreKey = this.crypto.base64ToBuffer(state.peerSignedPreKey);
    }
    if (state.peerEphemeralKey) {
      session.peerEphemeralKey = this.crypto.base64ToBuffer(state.peerEphemeralKey);
    }

    this.sessions.set(state.peerId, session);
    return session;
  }

  /**
   * Update session activity timestamp
   * @param {string} peerId - Peer's unique identifier
   */
  touchSession(peerId) {
    const session = this.sessions.get(peerId);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  /**
   * Get count of active sessions
   * @returns {number} Number of active sessions
   */
  getSessionCount() {
    return this.sessions.size;
  }
}

// Export for Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SessionManager;
} else if (typeof window !== 'undefined') {
  window.SessionManager = SessionManager;
}
