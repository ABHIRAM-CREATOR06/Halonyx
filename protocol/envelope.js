/**
 * Envelope Module — Pure JS validation and construction for Halonyx E2EE message envelopes.
 * Compatible with Node.js (CommonJS) and browser global scope.
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EnvelopeModule = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback UUID v4 generator
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Constructs a fresh E2EE message envelope object (v: 1).
   *
   * @param {string} body - The main text or magnet URI body
   * @param {Object|null} [replyTo] - Optional parent message quote metadata
   * @param {string} replyTo.id - Target message ID being replied to
   * @param {string} replyTo.snippet - Short snippet of parent text (max 200 chars)
   * @param {string} replyTo.senderHash - Canonical hashed USID of original parent author
   * @returns {Object} envelope
   */
  function createEnvelope(body, replyTo) {
    const envelope = {
      v: 1,
      id: generateUUID(),
      ts: new Date().toISOString(),
      body: String(body || '').substring(0, 10000),
    };

    if (replyTo && typeof replyTo === 'object' && replyTo.id) {
      envelope.replyTo = {
        id: String(replyTo.id).substring(0, 64),
        snippet: String(replyTo.snippet || '').substring(0, 200),
        senderHash: String(replyTo.senderHash || '').substring(0, 64),
      };
    }

    return envelope;
  }

  /**
   * Validates and parses an envelope string or object against strict schema (v: 1).
   *
   * @param {string|Object} input
   * @returns {Object|null} Validated envelope object or null if invalid
   */
  function parseAndValidateEnvelope(input) {
    let obj = input;
    if (typeof input === 'string') {
      try {
        obj = JSON.parse(input);
      } catch (e) {
        return null;
      }
    }

    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return null;
    }

    // Version check
    if (obj.v !== 1) {
      return null;
    }

    // Required field types & constraints
    if (typeof obj.id !== 'string' || obj.id.trim().length === 0 || obj.id.length > 64) {
      return null;
    }

    if (typeof obj.ts !== 'string' || obj.ts.length > 64) {
      return null;
    }

    if (typeof obj.body !== 'string' || obj.body.length > 10000) {
      return null;
    }

    // Optional replyTo field validation
    if (obj.replyTo !== undefined && obj.replyTo !== null) {
      if (typeof obj.replyTo !== 'object' || Array.isArray(obj.replyTo)) {
        return null;
      }

      if (typeof obj.replyTo.id !== 'string' || obj.replyTo.id.trim().length === 0 || obj.replyTo.id.length > 64) {
        return null;
      }

      if (typeof obj.replyTo.snippet !== 'string' || obj.replyTo.snippet.length > 200) {
        return null;
      }

      if (typeof obj.replyTo.senderHash !== 'string' || obj.replyTo.senderHash.length > 64) {
        return null;
      }
    }

    return {
      v: 1,
      id: obj.id,
      ts: obj.ts,
      body: obj.body,
      replyTo: obj.replyTo ? {
        id: obj.replyTo.id,
        snippet: obj.replyTo.snippet,
        senderHash: obj.replyTo.senderHash,
      } : undefined,
    };
  }

  /**
   * Normalizes any input payload (legacy string, legacy stored message, or envelope).
   *
   * @param {any} raw - Plaintext string, raw JSON string, or message history item
   * @returns {{ envelope: Object, isEnvelope: boolean }}
   */
  function normalizeMessage(raw) {
    if (raw && typeof raw === 'object' && raw.v === 1) {
      const valid = parseAndValidateEnvelope(raw);
      if (valid) return { envelope: valid, isEnvelope: true };
    }

    if (typeof raw === 'string') {
      const valid = parseAndValidateEnvelope(raw);
      if (valid) return { envelope: valid, isEnvelope: true };

      // Plaintext string fallback
      return {
        envelope: {
          v: 1,
          id: generateUUID(),
          ts: new Date().toISOString(),
          body: raw.substring(0, 10000),
        },
        isEnvelope: false,
      };
    }

    // Legacy stored message object fallback ({ from, content, timestamp, id, ... })
    const bodyText = typeof raw?.content === 'string' ? raw.content : (typeof raw?.body === 'string' ? raw.body : '');
    const tsText = typeof raw?.timestamp === 'string' ? raw.timestamp : (typeof raw?.ts === 'string' ? raw.ts : new Date().toISOString());

    return {
      envelope: {
        v: 1,
        id: (typeof raw?.id === 'string' && raw.id.length <= 64) ? raw.id : generateUUID(),
        ts: tsText,
        body: bodyText.substring(0, 10000),
      },
      isEnvelope: false,
    };
  }

  return {
    generateUUID: generateUUID,
    createEnvelope: createEnvelope,
    parseAndValidateEnvelope: parseAndValidateEnvelope,
    normalizeMessage: normalizeMessage,
  };
}));
