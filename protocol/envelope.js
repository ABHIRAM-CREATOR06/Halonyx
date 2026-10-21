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
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
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
  function createEnvelope(body, replyTo, group, fmt) {
    const envelope = {
      v: 1,
      id: generateUUID(),
      ts: new Date().toISOString(),
      body: String(body || '').substring(0, 10000),
    };
    if (fmt === 'md') envelope.fmt = 'md';

    if (replyTo && typeof replyTo === 'object' && replyTo.id) {
      envelope.replyTo = {
        id: String(replyTo.id).substring(0, 64),
        snippet: String(replyTo.snippet || '').substring(0, 200),
        senderHash: String(replyTo.senderHash || '').substring(0, 64),
      };
    }

    if (group && typeof group === 'object' && group.id) {
      envelope.group = {
        id: String(group.id).substring(0, 64),
        name: String(group.name || '').substring(0, 100),
        action: group.action ? String(group.action).substring(0, 32) : undefined,
        members: Array.isArray(group.members)
          ? group.members.slice(0, 100).map((m) => String(m).substring(0, 64))
          : undefined,
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

    if (obj.type === 'reaction') {
      if (!/^[a-f0-9]{32}$/.test(obj.target || '') || (obj.emoji !== null && (typeof obj.emoji !== 'string' || obj.emoji.length > 16))) return null;
      return { v: 1, type: 'reaction', target: obj.target, emoji: obj.emoji };
    }
    if (obj.type !== undefined) return null;

    // Required field types & constraints
    if (obj.id !== undefined && (typeof obj.id !== 'string' || !/^[a-f0-9]{32}$/.test(obj.id))) {
      return null;
    }

    if (typeof obj.ts !== 'string' || obj.ts.length > 64) {
      return null;
    }

    if (typeof obj.body !== 'string' || obj.body.length > 10000) {
      return null;
    }
    if (obj.fmt !== undefined && obj.fmt !== 'md') return null;

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

    // Optional group field validation
    if (obj.group !== undefined && obj.group !== null) {
      if (typeof obj.group !== 'object' || Array.isArray(obj.group)) {
        return null;
      }

      if (typeof obj.group.id !== 'string' || obj.group.id.trim().length === 0 || obj.group.id.length > 64) {
        return null;
      }

      if (obj.group.name !== undefined && (typeof obj.group.name !== 'string' || obj.group.name.length > 100)) {
        return null;
      }
    }

    return {
      v: 1,
      id: obj.id,
      ts: obj.ts,
      body: obj.body,
      fmt: obj.fmt === 'md' ? 'md' : undefined,
      replyTo: obj.replyTo ? {
        id: obj.replyTo.id,
        snippet: obj.replyTo.snippet,
        senderHash: obj.replyTo.senderHash,
      } : undefined,
      group: obj.group ? {
        id: obj.group.id,
        name: obj.group.name || '',
        action: obj.group.action ? String(obj.group.action) : undefined,
        members: Array.isArray(obj.group.members) ? obj.group.members.map(String) : undefined,
      } : undefined,
    };
  }

  function createReactionEnvelope(target, emoji) {
    return { v: 1, type: 'reaction', target: String(target), emoji: emoji === null ? null : String(emoji) };
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
    createReactionEnvelope: createReactionEnvelope,
    parseAndValidateEnvelope: parseAndValidateEnvelope,
    normalizeMessage: normalizeMessage,
  };
}));
