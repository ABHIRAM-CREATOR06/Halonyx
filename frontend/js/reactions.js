(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HalonyxReactions = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const ALLOWED_EMOJIS = Object.freeze(['❤️', '👍', '😂', '😮', '😢', '🙏']);
  const TARGET_RE = /^[a-f0-9]{32}$/;
  const MAX_PENDING = 100;
  const TTL_MS = 5 * 60 * 1000;
  function applyReaction(state, event, senderId, now = Date.now()) {
    state = state && typeof state === 'object' ? state : {};
    const messages = new Set(state.messageIds || []);
    const reactions = { ...(state.reactions || {}) };
    const pending = (state.pending || []).filter((p) => now - p.receivedAt < TTL_MS).slice(-MAX_PENDING);
    const valid = event && event.type === 'reaction' && TARGET_RE.test(event.target || '') &&
      (event.emoji === null || (ALLOWED_EMOJIS.includes(event.emoji) && event.emoji.length <= 16)) &&
      typeof senderId === 'string' && senderId.length > 0 && JSON.stringify(event).length <= 256 &&
      (event.senderId === undefined || event.senderId === senderId) && (event.from === undefined || event.from === senderId);
    if (!valid) return { ...state, reactions, pending };
    if (!messages.has(event.target)) {
      if (!pending.some((p) => p.event.target === event.target && p.senderId === senderId && p.event.emoji === event.emoji)) pending.push({ event: { ...event }, senderId, receivedAt: now });
      return { ...state, reactions, pending: pending.slice(-MAX_PENDING) };
    }
    const bySender = { ...(reactions[event.target] || {}) };
    const previous = bySender[senderId];
    const stamp = Number.isFinite(event.ts) ? event.ts : now;
    if (!previous || stamp > previous.ts) {
      if (event.emoji === null) delete bySender[senderId];
      else bySender[senderId] = { emoji: event.emoji, ts: stamp };
    }
    reactions[event.target] = bySender;
    return { ...state, reactions, pending };
  }
  function addMessage(state, id, now = Date.now()) {
    const next = { ...(state || {}), messageIds: [...new Set([...(state?.messageIds || []), id])] };
    const pending = (next.pending || []).filter((p) => now - p.receivedAt < TTL_MS);
    let result = { ...next, pending };
    pending.filter((p) => p.event.target === id).forEach((p) => { result = applyReaction(result, p.event, p.senderId, now); });
    result.pending = result.pending.filter((p) => p.event.target !== id);
    return result;
  }
  return { ALLOWED_EMOJIS, applyReaction, addMessage, isValidReaction: (e) => !!e && e.type === 'reaction' && TARGET_RE.test(e.target || '') && (e.emoji === null || ALLOWED_EMOJIS.includes(e.emoji)) };
}));
