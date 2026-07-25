/**
 * X3DH Key Exchange — Fixed Implementation
 *
 * Bug 5 fix: processInitialMessage now correctly mirrors createInitialMessage.
 *   Initiator computes:  DH1=DH(IKa,SPKb), DH2=DH(EKa,IKb), DH3=DH(EKa,SPKb)
 *   Responder computes:  DH1=DH(SPKb,IKa), DH2=DH(IKb,EKa), DH3=DH(SPKb,EKa)
 *   Both produce the same secrets by DH commutativity.
 *
 * Bug 6 fix: Pre-key signatures now use Ed25519 instead of the HMAC stub
 *   that unconditionally returned true.
 *
 * KDF fix: deriveSharedSecret uses HKDF (not PBKDF2).
 *
 * All private keys are CryptoKey objects — never raw Uint8Array.
 *
 * Reference: https://signal.org/docs/specifications/x3dh/
 */
class X3DH {
  constructor(cryptoUtils) {
    this.crypto = cryptoUtils || new CryptoUtils();
    this.info = new TextEncoder().encode('HalonyxX3DH');
  }

  /**
   * Generate a full key bundle for this user.
   * Returns public key bytes for transmission, private CryptoKeys for local use.
   *
   * @returns {{
   *   identityPublicBytes:    Uint8Array,
   *   identityPrivateKey:     CryptoKey,   // X25519
   *   signingPublicBytes:     Uint8Array,
   *   signingPrivateKey:      CryptoKey,   // Ed25519
   *   signedPreKeyPublicBytes:Uint8Array,
   *   signedPreKeyPrivate:    CryptoKey,   // X25519
   *   signedPreKeySignature:  Uint8Array,  // Ed25519 over signedPreKeyPublicBytes
   * }}
   */
  async generateKeyBundle() {
    // Identity key pair (X25519 DH)
    const identity  = await this.crypto.generateDhKeyPair();
    // Signing key pair (Ed25519) — separate from identity DH key
    const signing   = await this.crypto.generateSigningKeyPair();
    // Signed pre-key (X25519 DH)
    const spk       = await this.crypto.generateDhKeyPair();

    // Sign the SPK public bytes with the Ed25519 signing private key
    const spkSig = await this.crypto.signEd25519(spk.publicKeyBytes, signing.privateKey);

    return {
      identityPublicBytes:     identity.publicKeyBytes,
      identityPrivateKey:      identity.privateKey,       // CryptoKey
      signingPublicBytes:      signing.publicKeyBytes,
      signingPrivateKey:       signing.privateKey,        // CryptoKey
      signedPreKeyPublicBytes: spk.publicKeyBytes,
      signedPreKeyPrivate:     spk.privateKey,            // CryptoKey
      signedPreKeySignature:   spkSig,
    };
  }

  /**
   * Initiator side — create the initial message and shared secret.
   *
   * @param {CryptoKey}  myIdentityPrivate       X25519 private
   * @param {Uint8Array} myIdentityPublicBytes    X25519 public (sent to responder)
   * @param {Uint8Array} theirIdentityPublicBytes Responder's X25519 identity public
   * @param {Uint8Array} theirSpkPublicBytes      Responder's signed pre-key public
   * @param {Uint8Array} theirSpkSignature        Ed25519 signature over theirSpkPublicBytes
   * @param {Uint8Array} theirSigningPublicBytes  Responder's Ed25519 signing public key
   * @returns {{ ephemeralPublicBytes, sharedSecret }}
   */
  async createInitialMessage(
    myIdentityPrivate, myIdentityPublicBytes,
    theirIdentityPublicBytes, theirSpkPublicBytes,
    theirSpkSignature, theirSigningPublicBytes
  ) {
    // Verify the signed pre-key before using it
    const valid = await this.crypto.verifyEd25519(
      theirSpkPublicBytes, theirSpkSignature, theirSigningPublicBytes
    );
    if (!valid) throw new Error('[X3DH] Signed pre-key signature is invalid');

    // Generate ephemeral key pair for this session
    const ek = await this.crypto.generateDhKeyPair();

    // DH1 = DH(IKa_priv, SPKb_pub)
    const dh1 = await this.crypto.deriveBits(myIdentityPrivate, theirSpkPublicBytes);
    // DH2 = DH(EKa_priv, IKb_pub)
    const dh2 = await this.crypto.deriveBits(ek.privateKey, theirIdentityPublicBytes);
    // DH3 = DH(EKa_priv, SPKb_pub)
    const dh3 = await this.crypto.deriveBits(ek.privateKey, theirSpkPublicBytes);

    const sharedSecret = await this._deriveSharedSecret(dh1, dh2, dh3);

    return {
      ephemeralPublicBytes: ek.publicKeyBytes,
      sharedSecret,
    };
  }

  /**
   * Responder side — mirror of createInitialMessage.
   * Both sides MUST derive the same shared secret via DH commutativity.
   *
   * @param {Uint8Array} theirIdentityPublicBytes  Initiator's X25519 identity public
   * @param {Uint8Array} theirEphemeralPublicBytes  Initiator's X25519 ephemeral public
   * @param {CryptoKey}  myIdentityPrivate           X25519 private
   * @param {CryptoKey}  mySignedPreKeyPrivate        X25519 private
   * @returns {{ sharedSecret }}
   */
  async processInitialMessage(
    theirIdentityPublicBytes, theirEphemeralPublicBytes,
    myIdentityPrivate, mySignedPreKeyPrivate
  ) {
    // DH1 = DH(SPKb_priv, IKa_pub)   ← mirrors initiator's DH(IKa,SPKb)
    const dh1 = await this.crypto.deriveBits(mySignedPreKeyPrivate, theirIdentityPublicBytes);
    // DH2 = DH(IKb_priv, EKa_pub)    ← mirrors initiator's DH(EKa,IKb)
    const dh2 = await this.crypto.deriveBits(myIdentityPrivate, theirEphemeralPublicBytes);
    // DH3 = DH(SPKb_priv, EKa_pub)   ← mirrors initiator's DH(EKa,SPKb)
    const dh3 = await this.crypto.deriveBits(mySignedPreKeyPrivate, theirEphemeralPublicBytes);

    const sharedSecret = await this._deriveSharedSecret(dh1, dh2, dh3);
    return { sharedSecret };
  }

  /**
   * Derive shared secret from DH outputs using HKDF-SHA-256.
   * Bug 3 fix: original used PBKDF2 with 1 iteration — replaced with HKDF.
   */
  async _deriveSharedSecret(dh1, dh2, dh3) {
    const ikm  = this.crypto.concatArrays(dh1, dh2, dh3);
    const salt = new Uint8Array(32); // 32 zero bytes per Signal spec
    return this.crypto.hkdf(ikm, salt, this.info, 32);
  }

  // ── Bundle encode / decode for server upload ──────────────────────────────

  encodePublicBundle(bundle) {
    return {
      identityKey:    this.crypto.bufferToBase64(bundle.identityPublicBytes),
      signingKey:     this.crypto.bufferToBase64(bundle.signingPublicBytes),
      signedPreKey:   this.crypto.bufferToBase64(bundle.signedPreKeyPublicBytes),
      spkSignature:   this.crypto.bufferToBase64(bundle.signedPreKeySignature),
    };
  }

  decodePublicBundle(encoded) {
    return {
      identityPublicBytes:     this.crypto.base64ToBuffer(encoded.identityKey),
      signingPublicBytes:      this.crypto.base64ToBuffer(encoded.signingKey),
      signedPreKeyPublicBytes: this.crypto.base64ToBuffer(encoded.signedPreKey),
      signedPreKeySignature:   this.crypto.base64ToBuffer(encoded.spkSignature),
    };
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = X3DH;
else if (typeof window !== 'undefined') window.X3DH = X3DH;
