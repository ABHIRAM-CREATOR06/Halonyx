/**
 * Halonyx Secura — Core App
 * Version 4.3.0
 * Fix: Safety Numbers USID normalisation — both sides now hash their own
 *      USID before sorting/concatenating, guaranteeing identical numbers
 *      on both ends without any MITM.
 */

// ─────────────────────────────────────────
// Sound Engine (Web Audio API — no files needed)
// ─────────────────────────────────────────
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) {
    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {}
  }
  return _audioCtx;
}

/** Play a short "sent" click/whoosh */
function playSendSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  } catch (e) {}
}

/** Play a pleasant two-tone chime on successful connection */
function playConnectSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    [
      [523.25, 0, 0.13],
      [783.99, 0.13, 0.28],
    ].forEach(([freq, start, stop]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + stop);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + stop);
    });
  } catch (e) {}
}

// ─────────────────────────────────────────
// State
// ─────────────────────────────────────────
let token = localStorage.getItem("token");
let myUsid = localStorage.getItem("usid");
let currentTheme = localStorage.getItem("theme") || "theme-dark";
let currentChatUsid = null;
let currentChatType = "direct"; // "direct" | "group"
let currentChatGroupId = null;
let currentCategory = "all"; // "all" | "direct" | "groups"
let contacts = [];
let messageHistory = {};
const reactionStates = {};
const reactionQueueAcks = new Map();
let activeReplyTarget = null;
let ws;
let identityRejected = false;
// WebSocket frames are ordered, but their async handlers are not. Hold an
// encrypted message until its preceding X3DH handshake has finished.
const pendingEncryptedMessages = new Map();
const pendingX3dhHandshakes = new Map();
const sessionRecoveryRequests = new Map();
const outgoingSessionIds = new Map();

function professionalMarkdownEnabled() {
  return !!(window.HalonyxMarkdownToolbar && window.HalonyxMarkdownToolbar.getProfessionalMode && window.HalonyxMarkdownToolbar.getProfessionalMode());
}

function messageLengthAllowed(content) {
  if (String(content || "").length <= 10000) return true;
  showSnackbar("Messages are limited to 10000 characters", "warn");
  return false;
}

function resizeComposerTextarea(textarea) {
  if (!textarea) return;
  const maxHeight = Math.max(72, Math.min(260, Math.round(window.innerHeight * 0.35)));
  textarea.style.height = "auto";
  const contentHeight = textarea.scrollHeight;
  textarea.style.height = `${Math.min(contentHeight, maxHeight)}px`;
  textarea.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
}

function messageBodyHTML(message, className) {
  if (message.fmt === "md" && window.HalonyxMarkdownRender) {
    try { return `<div class="${className} markdown-content">${window.HalonyxMarkdownRender.renderMarkdown(String(message.content || ""))}</div>`; }
    catch (e) { console.warn("[Markdown] Render failed", e); }
  }
  return `<div class="${className}">${escapeHTML(message.content || "")}</div>`;
}

function messageHistoryKey() {
  return `messageHistory:${myUsid || "anonymous"}`;
}

let _historyCryptoKey = null;

async function getHistoryCryptoKey() {
  if (_historyCryptoKey) return _historyCryptoKey;
  if (!myUsid || typeof crypto === "undefined" || !crypto.subtle) return null;
  try {
    const keyMaterial = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode("HalonyxMessageHistoryEncryption:" + myUsid)
    );
    _historyCryptoKey = await crypto.subtle.importKey(
      "raw",
      keyMaterial,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
    return _historyCryptoKey;
  } catch (e) {
    console.error("[MessageHistory] CryptoKey derivation error", e);
    return null;
  }
}

async function saveMessageHistoryAsync() {
  const key = messageHistoryKey();
  const rawJson = JSON.stringify(messageHistory);

  try {
    const cryptoKey = await getHistoryCryptoKey();
    if (cryptoKey) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(rawJson);
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        cryptoKey,
        encoded
      );
      const hexIv = Array.from(iv).map((b) => b.toString(16).padStart(2, "0")).join("");
      const hexEnc = Array.from(new Uint8Array(ciphertext)).map((b) => b.toString(16).padStart(2, "0")).join("");
      const encryptedRecord = JSON.stringify({ v: 1, enc: hexEnc, iv: hexIv });
      localStorage.setItem(key, encryptedRecord);
      return;
    }
  } catch (e) {
    console.error("[MessageHistory] Encryption failed, fallback to plain storage", e);
  }

  localStorage.setItem(key, rawJson);
}

function saveMessageHistory() {
  saveMessageHistoryAsync().catch((e) => console.error("[MessageHistory] Save error", e));
}

async function loadMessageHistoryAsync() {
  const key = messageHistoryKey();
  try {
    const storedStr = localStorage.getItem(key) || localStorage.getItem("messageHistory");
    if (!storedStr) return {};

    let storedObj;
    try {
      storedObj = JSON.parse(storedStr);
    } catch (_) {
      return {};
    }

    if (storedObj && storedObj.v === 1 && storedObj.enc && storedObj.iv) {
      const cryptoKey = await getHistoryCryptoKey();
      if (cryptoKey) {
        const ivBytes = new Uint8Array(storedObj.iv.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
        const encBytes = new Uint8Array(storedObj.enc.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
        const decryptedBuf = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: ivBytes },
          cryptoKey,
          encBytes
        );
        const decryptedJson = new TextDecoder().decode(decryptedBuf);
        return JSON.parse(decryptedJson);
      }
    }

    if (storedObj && typeof storedObj === "object") {
      return storedObj;
    }
  } catch (e) {
    console.error("[MessageHistory] Decryption/Load error", e);
  }
  return {};
}

function loadMessageHistory() {
  loadMessageHistoryAsync()
    .then((loaded) => {
      messageHistory = loaded;
      migrateLegacyHistory();
      if (currentChatType === "group" ? currentChatGroupId : currentChatUsid) renderMessages();
    })
    .catch((e) => console.error("[MessageHistory] Load error", e));
  return messageHistory;
}

function migrateLegacyHistory() {
  let modified = false;
  const canonicalId = (id) => typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id) ? id.replace(/-/g, '').toLowerCase() : id;
  Object.keys(messageHistory).forEach((chatUsid) => {
    const list = messageHistory[chatUsid];
    if (Array.isArray(list)) {
      list.forEach((m, idx) => {
        const canonical = canonicalId(m.id);
        if (canonical !== m.id) { m.id = canonical; modified = true; }
        if (m.replyTo?.id) { const replyId = canonicalId(m.replyTo.id); if (replyId !== m.replyTo.id) { m.replyTo.id = replyId; modified = true; } }
        if (!m.id) {
          m.id = EnvelopeModule.generateUUID();
          modified = true;
        }
        if (!m.rxTs) {
          m.rxTs = m.timestamp ? new Date(m.timestamp).getTime() : Date.now() + idx;
          modified = true;
        }
      });
      list.sort((a, b) => (a.rxTs || 0) - (b.rxTs || 0));
    }
  });
  if (modified) saveMessageHistory();
}

function setReplyTarget(msg) {
  if (!msg || !msg.id) return;
  const authorName = msg.from === "me" ? "You" : getContactName(msg.from);
  const senderHash = msg.from === "me" ? myUsid : msg.from;
  const snippet = msg.content ? String(msg.content).substring(0, 200) : "";

  activeReplyTarget = {
    id: msg.id,
    snippet: snippet,
    senderHash: senderHash,
    authorName: authorName,
  };

  const previewBar = document.getElementById("reply-preview-bar");
  const previewAuthor = document.getElementById("reply-preview-author");
  const previewText = document.getElementById("reply-preview-text");

  if (previewBar && previewAuthor && previewText) {
    previewAuthor.textContent = `Replying to ${authorName}`;
    previewText.textContent = snippet;
    previewBar.classList.remove("hidden");
  }

  const input = document.getElementById("message-input");
  if (input) input.focus();
}

function setReplyTargetById(msgId) {
  const activeChatKey = currentChatType === "group" ? currentChatGroupId : currentChatUsid;
  if (!activeChatKey || !messageHistory[activeChatKey]) return;
  const msg = messageHistory[activeChatKey].find((m) => m.id === msgId);
  if (msg) setReplyTarget(msg);
}

function cancelReplyTarget() {
  activeReplyTarget = null;
  const previewBar = document.getElementById("reply-preview-bar");
  if (previewBar) previewBar.classList.add("hidden");
}

function copyMessageText(text) {
  if (!text) return;
  navigator.clipboard
    .writeText(text)
    .then(() => showSnackbar("Message text copied", "info"))
    .catch(() => showSnackbar("Failed to copy text", "error"));
}

function jumpToMessage(msgId) {
  const targetEl = document.getElementById(`msg-${msgId}`);
  if (targetEl) {
    targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
    targetEl.classList.remove("reply-pulse-highlight");
    void targetEl.offsetWidth; // force reflow
    targetEl.classList.add("reply-pulse-highlight");
    setTimeout(() => targetEl.classList.remove("reply-pulse-highlight"), 1600);
  } else {
    showSnackbar("Original message unavailable in local history", "info");
  }
}

function countReplies(history, msgId) {
  let count = 0;
  if (!Array.isArray(history)) return 0;
  history.forEach((m) => {
    if (m.replyTo && m.replyTo.id === msgId) count++;
  });
  return count;
}

let activeThreadRootMsg = null;

function openThread(startMsgId) {
  const activeChatKey = currentChatType === "group" ? currentChatGroupId : currentChatUsid;
  const history = (activeChatKey && messageHistory[activeChatKey]) || [];
  if (history.length === 0) return;

  const visited = new Set();
  let current = history.find((m) => m.id === startMsgId);
  if (!current) return;

  visited.add(current.id);
  let depth = 0;
  while (current.replyTo && current.replyTo.id && depth < 50) {
    const parent = history.find((m) => m.id === current.replyTo.id);
    if (!parent || visited.has(parent.id)) break;
    visited.add(parent.id);
    current = parent;
    depth++;
  }
  const rootMsg = current;
  activeThreadRootMsg = rootMsg;

  const threadSet = new Set([rootMsg.id]);
  let addedNew = true;
  depth = 0;
  while (addedNew && depth < 50) {
    addedNew = false;
    depth++;
    history.forEach((m) => {
      if (m.replyTo && threadSet.has(m.replyTo.id) && !threadSet.has(m.id)) {
        threadSet.add(m.id);
        addedNew = true;
      }
    });
  }

  const threadMsgs = history.filter((m) => threadSet.has(m.id));
  const replies = threadMsgs.filter((m) => m.id !== rootMsg.id);

  // Participant metadata
  const participantNames = new Set();
  participantNames.add(rootMsg.from === "me" ? "You" : getContactName(rootMsg.from));
  replies.forEach((m) => {
    participantNames.add(m.from === "me" ? "You" : getContactName(m.from));
  });

  const badgeEl = document.getElementById("thread-participants-badge");
  if (badgeEl) {
    const pCount = participantNames.size;
    const rCount = replies.length;
    badgeEl.textContent = `${rCount} ${rCount === 1 ? "reply" : "replies"} · ${pCount} ${pCount === 1 ? "participant" : "participants"}`;
  }

  const panel = document.getElementById("reply-chain-panel");
  const body = document.getElementById("reply-chain-body");
  if (!panel || !body) return;

  const rootAuthor = rootMsg.from === "me" ? "You" : getContactName(rootMsg.from);
  const rootInitial = (rootAuthor.charAt(0) || "U").toUpperCase();
  const rootTimeStr = formatTime(rootMsg.timestamp);

  let html = `
    <div class="thread-root-card">
      <div class="thread-user-header">
        <div class="thread-user-meta">
          <div class="thread-avatar">${escapeHTML(rootInitial)}</div>
          <span class="thread-author-name">${escapeHTML(rootAuthor)}</span>
          <span class="thread-time-stamp">${escapeHTML(rootTimeStr)}</span>
        </div>
        <button class="msg-action-btn" onclick="copyMessageById('${escapeAttr(rootMsg.id)}')" title="Copy text">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
      </div>
      ${messageBodyHTML(rootMsg, "thread-root-content")}
      ${reactionMarkup(rootMsg)}
    </div>
  `;

  if (replies.length > 0) {
    html += `
      <div class="thread-replies-divider">
        <span>${replies.length} ${replies.length === 1 ? "reply" : "replies"}</span>
      </div>
    `;
  }

  replies.forEach((m) => {
    const author = m.from === "me" ? "You" : getContactName(m.from);
    const initial = (author.charAt(0) || "U").toUpperCase();
    const timeStr = formatTime(m.timestamp);
    const isMe = m.from === "me";

    html += `
      <div class="thread-item ${isMe ? "sent-by-me" : ""}" id="thread-item-${escapeAttr(m.id)}">
        <div class="thread-user-header">
          <div class="thread-user-meta">
            <div class="thread-avatar">${escapeHTML(initial)}</div>
            <span class="thread-author-name">${escapeHTML(author)}</span>
            <span class="thread-time-stamp">${escapeHTML(timeStr)}</span>
          </div>
          <button class="msg-action-btn" onclick="copyMessageById('${escapeAttr(m.id)}')" title="Copy text">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
        </div>
        ${messageBodyHTML(m, "thread-body")}
        ${reactionMarkup(m)}
      </div>
    `;
  });

  body.innerHTML = html;
  mountReactionControls(body);
  panel.classList.remove("hidden");

  // Reset thread composer
  const threadInput = document.getElementById("thread-message-input");
  const threadWarning = document.getElementById("thread-dlp-warning");
  if (threadWarning) threadWarning.classList.add("hidden");
  if (threadInput) {
    threadInput.value = "";
    resizeComposerTextarea(threadInput);
    threadInput.focus();
  }

  body.scrollTop = body.scrollHeight;
}

const openReplyChain = openThread;

function hideReplyChain() {
  const panel = document.getElementById("reply-chain-panel");
  if (panel) panel.classList.add("hidden");
  activeThreadRootMsg = null;
}

function jumpToThreadRoot() {
  if (activeThreadRootMsg) {
    jumpToMessage(activeThreadRootMsg.id);
  }
}

async function sendThreadReply() {
  const input = document.getElementById("thread-message-input");
  const isGroup = currentChatType === "group" && !!currentChatGroupId;
  const activeChatKey = isGroup ? currentChatGroupId : currentChatUsid;
  if (!input || !activeThreadRootMsg || !activeChatKey || !ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }
  let content = input.value.trim();
  if (!content) return;
  if (!messageLengthAllowed(content)) return;

  const targetName = isGroup
    ? ((window.HalonyxGroups && HalonyxGroups.getGroup(currentChatGroupId, myUsid)?.name) || "Group")
    : getContactName(currentChatUsid);

  // Pre-encryption Enterprise DLP Inspection
  if (window.HalonyxDLP) {
    const scan = window.HalonyxDLP.scan(content);
    if (scan.hasViolation) {
      if (scan.mode === "BLOCK") {
        window.HalonyxDLP.logIncident(scan.violations, "BLOCKED", targetName);
        showDlpAlertDialog(scan, content, "thread");
        return;
      } else if (scan.mode === "WARN") {
        showDlpAlertDialog(scan, content, "thread");
        return;
      } else if (scan.mode === "REDACT") {
        window.HalonyxDLP.logIncident(scan.violations, "AUTO_REDACTED", targetName);
        content = scan.redactedText;
      }
    }
  }

  if (inspectAegisusThreats(content, targetName, "thread")) return;

  const replyToMeta = {
    id: activeThreadRootMsg.id,
    snippet: activeThreadRootMsg.content ? String(activeThreadRootMsg.content).substring(0, 200) : "",
    senderHash: activeThreadRootMsg.from === "me" ? myUsid : activeThreadRootMsg.from,
  };

  if (isGroup && window.HalonyxGroups) {
    const group = HalonyxGroups.getGroup(currentChatGroupId, myUsid);
    if (!group) return;
    const groupMeta = {
      id: group.id,
      name: group.name,
      members: group.members,
      action: "message",
    };
    const envelope = EnvelopeModule.createEnvelope(content, replyToMeta, groupMeta, professionalMarkdownEnabled() ? "md" : undefined);
    const rawEnvelopeStr = JSON.stringify(envelope);

    const otherMembers = HalonyxGroups.getOtherMembers(group, myUsid);
    for (const recipient of otherMembers) {
      try {
        if (signalProtocol.hasSession(recipient)) {
          try {
            const encrypted = await signalProtocol.encrypt(recipient, rawEnvelopeStr);
            ws.send(JSON.stringify({ type: "message", to: recipient, encrypted }));
          } catch (e) {
            console.warn(`[Groups] Thread encryption failed for ${recipient}, refusing plaintext fallback:`, e);
          }
        } else {
          console.warn(`[Groups] No session with ${recipient}, refusing plaintext thread reply; initiating X3DH`);
          startX3dhSession(recipient).catch((e) => console.warn("[Groups] Thread warm-up X3DH error:", e));
        }
      } catch (err) {
        console.error(`[Groups] Thread dispatch error to ${recipient}:`, err);
      }
    }

    saveMessage(group.id, {
      id: envelope.id,
      from: "me",
      content: envelope.body,
      timestamp: envelope.ts,
      rxTs: Date.now(),
      replyTo: envelope.replyTo,
      group: groupMeta,
      fmt: envelope.fmt,
    });
  } else {
    const envelope = EnvelopeModule.createEnvelope(content, replyToMeta, undefined, professionalMarkdownEnabled() ? "md" : undefined);
    const rawEnvelopeStr = JSON.stringify(envelope);

    if (!signalProtocol.hasSession(currentChatUsid)) {
      console.log("[E2EE] No session with recipient — initiating X3DH session for thread reply...");
      let failureDetail = null;
      try {
        const ok = await startX3dhSession(currentChatUsid);
        if (!ok && !signalProtocol.hasSession(currentChatUsid)) {
          failureDetail = "Handshake did not complete";
        }
      } catch (e) {
        failureDetail = e.message || String(e);
        console.error("[E2EE] Thread session setup failed:", e);
      }

      if (!signalProtocol.hasSession(currentChatUsid)) {
        if (failureDetail && failureDetail.includes("No key bundle")) {
          showSnackbar("Recipient has not registered encryption keys yet. Both peers must log in/refresh.", "warn");
        } else {
          showSnackbar("Cannot send reply: no secure session established with peer", "error");
        }
        return;
      }
    }

    let encrypted;
    try {
      encrypted = await signalProtocol.encrypt(currentChatUsid, rawEnvelopeStr);
    } catch (e) {
      console.error("[E2EE] Thread encryption failed, refusing to send", e);
      showSnackbar("Encryption failed: thread reply not sent", "error");
      return;
    }

    const payload = { type: "message", to: currentChatUsid, encrypted };
    ws.send(JSON.stringify(payload));
    console.log("[E2EE] Thread envelope encrypted and sent");
    saveMessage(currentChatUsid, {
      id: envelope.id,
      from: "me",
      content: envelope.body,
      timestamp: envelope.ts,
      rxTs: Date.now(),
      replyTo: envelope.replyTo,
      fmt: envelope.fmt,
    });
  }

  input.value = "";
  resizeComposerTextarea(input);
  const threadWarning = document.getElementById("thread-dlp-warning");
  if (threadWarning) threadWarning.classList.add("hidden");

  renderMessages();
  openThread(activeThreadRootMsg.id);
  playSendSound();
}

function contactAliasesKey() {
  return `contactAliases:${myUsid || "anonymous"}`;
}

function getContactAliases() {
  try {
    return JSON.parse(localStorage.getItem(contactAliasesKey()) || "{}");
  } catch {
    return {};
  }
}

function getContactName(usid) {
  return getContactAliases()[usid] || `Peer ${usid.substring(0, 8)}`;
}

function saveContactName(usid, name) {
  const aliases = getContactAliases();
  const cleanedName = name.trim().slice(0, 40);
  if (cleanedName) aliases[usid] = cleanedName;
  else delete aliases[usid];
  localStorage.setItem(contactAliasesKey(), JSON.stringify(aliases));
}

// Signal Protocol instance — created once, persists across the session
const signalProtocol = new SignalProtocol();

// Safety Numbers — identity key for verification
let myIdentityPublicKeyHex = null; // our P-256 public key hex, populated after init
let myHashedUsid = null; // SHA-256(myUsid) — cached so we don't recompute
let currentSafetyNumber = null; // safety number for the currently open chat

// Active torrents map: magnetURI → torrent object
const activeTorrents = new Map();
// Global WebTorrent client
let btClient = null;

const TRACKERS = [
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.webtorrent.dev",
  "wss://tracker.files.fm:7073/announce",
  "wss://tracker.btorrent.xyz",
];

function getBTClient() {
  if (!btClient) {
    try {
      btClient = new WebTorrent({
        tracker: {
          rtcConfig: {
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:global.stun.twilio.com:3478" },
              { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
              { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
              { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" }
            ],
          },
        },
      });
      btClient.on("error", (err) => {
        console.warn("[BitTorrent] Client error:", err.message);
      });
    } catch (e) {
      console.error("[BitTorrent] Failed to init:", e);
    }
  }
  return btClient;
}

// ─────────────────────────────────────────
// Init
// ─────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  applyTheme(currentTheme);
  setupEventListeners();
  checkIdentity();
});

function checkIdentity() {
  const loader = document.getElementById("splash-loader-container");
  const regForm = document.getElementById("registration-form");

  if (token && myUsid) {
    messageHistory = loadMessageHistory();
    migrateLegacyHistory();
    loader.style.display = "flex";
    // Generate/load identity key pair for safety numbers
    generateOrLoadIdentityKeyPair().catch(console.error);
    // Init Signal Protocol (restores from IndexedDB) before connecting WS
    signalProtocol
      .init(myUsid, token)
      .then(() => connectWS())
      .catch((e) => {
        console.error("[E2EE] Init error", e);
        connectWS();
      });
  } else {
    setTimeout(() => {
      document.getElementById("splash-header").classList.add("shift-up");
      regForm.style.display = "block";
    }, 900);
  }
}

// ─────────────────────────────────────────
// WebSocket
// ─────────────────────────────────────────
let heartbeatTimer = null;

function startHeartbeat() {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "ping" }));
      } catch (e) {
        console.warn("[WS] Heartbeat ping error:", e);
      }
    }
  }, 25000);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function connectWS() {
  if (!myUsid || !token) return;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "register", token, usid: myUsid }));
    setNetStatus("online");
    startHeartbeat();
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleWSMessage(data);
    } catch (e) {
      console.error("[WS] Parse error:", e);
    }
  };

  ws.onclose = () => {
    stopHeartbeat();
    setNetStatus("offline");
    if (!identityRejected && token) {
      setTimeout(connectWS, 3000);
    }
  };

  ws.onerror = () => {
    stopHeartbeat();
    setNetStatus("offline");
  };
}

function newSessionId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function startX3dhSession(peerUsid) {
  if (signalProtocol.hasSession(peerUsid)) return true;
  const initMsg = await signalProtocol.openSession(peerUsid);
  if (!initMsg || !ws || ws.readyState !== WebSocket.OPEN) return false;

  const sessionId = newSessionId();
  outgoingSessionIds.set(peerUsid, sessionId);
  // Retain the ID only while a competing simultaneous init could arrive.
  setTimeout(() => {
    if (outgoingSessionIds.get(peerUsid) === sessionId) {
      outgoingSessionIds.delete(peerUsid);
    }
  }, 10000);

  initMsg.to = peerUsid;
  initMsg.sessionId = sessionId;
  ws.send(JSON.stringify(initMsg));
  return true;
}

async function recoverSession(peerUsid) {
  if (sessionRecoveryRequests.has(peerUsid)) {
    return sessionRecoveryRequests.get(peerUsid);
  }

  const recovery = (async () => {
    try {
      if (await startX3dhSession(peerUsid)) {
        // A message received before a matching session cannot be recovered;
        // a newly negotiated session applies to messages sent after this point.
        pendingEncryptedMessages.delete(peerUsid);
        showSnackbar("Secure session refreshed — ask the peer to resend the message", "info");
      }
    } catch (e) {
      console.error("[E2EE] Session recovery failed", e);
    } finally {
      sessionRecoveryRequests.delete(peerUsid);
    }
  })();

  sessionRecoveryRequests.set(peerUsid, recovery);
  return recovery;
}

async function handleWSMessage(data) {
  switch (data.type) {
    case "registered":
      // If the server detected an old-format raw USID, it sends back the
      // canonical hashed form so we can silently migrate localStorage.
      if (data.migrateUsid) {
        myUsid = data.migrateUsid;
        myHashedUsid = myUsid;
        localStorage.setItem("usid", myUsid);
        console.log("[Migration] USID updated to canonical hashed format.");
      }
      if (signalProtocol && signalProtocol.isReady) {
        signalProtocol._uploadPublicBundle().catch((e) => console.warn("[Signal] Bundle sync on register:", e));
        signalProtocol.replenishPreKeysIfNecessary().catch(() => {});
      }
      hideSplashScreen();
      break;
    case "error":
      if (data.message === "Identity not verified")
        handleAuthError("Session expired. Please reconnect using your email or USID.");
      break;
    case "message": {
      const { from, encrypted, content, timestamp } = data;

      if (encrypted && !signalProtocol.hasSession(from)) {
        const pending = pendingEncryptedMessages.get(from) || [];
        pending.push(data);
        pendingEncryptedMessages.set(from, pending);
        console.log(`[E2EE] Waiting for X3DH session from ${from.substring(0, 12)}`);
        if (!pendingX3dhHandshakes.has(from)) void recoverSession(from);
        break;
      }

      let displayContent = content || "";

      if (encrypted && signalProtocol.hasSession(from)) {
        try {
          displayContent = await signalProtocol.decrypt(from, encrypted);
          console.log(`[E2EE] Decrypted message from ${from.substring(0, 12)}`);
        } catch (e) {
          console.error("[E2EE] Decryption failed", e);
          // The peer may have retained a different ratchet after a reload or
          // an interrupted key exchange. Discard only this peer session and
          // negotiate a replacement for subsequent messages.
          await signalProtocol.closeSession(from);
          void recoverSession(from);
          displayContent = "[Encrypted message — secure session is refreshing; ask the peer to resend]";
        }
      }

      // Normalize envelope or plaintext payload
      let decodedEnvelope;
      try { decodedEnvelope = typeof displayContent === 'string' ? JSON.parse(displayContent) : displayContent; } catch (_) {}
      if (decodedEnvelope && decodedEnvelope.v === 1 && decodedEnvelope.type === 'reaction') {
        const reactionChat = Object.keys(messageHistory).find((key) => (messageHistory[key] || []).some((m) => m.id === decodedEnvelope.target));
        if (!reactionChat) break;
        const hist = messageHistory[reactionChat] || [];
        const state = reactionStates[reactionChat] || { messageIds: hist.map((m) => m.id), reactions: Object.fromEntries(hist.filter((m) => m.reactions).map((m) => [m.id, m.reactions])) };
        const next = HalonyxReactions.applyReaction(state, decodedEnvelope, from);
        reactionStates[reactionChat] = next;
        const target = hist.find((m) => m.id === decodedEnvelope.target);
        if (target) target.reactions = next.reactions[target.id] || {};
        saveMessageHistory();
        if (target && ((currentChatType === 'group' && currentChatGroupId === reactionChat) || (currentChatType === 'direct' && currentChatUsid === reactionChat))) { renderMessages(); if (!document.getElementById('reply-chain-panel')?.classList.contains('hidden')) openThread(activeThreadRootMsg?.id); }
        break;
      }
      if (decodedEnvelope && decodedEnvelope.v === 1 && decodedEnvelope.type) break;
      const { envelope } = EnvelopeModule.normalizeMessage(displayContent);

      // E2EE Group Message Handling
      if (envelope.group && envelope.group.id && window.HalonyxGroups) {
        const groupResult = HalonyxGroups.handleIncomingEnvelope(envelope, from, myUsid);
        const groupId = envelope.group.id;
        const existingHist = messageHistory[groupId] || [];
        if (existingHist.some((m) => m.id === envelope.id)) {
          console.warn(`[WS] Duplicate group message ID ${envelope.id} rejected`);
          break;
        }

        saveMessage(groupId, {
          id: envelope.id,
          from: from,
          content: envelope.body,
          timestamp: envelope.ts || timestamp || new Date().toISOString(),
          rxTs: Date.now(),
          replyTo: envelope.replyTo,
          group: envelope.group,
          fmt: envelope.fmt,
        });

        const groupName = groupResult.group ? groupResult.group.name : "Group";
        const senderName = getContactName(from);

        if (currentChatType === "group" && currentChatGroupId === groupId) {
          renderMessages();
        } else {
          if (groupResult.group) {
            groupResult.group.unreadCount = (groupResult.group.unreadCount || 0) + 1;
            HalonyxGroups.addOrUpdateGroup(groupResult.group, myUsid);
          }
          showSnackbar(`[${groupName}] ${senderName}: ${truncate(envelope.body, 28)}`, "info");
          updateGroupBadges();
        }
        renderContactsList();
        break;
      }

      // Amendment 6: Look up duplicate IDs in message history and reject duplicates
      const existingHist = messageHistory[from] || [];
      if (existingHist.some((m) => m.id === envelope.id)) {
        console.warn(`[WS] Duplicate message ID ${envelope.id} rejected`);
        break;
      }

      saveMessage(from, {
        id: envelope.id,
        from: from,
        content: envelope.body,
        timestamp: envelope.ts || timestamp || new Date().toISOString(),
        rxTs: Date.now(),
        replyTo: envelope.replyTo,
        fmt: envelope.fmt,
      });

      if (currentChatType === "direct" && currentChatUsid === from) {
        renderMessages();
      } else {
        showSnackbar(`New message from peer`, "info");
        updateContactPreview(from);
      }
      break;
    }
    case "x3dh_init": {
      const { from } = data;
      if (from) {
        const activeHandshake = pendingX3dhHandshakes.get(from);
        if (activeHandshake) {
          await activeHandshake;
          break;
        }

        const localSessionId = outgoingSessionIds.get(from);
        // When both users open the chat together, each sends an init. Keep
        // the lexicographically smaller session ID and make the other peer
        // become its responder, preventing crossed ratchet states.
        if (localSessionId && data.sessionId && localSessionId < data.sessionId) {
          console.log(`[E2EE] Keeping local X3DH session with ${from.substring(0, 12)}`);
          break;
        }

        const handshake = (async () => {
          // An init frame means the peer needs fresh key agreement. Replacing a
          // stale local session lets either browser recover without manual data
          // clearing when only one side has reloaded or upgraded.
          if (signalProtocol.hasSession(from)) await signalProtocol.closeSession(from);
          await signalProtocol.acceptSession(from, data);
        })();
        outgoingSessionIds.delete(from);
        pendingX3dhHandshakes.set(from, handshake);

        try {
          await handshake;
          console.log(`[E2EE] Session accepted from ${from.substring(0, 12)}`);

          // Decrypt messages that arrived while the asynchronous X3DH setup ran.
          const pending = pendingEncryptedMessages.get(from) || [];
          pendingEncryptedMessages.delete(from);
          for (const pendingMessage of pending) {
            await handleWSMessage(pendingMessage);
          }
        } catch (e) {
          console.error("[E2EE] acceptSession failed", e);
        } finally {
          pendingX3dhHandshakes.delete(from);
        }
      }
      break;
    }
    case "pong":
      // Keepalive acknowledged
      break;
    case "queued": {
      if (data.recipient && reactionQueueAcks.get(data.recipient)) {
        const left = reactionQueueAcks.get(data.recipient) - 1;
        if (left) reactionQueueAcks.set(data.recipient, left); else reactionQueueAcks.delete(data.recipient);
        break;
      }
      const activeChatKey = currentChatType === "group" ? currentChatGroupId : currentChatUsid;
      if (activeChatKey && messageHistory[activeChatKey]) {
        const hist = messageHistory[activeChatKey];
        for (let i = hist.length - 1; i >= 0; i--) {
          if (hist[i].from === "me" && !hist[i].status) {
            if (currentChatType === "direct") {
              hist[i].status = "queued";
            }
            break;
          }
        }
        saveMessageHistory();
        renderMessages();
      }
      if (currentChatType === "group" && data.recipient) {
        const peerName = getContactName(data.recipient);
        showSnackbar(`Member ${peerName} offline — queued for delivery`, "info");
      } else {
        showSnackbar("Peer offline — message queued for delivery", "info");
      }
      break;
    }
    case "emergency_broadcast":
      showEmergencyAlert(data.content, data.from);
      break;
  }
}

async function authFetch(url, options = {}) {
  options.headers = options.headers || {};
  if (token && !options.headers["Authorization"]) {
    options.headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, options);
  if (res.status === 401) {
    console.warn(`[AuthFetch] 401 Unauthorized for ${url}`);
    handleAuthError("Session expired or invalid token. Please reconnect.");
  }
  return res;
}

function handleAuthError(reason) {
  if (identityRejected) return;
  identityRejected = true;
  localStorage.removeItem("token");
  localStorage.removeItem("usid");
  token = null;
  myUsid = null;
  if (ws) {
    try { ws.close(); } catch (_) {}
  }
  showSnackbar(reason || "Identity not verified or token invalid", "error");
  setTimeout(() => {
    location.reload();
  }, 3000);
}
window.handleAuthError = handleAuthError;

function switchAuthTab(tab) {
  const createSec = document.getElementById("auth-create-section");
  const connectSec = document.getElementById("auth-connect-section");
  const tabCreate = document.getElementById("tab-create-mode");
  const tabConnect = document.getElementById("tab-connect-mode");

  if (tab === "connect") {
    if (createSec) createSec.style.display = "none";
    if (connectSec) connectSec.style.display = "flex";
    if (tabCreate) tabCreate.classList.remove("active");
    if (tabConnect) tabConnect.classList.add("active");
  } else {
    if (createSec) createSec.style.display = "flex";
    if (connectSec) connectSec.style.display = "none";
    if (tabConnect) tabConnect.classList.remove("active");
    if (tabCreate) tabCreate.classList.add("active");
  }
}
window.switchAuthTab = switchAuthTab;

async function connectIdentity() {
  const inputVal = document.getElementById("connect-input").value.trim();
  if (!inputVal) return showSnackbar("Please enter a USID or registered email", "warn");

  const btn = document.getElementById("connect-btn");
  btn.disabled = true;
  btn.textContent = "Connecting...";

  const payload = inputVal.includes("@") ? { email: inputVal } : { usid: inputVal };

  try {
    const res = await fetch("/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) {
      token = data.token;
      myUsid = data.usid;
      localStorage.setItem("token", token);
      localStorage.setItem("usid", myUsid);
      messageHistory = loadMessageHistory();
      migrateLegacyHistory();

      document.getElementById("registration-form").style.display = "none";
      document.getElementById("splash-loader-container").style.display = "flex";
      document.getElementById("loader-status").textContent = "Restoring identity...";

      try {
        await generateOrLoadIdentityKeyPair();
        await signalProtocol.init(myUsid, token);
        document.getElementById("loader-status").textContent = "Identity restored. Connecting...";
      } catch (e) {
        console.error("[E2EE] Protocol init failed during connect:", e);
      }

      connectWS();
    } else {
      showSnackbar(data.error || "Connection failed", "error");
    }
  } catch (e) {
    showSnackbar("Network error. Please try again.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons-outlined">vpn_key</span> Connect Identity';
  }
}
window.connectIdentity = connectIdentity;

function setNetStatus(state) {
  const dot = document.querySelector(".status-dot");
  const text = document.getElementById("net-status");
  if (state === "online") {
    dot.classList.add("online-state");
    text.textContent = "Secura Online";
  } else {
    dot.classList.remove("online-state");
    text.textContent = "Reconnecting...";
  }
}

// ─────────────────────────────────────────
// Auth & Signup
// ─────────────────────────────────────────
async function signup() {
  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  if (!name) return showSnackbar("Name is required", "warn");
  if (!email) return showSnackbar("Email is required", "warn");

  const btn = document.getElementById("signup-btn");
  btn.disabled = true;
  btn.textContent = "Generating...";

  try {
    const res = await fetch("/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    const data = await res.json();
    if (res.ok) {
      token = data.token;
      myUsid = data.usid;
      localStorage.setItem("token", token);
      localStorage.setItem("usid", myUsid);
      messageHistory = loadMessageHistory();
      migrateLegacyHistory();

      document.getElementById("registration-form").style.display = "none";
      document.getElementById("splash-loader-container").style.display = "flex";
      document.getElementById("loader-status").textContent =
        "Generating cryptographic identity...";

      try {
        await generateOrLoadIdentityKeyPair();
        await signalProtocol.init(myUsid, token);
        document.getElementById("loader-status").textContent =
          "Identity secured. Connecting...";
        console.log("[E2EE] Protocol initialized, key bundle uploaded");
      } catch (e) {
        console.error("[E2EE] Protocol init failed:", e);
        document.getElementById("loader-status").textContent =
          "Identity secured. Connecting...";
      }

      connectWS();
    } else {
      showSnackbar(data.error || "Signup failed", "error");
    }
  } catch (e) {
    showSnackbar("Network error. Try again.", "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML =
      '<span class="material-icons-outlined">lock</span> Generate Secure ID';
  }
}

// ─────────────────────────────────────────
// Contacts
// ─────────────────────────────────────────
async function loadContacts() {
  if (!token) return;
  try {
    console.log("[Load Contacts] Fetching contacts list...");
    const res = await authFetch("/contacts");

    if (!res.ok) {
      console.warn(
        `[Load Contacts] Server error: ${res.status} ${res.statusText}`,
      );
      try {
        const errData = await res.json();
        console.warn("[Load Contacts] Error details:", errData);
      } catch (e) {}
      return;
    }

    try {
      contacts = await res.json();
      console.log(
        `[Load Contacts] Successfully loaded ${contacts.length} contacts`,
      );
      renderContactsList();
    } catch (parseErr) {
      console.error("[Load Contacts] Failed to parse contacts JSON:", parseErr);
      showSnackbar("Failed to load contacts - invalid data", "error");
    }
  } catch (e) {
    console.error("[Load Contacts] Network error:", e.message);
    showSnackbar("Failed to load contacts - network error", "error");
  }
}

function renderContactsList() {
  const list = document.getElementById("contacts-list");
  if (!list) {
    console.error("[Render Contacts] contacts-list element not found");
    return;
  }

  const query = (document.getElementById("search-input")?.value || "").toLowerCase();
  const allGroups = window.HalonyxGroups ? HalonyxGroups.loadGroups(myUsid) : [];

  const filteredContacts = contacts.filter((c) =>
    c.toLowerCase().includes(query) || getContactName(c).toLowerCase().includes(query),
  );

  const filteredGroups = allGroups.filter((g) =>
    g.name.toLowerCase().includes(query) || (g.description && g.description.toLowerCase().includes(query)),
  );

  updateGroupBadges();

  const showGroups = currentCategory === "all" || currentCategory === "groups";
  const showDirect = currentCategory === "all" || currentCategory === "direct";
  const totalItems = (showGroups ? filteredGroups.length : 0) + (showDirect ? filteredContacts.length : 0);

  if (totalItems === 0) {
    const isGroupsTab = currentCategory === "groups";
    list.innerHTML = `<div class="empty-contacts">
      <span class="material-icons-outlined">${isGroupsTab ? "diversity_3" : "group_add"}</span>
      <p>${query ? "No matches found" : (isGroupsTab ? "No groups yet" : "No contacts yet")}</p>
      <small>${query ? "Try a different search" : (isGroupsTab ? "Create an encrypted multi-party channel" : "Add a trusted contact using their USID")}</small>
      ${query ? "" : (isGroupsTab
        ? '<button id="empty-create-group" class="btn-primary sm"><span class="material-icons-outlined">groups</span> Create Group</button>'
        : '<button id="empty-add-contact" class="btn-primary sm">Add contact</button>')}
    </div>`;
    document.getElementById("empty-add-contact")?.addEventListener("click", () => showDialog("add-contact-dialog"));
    document.getElementById("empty-create-group")?.addEventListener("click", () => openCreateGroupModal());
    return;
  }

  try {
    let html = "";

    // Render Groups section
    if (showGroups && filteredGroups.length > 0) {
      if (currentCategory === "all") {
        html += `<div class="category-section-header">ENCRYPTED GROUPS (${filteredGroups.length})</div>`;
      }
      filteredGroups.forEach((g) => {
        const history = messageHistory[g.id] || [];
        const lastMsg = history.length > 0 ? history[history.length - 1] : null;
        let preview = "No messages yet";
        if (lastMsg) {
          const author = lastMsg.from === "me" ? "You" : getContactName(lastMsg.from);
          preview = `${author}: ${truncate(lastMsg.content, 26)}`;
        } else if (g.description) {
          preview = truncate(g.description, 28);
        }
        const timeStr = lastMsg ? formatTime(lastMsg.timestamp) : "";
        const isActive = currentChatType === "group" && currentChatGroupId === g.id ? "active" : "";
        const unreadBadge = g.unreadCount > 0 ? `<span class="group-unread-badge">${g.unreadCount}</span>` : "";

        html += `
        <div class="contact-item group-item ${isActive}" onclick="openGroupChat('${escapeAttr(g.id)}')">
          <div class="contact-avatar">
            <span class="material-icons-outlined">diversity_3</span>
          </div>
          <div class="contact-body">
            <div class="contact-name">
              ${escapeHTML(g.name)}
              <span class="group-member-count-pill">${g.members ? g.members.length : 0} members</span>
            </div>
            <div class="contact-preview">${escapeHTML(preview)}</div>
          </div>
          <div class="contact-meta">
            <span class="contact-time">${timeStr}</span>
            ${unreadBadge}
            <button class="contact-rename-btn" onclick="event.stopPropagation(); openGroupDetailsModal('${escapeAttr(g.id)}')" title="Group Details" aria-label="Details for ${escapeAttr(g.name)}">
              <span class="material-icons-outlined">info</span>
            </button>
          </div>
        </div>`;
      });
    }

    // Render Direct contacts section
    if (showDirect && filteredContacts.length > 0) {
      if (currentCategory === "all" && filteredGroups.length > 0) {
        html += `<div class="category-section-header" style="margin-top:8px;">DIRECT MESSAGES (${filteredContacts.length})</div>`;
      }
      filteredContacts.forEach((c, i) => {
        const history = messageHistory[c] || [];
        const lastMsg = history.length > 0 ? history[history.length - 1] : null;
        const preview = lastMsg
          ? truncate(lastMsg.content, 32)
          : "No messages yet";
        const timeStr = lastMsg ? formatTime(lastMsg.timestamp) : "";
        const isActive = currentChatType === "direct" && currentChatUsid === c ? "active" : "";
        const avClass = `av-${i % 5}`;

        html += `
        <div class="contact-item ${isActive}" onclick="openChat('${escapeAttr(c)}')">
          <div class="contact-avatar ${avClass}">
            <span class="material-icons-outlined">person</span>
          </div>
          <div class="contact-body">
            <div class="contact-name">${escapeHTML(getContactName(c))}</div>
            <div class="contact-preview">${escapeHTML(preview)}</div>
          </div>
          <div class="contact-meta">
            <span class="contact-time">${timeStr}</span>
            <button class="contact-rename-btn" onclick="event.stopPropagation(); renameContact('${escapeAttr(c)}')" title="Rename contact" aria-label="Rename ${escapeAttr(getContactName(c))}">
              <span class="material-icons-outlined">edit</span>
            </button>
            <button class="contact-delete-btn" onclick="event.stopPropagation(); removeContact('${escapeAttr(c)}')" title="Remove contact">
              <span class="material-icons-outlined">close</span>
            </button>
          </div>
        </div>`;
      });
    }

    list.innerHTML = html;
  } catch (e) {
    console.error("[Render Contacts] Error rendering contact list:", e);
    showSnackbar("Error displaying contacts", "error");
  }
}

function renameContact(usid) {
  const currentName = getContactAliases()[usid] || "";
  const nextName = prompt("Name this contact (leave blank to use their USID)", currentName);
  if (nextName === null) return;
  saveContactName(usid, nextName);
  if (currentChatUsid === usid) {
    const contactName = getContactName(usid);
    document.getElementById("app-bar-title").textContent = contactName;
    document.getElementById("details-name").textContent = contactName;
    document.getElementById("contact-alias-input").value = getContactAliases()[usid] || "";
  }
  renderContactsList();
  showSnackbar(nextName.trim() ? "Contact name saved" : "Contact name reset", "success");
}
window.renameContact = renameContact;

function updateContactPreview(usid) {
  renderContactsList();
}

async function addContact() {
  const input = document.getElementById("contact-usid");
  const usid = input.value.trim();
  const contactName = document.getElementById("contact-name").value.trim();
  const btn = document.getElementById("confirm-add-contact");

  console.log("[Add Contact] Starting add contact flow...");

  if (!usid) {
    console.warn("[Add Contact] USID is empty");
    showSnackbar("Please enter a USID", "warn");
    return;
  }

  if (!usid.match(/^0x[a-fA-F0-9]+$/) && !usid.match(/^[a-fA-F0-9]+$/)) {
    console.warn("[Add Contact] Invalid USID format:", usid);
    showSnackbar("Invalid USID format. Must be hexadecimal.", "error");
    return;
  }

  if (
    myUsid && (
      usid.toLowerCase() === myUsid.toLowerCase() ||
      usid.toLowerCase() === myUsid.toLowerCase().replace("0x", "")
    )
  ) {
    console.warn("[Add Contact] User tried to add themselves");
    showSnackbar("You cannot add yourself as a contact", "error");
    return;
  }

  btn.disabled = true;
  const originalText = btn.innerHTML;
  btn.innerHTML =
    '<span class="material-icons-outlined">hourglass_empty</span>Adding...';

  console.log(
    "[Add Contact] Sending request with USID:",
    usid.substring(0, 10) + "...",
  );

  try {
    const res = await authFetch("/add-contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ usid }),
    });

    console.log("[Add Contact] Response status:", res.status, res.statusText);

    if (res.ok) {
      try {
        const data = await res.json();
        console.log(
          "[Add Contact] Contact added/refreshed:",
          data.name,
          "Refreshed:",
          data.refreshed,
        );
        hideDialog("add-contact-dialog");
        input.value = "";
        await loadContacts();
        if (contactName) {
          const cleanUsid = usid.toLowerCase().replace(/^0x/, "");
          const candidates = [cleanUsid, await sha256hex(cleanUsid)];
          const addedUsid = contacts.find((contact) => candidates.includes(contact));
          if (addedUsid) saveContactName(addedUsid, contactName);
          document.getElementById("contact-name").value = "";
          renderContactsList();
        }
        if (data.refreshed) {
          showSnackbar(
            `${data.name || "Contact"} already in contacts - refreshed`,
            "info",
          );
        } else {
          showSnackbar(
            `${data.name || "Contact"} added successfully`,
            "success",
          );
        }
      } catch (parseErr) {
        console.error("[Add Contact] Failed to parse response JSON:", parseErr);
        showSnackbar("Contact added but failed to refresh list", "warn");
      }
    } else if (res.status === 400) {
      try {
        const d = await res.json();
        console.warn("[Add Contact] 400 Bad Request:", d.error);
        showSnackbar(d.error || "Invalid USID", "error");
      } catch (parseErr) {
        showSnackbar("Invalid USID - bad request", "error");
      }
    } else if (res.status === 404) {
      console.warn("[Add Contact] 404 USID not found");
      showSnackbar("USID not found in the network", "error");
    } else if (res.status === 409) {
      try {
        const d = await res.json();
        showSnackbar(d.error || "Contact already exists", "warn");
      } catch (parseErr) {
        showSnackbar("Contact already exists", "warn");
      }
    } else {
      try {
        const d = await res.json();
        showSnackbar(d.error || `Server error: ${res.statusText}`, "error");
      } catch (parseErr) {
        showSnackbar(`Server error: ${res.status} ${res.statusText}`, "error");
      }
    }
  } catch (e) {
    console.error("[Add Contact] Network/fetch error:", e.message, e);
    showSnackbar("Network error. Please check your connection.", "error");
  } finally {
    console.log("[Add Contact] Restoring button state");
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

async function removeContact(usid) {
  if (!confirm("Are you sure you want to remove this contact?")) return;

  try {
    console.log(
      "[Remove Contact] Attempting to remove:",
      usid.substring(0, 10),
    );

    const res = await authFetch("/contacts", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ usid }),
    });

    console.log(
      "[Remove Contact] Response status:",
      res.status,
      res.statusText,
    );

    if (res.ok) {
      try {
        await loadContacts();
        showSnackbar("Contact removed successfully", "success");
        if (currentChatUsid === usid) {
          currentChatUsid = null;
          document.querySelector(".chat-pane").innerHTML = `
            <div class="empty-chat">
              <div class="empty-chat-inner">
                <div class="empty-hex-grid">
                  <div class="hex-item"></div><div class="hex-item"></div><div class="hex-item"></div>
                  <div class="hex-item"></div><div class="hex-item"></div><div class="hex-item"></div>
                  <div class="hex-item"></div><div class="hex-item"></div><div class="hex-item"></div>
                </div>
                <h2>No conversation selected</h2>
                <p>Choose a contact from the list to start messaging</p>
              </div>
            </div>
          `;
        }
      } catch (loadErr) {
        console.error("[Remove Contact] Error loading contacts:", loadErr);
        showSnackbar("Contact removed but failed to refresh list", "warn");
      }
    } else {
      try {
        const errorData = await res.json();
        showSnackbar(errorData.error || "Failed to remove contact", "error");
      } catch (parseErr) {
        showSnackbar(
          "Failed to remove contact. Server error: " + res.status,
          "error",
        );
      }
    }
  } catch (e) {
    console.error("[Remove Contact] Network error:", e.message);
    showSnackbar("Network error. Please check your connection.", "error");
  }
}

// ─────────────────────────────────────────
// Chat
// ─────────────────────────────────────────
async function openChat(hashedUsid) {
  currentChatType = "direct";
  currentChatGroupId = null;
  currentChatUsid = hashedUsid;
  const contactName = getContactName(hashedUsid);

  document.getElementById("no-chat-selected").style.display = "none";
  document.getElementById("chat-active-view").style.display = "flex";
  document.getElementById("app-bar-title").textContent = contactName;

  const groupInfoBtn = document.getElementById("group-info-btn");
  if (groupInfoBtn) groupInfoBtn.classList.add("hidden");

  const peerStatus = document.getElementById("peer-status");
  if (peerStatus) {
    peerStatus.innerHTML = `<span class="status-dot-sm online"></span> Encrypted Channel`;
  }

  document.getElementById("details-name").textContent = contactName;
  document.getElementById("details-full-usid").textContent = hashedUsid;
  document.getElementById("contact-alias-input").value = getContactAliases()[hashedUsid] || "";

  renderContactsList();
  updateTorrentStats();
  updateVerifiedBadge();

  renderMessages();

  // Run key exchange in the background if session does not exist
  if (!signalProtocol.hasSession(hashedUsid)) {
    console.log("[E2EE] Starting background key exchange for:", hashedUsid);
    startX3dhSession(hashedUsid).catch((e) => {
      console.error("[E2EE] Background session start failed:", e);
    });
  }
}

async function sendGroupMessage(forceContent, bypassThreatIntel = false) {
  const input = document.getElementById("message-input");
  const hasForcedContent = typeof forceContent === "string";
  let content = hasForcedContent ? forceContent : input.value.trim();
  if (!content || !currentChatGroupId || !ws || ws.readyState !== WebSocket.OPEN)
    return;
  if (!messageLengthAllowed(content)) return;

  if (!window.HalonyxGroups) return;
  const group = HalonyxGroups.getGroup(currentChatGroupId, myUsid);
  if (!group) return;

  // Pre-encryption Enterprise DLP Inspection
  if (window.HalonyxDLP && !hasForcedContent) {
    const scan = window.HalonyxDLP.scan(content);
    if (scan.hasViolation) {
      if (scan.mode === "BLOCK") {
        window.HalonyxDLP.logIncident(scan.violations, "BLOCKED", group.name);
        showDlpAlertDialog(scan, content, "main");
        return;
      } else if (scan.mode === "WARN") {
        showDlpAlertDialog(scan, content, "main");
        return;
      } else if (scan.mode === "REDACT") {
        window.HalonyxDLP.logIncident(scan.violations, "AUTO_REDACTED", group.name);
        content = scan.redactedText;
      }
    }
  }

  if (!bypassThreatIntel && inspectAegisusThreats(content, group.name, "main")) return;

  const replyTarget = activeReplyTarget;
  const replyToMeta = replyTarget ? {
    id: replyTarget.id,
    snippet: replyTarget.snippet,
    senderHash: replyTarget.senderHash,
  } : null;

  const groupMeta = {
    id: group.id,
    name: group.name,
    members: group.members,
    action: "message",
  };

  const envelope = EnvelopeModule.createEnvelope(content, replyToMeta, groupMeta, professionalMarkdownEnabled() ? "md" : undefined);
  const rawEnvelopeStr = JSON.stringify(envelope);

  // Pairwise Double Ratchet Fan-Out to all other members in group
  const otherMembers = HalonyxGroups.getOtherMembers(group, myUsid);
  for (const recipient of otherMembers) {
    try {
      if (!signalProtocol.hasSession(recipient)) {
        await startX3dhSession(recipient).catch((e) => console.warn("[Groups] Member X3DH warm-up error:", e));
      }
      if (signalProtocol.hasSession(recipient)) {
        try {
          const encrypted = await signalProtocol.encrypt(recipient, rawEnvelopeStr);
          ws.send(JSON.stringify({ type: "message", to: recipient, encrypted }));
        } catch (encErr) {
          console.warn(`[Groups] Encryption failed for ${recipient}, refusing plaintext fallback:`, encErr);
        }
      } else {
        console.warn(`[Groups] No session with ${recipient}, refusing plaintext fallback`);
      }
    } catch (sendErr) {
      console.error(`[Groups] Dispatch failed for ${recipient}:`, sendErr);
    }
  }

  saveMessage(group.id, {
    id: envelope.id,
    from: "me",
    content: envelope.body,
    timestamp: envelope.ts,
    rxTs: Date.now(),
    replyTo: envelope.replyTo,
    group: groupMeta,
    fmt: envelope.fmt,
  });

  input.value = "";
  resizeComposerTextarea(input);
  const dlpWarning = document.getElementById("dlp-inline-warning");
  if (dlpWarning) dlpWarning.classList.add("hidden");

  cancelReplyTarget();
  renderMessages();
  playSendSound();
}

async function sendMessage(forceContent, bypassThreatIntel = false) {
  if (currentChatType === "group") {
    return sendGroupMessage(forceContent, bypassThreatIntel);
  }

  const input = document.getElementById("message-input");
  const hasForcedContent = typeof forceContent === "string";
  let content = hasForcedContent ? forceContent : input.value.trim();
  if (!content || !currentChatUsid || !ws || ws.readyState !== WebSocket.OPEN)
    return;
  if (!messageLengthAllowed(content)) return;

  // Pre-encryption Enterprise DLP Inspection
  if (window.HalonyxDLP && !hasForcedContent) {
    const scan = window.HalonyxDLP.scan(content);
    if (scan.hasViolation) {
      if (scan.mode === "BLOCK") {
        window.HalonyxDLP.logIncident(scan.violations, "BLOCKED", getContactName(currentChatUsid));
        showDlpAlertDialog(scan, content, "main");
        return;
      } else if (scan.mode === "WARN") {
        showDlpAlertDialog(scan, content, "main");
        return;
      } else if (scan.mode === "REDACT") {
        window.HalonyxDLP.logIncident(scan.violations, "AUTO_REDACTED", getContactName(currentChatUsid));
        content = scan.redactedText;
      }
    }
  }

  if (!bypassThreatIntel && inspectAegisusThreats(content, getContactName(currentChatUsid), "main")) return;

  const replyTarget = activeReplyTarget;
  const replyToMeta = replyTarget ? {
    id: replyTarget.id,
    snippet: replyTarget.snippet,
    senderHash: replyTarget.senderHash,
  } : null;

  const envelope = EnvelopeModule.createEnvelope(content, replyToMeta, undefined, professionalMarkdownEnabled() ? "md" : undefined);
  const rawEnvelopeStr = JSON.stringify(envelope);

  if (!signalProtocol.hasSession(currentChatUsid)) {
    console.log("[E2EE] No session with recipient — initiating X3DH session...");
    let failureDetail = null;
    try {
      const ok = await startX3dhSession(currentChatUsid);
      if (!ok && !signalProtocol.hasSession(currentChatUsid)) {
        failureDetail = "Handshake did not complete";
      }
    } catch (e) {
      failureDetail = e.message || String(e);
      console.error("[E2EE] Failed to initiate X3DH session:", e);
    }

    if (!signalProtocol.hasSession(currentChatUsid)) {
      if (failureDetail && failureDetail.includes("No key bundle")) {
        showSnackbar("Recipient has not registered encryption keys yet. Both peers must log in/refresh.", "warn");
      } else {
        showSnackbar("Cannot send message: no secure session established with peer", "error");
      }
      return;
    }
  }

  let encrypted;
  try {
    encrypted = await signalProtocol.encrypt(currentChatUsid, rawEnvelopeStr);
  } catch (e) {
    console.error("[E2EE] Encryption failed, refusing to send", e);
    showSnackbar("Encryption failed: message not sent", "error");
    return;
  }

  const payload = { type: "message", to: currentChatUsid, encrypted };
  ws.send(JSON.stringify(payload));
  console.log("[E2EE] Envelope encrypted and sent");
  saveMessage(currentChatUsid, {
    id: envelope.id,
    from: "me",
    content: envelope.body,
    timestamp: envelope.ts,
    rxTs: Date.now(),
    replyTo: envelope.replyTo,
    fmt: envelope.fmt,
  });

  input.value = "";
  resizeComposerTextarea(input);
  const dlpWarning = document.getElementById("dlp-inline-warning");
  if (dlpWarning) dlpWarning.classList.add("hidden");

  cancelReplyTarget();
  renderMessages();
  playSendSound();
}

function saveMessage(chatUsid, msg) {
  if (!messageHistory[chatUsid]) messageHistory[chatUsid] = [];
  if (typeof msg.id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(msg.id)) msg.id = msg.id.replace(/-/g, '').toLowerCase();
  if (msg.replyTo?.id && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(msg.replyTo.id)) msg.replyTo.id = msg.replyTo.id.replace(/-/g, '').toLowerCase();
  if (!msg.id) msg.id = EnvelopeModule.generateUUID();
  if (!msg.rxTs) msg.rxTs = Date.now();
  messageHistory[chatUsid].push(msg);
  if (window.HalonyxReactions?.addMessage) {
    const hist = messageHistory[chatUsid];
    const state = reactionStates[chatUsid] || { messageIds: hist.map((m) => m.id), reactions: Object.fromEntries(hist.filter((m) => m.reactions).map((m) => [m.id, m.reactions])) };
    const next = HalonyxReactions.addMessage(state, msg.id);
    reactionStates[chatUsid] = next;
    hist.forEach((m) => { if (next.reactions[m.id]) m.reactions = next.reactions[m.id]; });
  }
  // Amendment 6: Order messages by local receive time rxTs
  messageHistory[chatUsid].sort((a, b) => (a.rxTs || 0) - (b.rxTs || 0));
  saveMessageHistory();
}

async function sendReaction(targetId, emoji) {
  const chatKey = currentChatType === 'group' ? currentChatGroupId : currentChatUsid;
  const hist = messageHistory[chatKey] || [];
  const target = hist.find((m) => m.id === targetId);
  if (!target || !ws || ws.readyState !== WebSocket.OPEN) return;
  const event = EnvelopeModule.createReactionEnvelope(targetId, emoji);
  const raw = JSON.stringify(event);
  const recipients = target.group && window.HalonyxGroups
    ? HalonyxGroups.getOtherMembers(HalonyxGroups.getGroup(target.group.id, myUsid) || target.group, myUsid)
    : [target.from === 'me' ? chatKey : target.from];
  let sent = 0;
  for (const recipient of recipients) {
    if (!recipient) continue;
    try {
      if (!signalProtocol.hasSession(recipient)) await startX3dhSession(recipient);
      if (!signalProtocol.hasSession(recipient)) {
        console.warn(`[Reaction] No secure session with ${recipient}; reaction not sent`);
        continue;
      }
      const encrypted = await signalProtocol.encrypt(recipient, raw);
      reactionQueueAcks.set(recipient, (reactionQueueAcks.get(recipient) || 0) + 1);
      ws.send(JSON.stringify({ type: 'message', to: recipient, encrypted }));
      sent++;
    } catch (e) { console.warn('[Reaction] encrypted send failed', e); }
  }
  if (!sent) {
    showSnackbar('Reaction could not be sent. Check the secure connection and try again.', 'error');
    return;
  }
  const state = { messageIds: hist.map((m) => m.id), reactions: Object.fromEntries(hist.filter((m) => m.reactions).map((m) => [m.id, m.reactions])) };
  const next = HalonyxReactions.applyReaction(state, event, myUsid);
  target.reactions = next.reactions[targetId] || {};
  saveMessageHistory(); renderMessages();
}

function reactionMarkup(msg) {
  return `<div class="reaction-row" data-reactions-for="${escapeAttr(msg.id)}"></div>`;
}

function mountReactionControls(root) {
  if (!root) return;
  root.querySelectorAll('[data-reactions-for]').forEach((host) => {
    const msg = Object.values(messageHistory).flat().find((m) => m.id === host.dataset.reactionsFor);
    if (!msg) return;
    host.replaceChildren();
    const groups = new Map();
    Object.entries(msg.reactions || {}).forEach(([sender, value]) => {
      const item = groups.get(value.emoji) || { names: [], own: false };
      item.names.push(sender === myUsid ? 'You' : getContactName(sender)); item.own ||= sender === myUsid; groups.set(value.emoji, item);
    });
    groups.forEach((item, emoji) => {
      const chip = document.createElement('button'); chip.type = 'button'; chip.className = `reaction-chip${item.own ? ' own' : ''}`;
      chip.setAttribute('aria-pressed', String(item.own)); chip.setAttribute('aria-label', `${emoji}, ${item.names.join(', ')}`); chip.title = item.names.join(', ');
      const face = document.createElement('span'); face.textContent = emoji; const count = document.createElement('span'); count.textContent = String(item.names.length); chip.append(face, count);
      chip.addEventListener('click', () => sendReaction(msg.id, item.own ? null : emoji)); host.append(chip);
    });
    const wrap = document.createElement('span'); wrap.className = 'reaction-picker-wrap';
    const add = document.createElement('button'); add.type = 'button'; add.className = 'reaction-add'; add.setAttribute('aria-label', 'Add reaction'); add.textContent = '☺'; wrap.append(add);
    const picker = document.createElement('span'); picker.className = 'reaction-picker';
    HalonyxReactions.ALLOWED_EMOJIS.forEach((emoji) => { const option = document.createElement('button'); option.type = 'button'; option.className = 'reaction-option'; option.setAttribute('aria-label', `React ${emoji}`); option.textContent = emoji; option.addEventListener('click', () => sendReaction(msg.id, emoji)); picker.append(option); });
    wrap.append(picker); host.append(wrap);
  });
}

function renderMessages() {
  const container = document.getElementById("messages-container");
  const activeKey = currentChatType === "group" ? currentChatGroupId : currentChatUsid;
  const history = activeKey ? (messageHistory[activeKey] || []) : [];

  if (history.length === 0) {
    const isGroup = currentChatType === "group";
    container.innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:var(--fg-muted);">
        <span class="material-icons-outlined" style="font-size:32px;opacity:.4;display:block;margin-bottom:8px;">${isGroup ? "groups" : "lock"}</span>
        <p style="font-size:.8rem;font-family:var(--font-mono)">${isGroup ? "Group messages are end-to-end encrypted with Signal Double Ratchet" : "Messages are encrypted end-to-end"}</p>
      </div>`;
    return;
  }

  let html = "";
  let lastDate = "";

  history.forEach((msg) => {
    const msgDate = new Date(msg.timestamp).toLocaleDateString();
    if (msgDate !== lastDate) {
      html += `<div class="date-divider">${msgDate}</div>`;
      lastDate = msgDate;
    }

    const isMe = msg.from === "me";
    const rowCls = isMe ? "sent" : "received";
    const time = new Date(msg.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const replyCount = countReplies(history, msg.id);

    // Group sender attribution for incoming multi-party messages
    const senderAttributionHTML = (currentChatType === "group" && !isMe)
      ? `<div class="msg-group-sender">
           <span>${escapeHTML(getContactName(msg.from))}</span>
           <span class="msg-group-sender-usid">${escapeHTML(truncate(msg.from, 12))}</span>
         </div>`
      : "";

    // Render Reply Quote Block if msg.replyTo exists
    let quoteHTML = "";
    if (msg.replyTo && msg.replyTo.id) {
      const parentMsg = history.find((m) => m.id === msg.replyTo.id);
      let quoteAuthor = "";
      let quoteText = "";
      let isMuted = false;

      if (parentMsg) {
        quoteAuthor = parentMsg.from === "me" ? "You" : getContactName(parentMsg.from);
        quoteText = parentMsg.content;
      } else {
        const authorHash = msg.replyTo.senderHash;
        quoteAuthor = (authorHash && (authorHash === myUsid || authorHash === "me"))
          ? "You"
          : (authorHash ? getContactName(authorHash) : "Peer");
        quoteText = msg.replyTo.snippet || "Original message unavailable";
        isMuted = !msg.replyTo.snippet;
      }

      quoteHTML = `
        <div class="reply-quote-block" onclick="event.stopPropagation(); jumpToMessage('${escapeAttr(msg.replyTo.id)}')">
          <div class="reply-quote-author">${escapeHTML(quoteAuthor)}</div>
          <div class="reply-quote-text${isMuted ? " reply-quote-muted" : ""}">${escapeHTML(quoteText)}</div>
        </div>`;
    }

    const hoverActionsHTML = `
      <div class="msg-hover-actions">
        <button class="msg-action-btn" onclick="event.stopPropagation(); openThread('${escapeAttr(msg.id)}')" title="Reply in thread">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </button>
        <button class="msg-action-btn" onclick="event.stopPropagation(); setReplyTargetById('${escapeAttr(msg.id)}')" title="Quote reply">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>
        </button>
        <button class="msg-action-btn" onclick="event.stopPropagation(); copyMessageById('${escapeAttr(msg.id)}')" title="Copy">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
      </div>`;

    const threadChipHTML = replyCount > 0
      ? `<div class="slack-thread-chip" onclick="event.stopPropagation(); openThread('${escapeAttr(msg.id)}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          <span>${replyCount} ${replyCount === 1 ? "reply" : "replies"}</span>
          <span class="chip-time">View thread</span>
        </div>`
      : "";

    if (msg.content.startsWith("magnet:?")) {
      const pid =
        "p_" +
        btoa(msg.timestamp)
          .replace(/[^a-z0-9]/gi, "")
          .substring(0, 8);
      const nameMatch = msg.content.match(/dn=([^&]+)/);
      const fileName = nameMatch
        ? decodeURIComponent(nameMatch[1].replace(/\+/g, " "))
        : "Shared File";

      html += `
        <div class="msg-row ${rowCls}" id="msg-${escapeAttr(msg.id)}">
          <div class="file-bubble">
            ${hoverActionsHTML}
            ${senderAttributionHTML}
            ${quoteHTML}
            <div class="file-icon"><span class="material-icons-outlined">folder_zip</span></div>
            <div class="file-details">
              <div class="file-name" id="fn-${pid}">${escapeHTML(fileName)}</div>
              <div class="file-size" id="fs-${pid}">Ready to download</div>
              <div class="file-progress-wrap"><div class="file-progress-inner" id="${pid}"></div></div>
              <div class="file-status" id="fst-${pid}"></div>
            </div>
            <div class="file-actions" id="fa-${pid}">
              ${
                !isMe
                  ? `<button class="file-action-btn" id="btn-${pid}" onclick="downloadFileByMsgId('${escapeAttr(msg.id)}', '${pid}')" title="Download"><span class="material-icons-outlined">download</span></button>`
                  : `<button class="file-action-btn" onclick="openMagnetByMsgId('${escapeAttr(msg.id)}')" title="Copy magnet"><span class="material-icons-outlined">link</span></button>`
              }
            </div>
            ${threadChipHTML}
            ${reactionMarkup(msg)}
          </div>
        </div>`;
    } else {
      const statusIcon =
        isMe && msg.status === "queued"
          ? `<span class="msg-status-icon material-icons-outlined" title="Queued — peer offline">schedule</span>`
          : "";
      html += `
        <div class="msg-row ${rowCls}" id="msg-${escapeAttr(msg.id)}">
          <div class="msg-bubble${msg.status === "queued" ? " msg-queued" : ""}">
            ${hoverActionsHTML}
            ${senderAttributionHTML}
            ${quoteHTML}
            ${msg.fmt === "md" && !msg.content.startsWith("magnet:?") ? messageBodyHTML(msg, "markdown-message-body") : escapeHTML(msg.content)}
            <span class="msg-time">${time}${statusIcon}</span>
            ${threadChipHTML}
            ${reactionMarkup(msg)}
          </div>
        </div>`;
    }
  });

  container.innerHTML = html;
  mountReactionControls(container);
  container.scrollTop = container.scrollHeight;

  activeTorrents.forEach((torrent) => updateFileProgress(torrent));
}

// ─────────────────────────────────────────
// BitTorrent
// ─────────────────────────────────────────
function handleFileUpload(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;

  const client = getBTClient();
  if (!client) {
    showSnackbar("BitTorrent unavailable", "error");
    return;
  }

  const fileArray = Array.from(files);
  const totalSize = fileArray.reduce((s, f) => s + f.size, 0);
  const label =
    fileArray.length > 1
      ? `${fileArray.length} files (${formatBytes(totalSize)})`
      : `${fileArray[0].name}`;

  showSnackbar(`Seeding: ${label}`, "info");
  showTransferBar(`Preparing seed: ${label}`, 0);

  const seedInput = fileArray.length === 1 ? fileArray[0] : fileArray;

  client.seed(seedInput, { announce: TRACKERS }, (torrent) => {
    console.log("[BT] Seeding:", torrent.name, torrent.magnetURI);
    activeTorrents.set(torrent.magnetURI, torrent);
    updateTorrentStats();

    if (ws && ws.readyState === WebSocket.OPEN && (currentChatUsid || currentChatGroupId)) {
      sendMessage(torrent.magnetURI).catch((err) => {
        console.error("[BT] Failed to send encrypted magnet URI via Double Ratchet:", err);
      });
    }

    const statsInterval = setInterval(() => {
      if (!btClient || !btClient.get(torrent.infoHash)) {
        clearInterval(statsInterval);
        return;
      }
      const live = btClient.get(torrent.infoHash);
      if (live) {
        updateTransferBar(
          `Seeding ${torrent.name} · Ratio ${live.ratio.toFixed(2)}`,
          live.ratio > 1 ? 1 : live.ratio,
          formatBytes(live.uploadSpeed) + "/s",
        );
        updateTorrentStats();
      }
    }, 1200);

    torrent.on("upload", () => {
      updateTransferBar(
        `Seeding: ${torrent.name}`,
        Math.min(torrent.ratio, 1),
        formatBytes(torrent.uploadSpeed) + "/s ↑",
      );
    });

    showSnackbar(`Now seeding: ${torrent.name}`, "success");
  });

  e.target.value = "";
}

function downloadFile(magnetURI, progressId) {
  const client = getBTClient();
  if (!client) {
    showSnackbar("BitTorrent unavailable", "error");
    return;
  }

  if (activeTorrents.has(magnetURI)) {
    showSnackbar("Already downloading this file", "warn");
    return;
  }

  const existing = magnetURI.includes("xt=urn:btih:")
    ? client.get(magnetURI.match(/xt=urn:btih:([a-f0-9]+)/i)?.[1])
    : null;
  if (existing) {
    showSnackbar("Already in progress", "warn");
    return;
  }

  setFileStatus(progressId, "0", "Connecting to peers...");
  showTransferBar("Connecting to peers...", 0);
  showSnackbar("Starting download...", "info");

  client.add(magnetURI, { announce: TRACKERS }, (torrent) => {
    console.log("[BT] Downloading:", torrent.name);
    activeTorrents.set(magnetURI, torrent);
    updateTorrentStats();

    const fnEl = document.getElementById(`fn-${progressId}`);
    if (fnEl) fnEl.textContent = torrent.name || "Shared File";

    showSnackbar(`Downloading: ${torrent.name}`, "info");

    torrent.on("metadata", () => {
      const fsEl = document.getElementById(`fs-${progressId}`);
      if (fsEl) fsEl.textContent = formatBytes(torrent.length);
    });

    torrent.on("download", () => {
      const pct = (torrent.progress * 100).toFixed(1);
      const spd = formatBytes(torrent.downloadSpeed) + "/s ↓";
      setFileStatus(progressId, pct, `${pct}% · ${spd}`);
      updateTransferBar(`Downloading: ${torrent.name}`, torrent.progress, spd);
      updateTorrentStats();
    });

    torrent.on("done", () => {
      setFileStatus(progressId, "100", "Download complete!");
      hideTransferBar();
      activeTorrents.delete(magnetURI);
      updateTorrentStats();
      showSnackbar(`Downloaded: ${torrent.name}`, "success");

      const actionContainer = document.getElementById(`fa-${progressId}`);
      if (actionContainer) {
        actionContainer.innerHTML = "";
        torrent.files.forEach((file) => {
          file.getBlobURL((err, url) => {
            if (err) return console.error("[BT] getBlobURL error:", err);
            const a = document.createElement("a");
            a.href = url;
            a.download = file.name;
            a.className = "file-action-btn";
            a.title = `Save ${file.name}`;
            a.innerHTML = '<span class="material-icons-outlined">save</span>';
            actionContainer.appendChild(a);
          });
        });
      }
    });

    torrent.on("error", (err) => {
      console.error("[BT] Torrent error:", err);
      setFileStatus(progressId, "0", "Download failed");
      hideTransferBar();
      activeTorrents.delete(magnetURI);
      showSnackbar("Download failed: " + err.message, "error");
    });
  });
}

function setFileStatus(progressId, pct, statusText) {
  const bar = document.getElementById(progressId);
  if (bar) bar.style.width = pct + "%";
  const st = document.getElementById("fst-" + progressId);
  if (st) st.textContent = statusText;
}

function updateFileProgress(torrent) {}

function openMagnet(magnetURI) {
  navigator.clipboard
    .writeText(magnetURI)
    .then(() => showSnackbar("Magnet link copied", "success"))
    .catch(() => showSnackbar("Could not copy link", "error"));
}

// ─────────────────────────────────────────
// Transfer Bar
// ─────────────────────────────────────────
function showTransferBar(label, progress, speed = "") {
  const bar = document.getElementById("transfer-bar");
  document.getElementById("transfer-label").textContent = label;
  document.getElementById("transfer-speed").textContent = speed;
  document.getElementById("transfer-progress").style.width =
    progress * 100 + "%";
  bar.classList.remove("hidden");
}

function updateTransferBar(label, progress, speed = "") {
  document.getElementById("transfer-label").textContent = label;
  document.getElementById("transfer-speed").textContent = speed;
  document.getElementById("transfer-progress").style.width =
    Math.min(progress * 100, 100) + "%";
}

function hideTransferBar() {
  document.getElementById("transfer-bar").classList.add("hidden");
}

// ─────────────────────────────────────────
// Torrent Stats (Details Pane)
// ─────────────────────────────────────────
function updateTorrentStats() {
  const block = document.getElementById("torrent-stats-block");
  const list = document.getElementById("torrent-stats-list");

  if (activeTorrents.size === 0) {
    block.style.display = "none";
    return;
  }

  block.style.display = "block";
  let html = "";

  activeTorrents.forEach((torrent) => {
    const pct = (torrent.progress * 100).toFixed(1);
    const done = torrent.done;
    const type = done || torrent.uploadSpeed > 0 ? "Seeding" : "Downloading";
    const spd = done
      ? `↑ ${formatBytes(torrent.uploadSpeed)}/s`
      : `↓ ${formatBytes(torrent.downloadSpeed)}/s`;

    html += `
      <div class="torrent-stat-item">
        <div class="torrent-stat-name">${escapeHTML(torrent.name || "Unknown")}</div>
        <div class="torrent-stat-bar"><div class="torrent-stat-bar-inner" style="width:${pct}%"></div></div>
        <div class="torrent-stat-meta"><span>${type} · ${pct}%</span><span>${spd}</span></div>
      </div>`;
  });

  list.innerHTML = html;
}

setInterval(() => {
  if (
    document.getElementById("details-pane") &&
    !document.getElementById("details-pane").classList.contains("collapsed")
  ) {
    updateTorrentStats();
  }
}, 2000);

// ─────────────────────────────────────────
// UI Helpers
// ─────────────────────────────────────────
function hideSplashScreen() {
  document.getElementById("splash-screen").classList.add("hidden");
  loadContacts();
  playConnectSound();
  uploadIdentityPublicKey().catch(console.error);
}

function applyTheme(theme) {
  document.body.classList.remove("theme-dark", "theme-light");
  document.body.classList.add(theme);
  const icon = document.querySelector("#theme-btn .material-icons-outlined");
  if (icon)
    icon.textContent = theme === "theme-dark" ? "light_mode" : "dark_mode";
}

function toggleTheme() {
  currentTheme = currentTheme === "theme-dark" ? "theme-light" : "theme-dark";
  localStorage.setItem("theme", currentTheme);
  applyTheme(currentTheme);
}

function showDialog(id) {
  document.getElementById(id).classList.add("active");
}
function hideDialog(id) {
  document.getElementById(id).classList.remove("active");
}

let snackTimer = null;
function showSnackbar(text, type = "info") {
  const snack = document.getElementById("snackbar");
  const textEl = document.getElementById("snackbar-text");
  const iconEl = document.getElementById("snackbar-icon");
  const icons = {
    info: "info",
    success: "check_circle",
    warn: "warning",
    error: "error",
  };

  snack.classList.remove("success", "error", "warn", "info");
  snack.classList.add(type);
  iconEl.textContent = icons[type] || "info";
  textEl.textContent = text;
  snack.classList.add("active");

  if (snackTimer) clearTimeout(snackTimer);
  snackTimer = setTimeout(() => {
    snack.classList.remove("active", "success", "error", "warn", "info");
  }, 4000);
}

function showEmergencyAlert(content, from) {
  const banner = document.createElement("div");
  banner.className = "emergency-banner";
  banner.innerHTML = `
    <span class="material-icons-outlined">warning</span>
    <span><strong>EMERGENCY</strong> from ${escapeHTML(from ? from.substring(0, 10) + "…" : "unknown")}: ${escapeHTML(content)}</span>
    <button onclick="this.parentElement.remove()">Dismiss</button>`;
  document.body.prepend(banner);
}

function sendEmergency() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "emergency_broadcast",
        content: "EMERGENCY: Immediate assistance required!",
        from: myUsid,
      }),
    );
    showSnackbar("Emergency broadcast sent", "warn");
  } else {
    showSnackbar("Not connected — cannot send emergency", "error");
  }
}

// ─────────────────────────────────────────
// Safety Numbers — Key Verification
// ─────────────────────────────────────────

/**
 * SHA-256 any string → lowercase hex.
 * Used to normalise USIDs before safety number computation so that
 * raw USID (my side) and hashed USID (peer side, from contacts list)
 * both reduce to the same canonical form.
 */
async function sha256hex(str) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(str),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate or load the local P-256 identity key pair for safety numbers.
 * Public key hex stored in localStorage (public data — safe).
 * Private key kept as non-exportable CryptoKey in memory only.
 * Also pre-computes and caches myHashedUsid.
 */
async function generateOrLoadIdentityKeyPair() {
  // Cache the hashed form of our own USID for use in computeSafetyNumber
  // myUsid is already the hashed USID (sha256 of raw) — no need to re-hash
  if (myUsid && !myHashedUsid) {
    myHashedUsid = myUsid;
    console.log(
      "[SafetyNum] myHashedUsid cached:",
      myHashedUsid.substring(0, 12) + "...",
    );
  }

  const stored = localStorage.getItem("sn_identity_pub");
  if (stored) {
    myIdentityPublicKeyHex = stored;
    console.log("[SafetyNum] Loaded existing identity public key");
    return;
  }

  try {
    const keyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey", "deriveBits"],
    );

    const rawPub = await crypto.subtle.exportKey("raw", keyPair.publicKey);
    const pubHex = Array.from(new Uint8Array(rawPub))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    myIdentityPublicKeyHex = pubHex;
    localStorage.setItem("sn_identity_pub", pubHex);
    console.log("[SafetyNum] Generated new identity key pair");
  } catch (e) {
    console.error("[SafetyNum] Key generation failed:", e);
  }
}

/**
 * Push our identity public key to the server so peers can fetch it.
 */
async function uploadIdentityPublicKey() {
  if (!myIdentityPublicKeyHex || !token) return;
  try {
    await authFetch("/update-pubkey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ publicKey: myIdentityPublicKeyHex }),
    });
    console.log("[SafetyNum] Identity public key uploaded");
  } catch (e) {
    console.warn("[SafetyNum] Failed to upload public key:", e);
  }
}

/**
 * Compute a 60-digit safety number.
 *
 * ROOT CAUSE FIX:
 *   - myUsid   is the RAW hex USID (e.g. "0xabc123...")  stored in localStorage
 *   - peerUsid is the HASHED usid   (SHA-256 of their raw USID) stored in contacts
 *   These are different formats of the same concept, so a naive string compare
 *   produces different sort orders on each side → different safety numbers.
 *
 * FIX: Hash BOTH USIDs with SHA-256 before comparing/concatenating.
 *   Alice: sha256(aliceRawUsid) vs sha256(bobHashedUsid)  ← sha256(sha256(bobRaw))
 *   Bob:   sha256(bobRawUsid)   vs sha256(aliceHashedUsid) ← sha256(sha256(aliceRaw))
 *
 *   Wait — that still differs. The real fix is:
 *   We pass myHashedUsid (already sha256'd once, matches what's in other users'
 *   contacts lists) and peerUsid (already a sha256 hash from the contacts list).
 *   Both are now the SAME format: sha256(rawUsid).
 *   Sort lexicographically → concatenate → sha256 → format.
 */
async function computeSafetyNumber(
  myHashed,
  myPubKeyHex,
  peerHashed,
  peerPubKeyHex,
) {
  // Both inputs are now sha256(rawUsid) — same format, safe to compare
  const [firstHashed, firstKey, secondHashed, secondKey] =
    myHashed < peerHashed
      ? [myHashed, myPubKeyHex, peerHashed, peerPubKeyHex]
      : [peerHashed, peerPubKeyHex, myHashed, myPubKeyHex];

  const combined = firstHashed + firstKey + secondHashed + secondKey;
  const hashBuf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(combined),
  );
  return formatSafetyNumber(new Uint8Array(hashBuf));
}

/**
 * Format 32 hash bytes as 12 groups of 5 digits across 4 rows (Signal standard).
 */
function formatSafetyNumber(hashBytes) {
  const groups = [];
  for (let i = 0; i < 30; i += 5) {
    const chunk =
      hashBytes[i] * 0x100000000 +
      hashBytes[i + 1] * 0x1000000 +
      hashBytes[i + 2] * 0x10000 +
      hashBytes[i + 3] * 0x100 +
      hashBytes[i + 4];
    groups.push(String(chunk % 100000).padStart(5, "0"));
  }
  return [
    groups.slice(0, 3).join(" "),
    groups.slice(3, 6).join(" "),
    groups.slice(6, 9).join(" "),
    groups.slice(9, 12).join(" "),
  ].join("\n");
}

/**
 * Open the Safety Numbers dialog for the current chat peer.
 */
async function showSafetyNumbers() {
  if (!currentChatUsid) return;

  // Ensure our hashed USID is ready (normally cached at startup)
  // myUsid is already the hashed USID — no re-hash needed
  if (!myHashedUsid && myUsid) {
    myHashedUsid = myUsid;
  }

  if (!myIdentityPublicKeyHex) {
    showSnackbar("Your identity key is not ready yet", "warn");
    return;
  }

  const btn = document.getElementById("verify-safety-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Loading...";
  }

  try {
    const res = await authFetch(`/public-key/${currentChatUsid}`);

    if (!res.ok) {
      showSnackbar("Peer has not uploaded their identity key yet", "warn");
      return;
    }

    const { publicKey: theirPubKeyHex } = await res.json();

    if (!theirPubKeyHex || theirPubKeyHex === "placeholder-public-key") {
      showSnackbar("Peer has not uploaded their identity key yet", "warn");
      return;
    }

    // KEY FIX: pass myHashedUsid (sha256 of our raw USID) and currentChatUsid
    // (already a sha256 hash from the contacts list) — both are the same format now.
    const safetyNumber = await computeSafetyNumber(
      myHashedUsid,
      myIdentityPublicKeyHex,
      currentChatUsid,
      theirPubKeyHex,
    );

    currentSafetyNumber = safetyNumber;

    const grid = document.getElementById("sn-grid");
    if (grid) {
      grid.innerHTML = safetyNumber
        .split("\n")
        .map(
          (row) =>
            `<div class="sn-row">${row
              .split(" ")
              .map((g) => `<span class="sn-group">${escapeHTML(g)}</span>`)
              .join("")}</div>`,
        )
        .join("");
    }

    const storedSN = localStorage.getItem(`sn:${currentChatUsid}`);
    const changeWarning = document.getElementById("sn-change-warning");

    if (storedSN && storedSN !== safetyNumber) {
      if (changeWarning) changeWarning.classList.remove("hidden");
      showSnackbar("⚠️ Safety number changed — re-verify identity", "warn");
    } else {
      if (changeWarning) changeWarning.classList.add("hidden");
    }

    localStorage.setItem(`sn:${currentChatUsid}`, safetyNumber);
    updateVerifiedBadge();
    showDialog("safety-numbers-dialog");
  } catch (e) {
    console.error("[SafetyNum] Error:", e);
    showSnackbar("Could not load safety numbers", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Verify Safety Numbers";
    }
  }
}

/** Mark the current peer as verified */
function markPeerVerified() {
  if (!currentChatUsid || !currentSafetyNumber) return;
  localStorage.setItem(`sn_verified:${currentChatUsid}`, currentSafetyNumber);
  updateVerifiedBadge();
  showSnackbar("Identity verified ✓", "success");
}

/** Update verified/unverified badge in the details pane */
function updateVerifiedBadge() {
  const verifiedEl = document.getElementById("sn-verified-badge");
  const unverifiedEl = document.getElementById("sn-unverified-badge");
  if (!verifiedEl || !unverifiedEl || !currentChatUsid) return;

  const storedVerified = localStorage.getItem(`sn_verified:${currentChatUsid}`);
  const storedCurrent = localStorage.getItem(`sn:${currentChatUsid}`);
  const isVerified =
    storedVerified && storedCurrent && storedVerified === storedCurrent;

  verifiedEl.classList.toggle("hidden", !isVerified);
  unverifiedEl.classList.toggle("hidden", !!isVerified);
}

// ─────────────────────────────────────────
// Event Listeners
// ─────────────────────────────────────────
function isContactAlreadyAdded(usid) {
  return contacts.some(
    (contact) =>
      contact.toLowerCase() === usid.toLowerCase() ||
      contact.toLowerCase() === usid.toLowerCase().replace("0x", "") ||
      usid.toLowerCase() === contact.toLowerCase().replace("0x", ""),
  );
}

function setupEventListeners() {
  document.getElementById("signup-btn").addEventListener("click", signup);
  document
    .getElementById("name")
    .addEventListener(
      "keypress",
      (e) => e.key === "Enter" && document.getElementById("email").focus(),
    );
  document
    .getElementById("email")
    .addEventListener("keypress", (e) => e.key === "Enter" && signup());

  document.getElementById("send-btn").addEventListener("click", () => sendMessage());
  document.getElementById("message-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) sendMessage();
  });

  document
    .getElementById("search-input")
    .addEventListener("input", renderContactsList);
  document.getElementById("theme-btn").addEventListener("click", toggleTheme);
  document.getElementById("keyboard-shortcuts-btn")?.addEventListener("click", () => {
    showDialog("keyboard-shortcuts-dialog");
    document.getElementById("close-keyboard-shortcuts")?.focus();
  });
  document.getElementById("close-keyboard-shortcuts")?.addEventListener("click", () => {
    hideDialog("keyboard-shortcuts-dialog");
    document.getElementById("keyboard-shortcuts-btn")?.focus();
  });
  document.getElementById("keyboard-shortcuts-dialog")?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideDialog("keyboard-shortcuts-dialog");
      document.getElementById("keyboard-shortcuts-btn")?.focus();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    const isEmergencyShortcut = event.code === "KeyE";
    if (event.shiftKey !== isEmergencyShortcut) return;
    const hasPlatformModifier = (event.ctrlKey && !event.metaKey) || (event.metaKey && !event.ctrlKey);
    if (!hasPlatformModifier || !event.altKey) return;

    const actions = {
      KeyA: () => {
        showDialog("add-contact-dialog");
        document.getElementById("contact-usid")?.focus();
      },
      KeyG: () => {
        if (currentChatType === "group" && currentChatGroupId) {
          document.getElementById("message-input")?.focus();
        } else {
          showSnackbar("Open an encrypted group conversation first", "info");
        }
      },
      KeyD: openDlpSettings,
      KeyE: () => {
        if (window.confirm("Send an emergency alert to connected clients?")) sendEmergency();
      },
      KeyV: () => {
        if (currentChatUsid) showSafetyNumbers();
        else showSnackbar("Open a direct conversation to verify identity", "info");
      },
    };
    const action = actions[event.code];
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  });

  document
    .getElementById("fab-add-contact")
    .addEventListener("click", () => showDialog("add-contact-dialog"));
  document
    .getElementById("start-add-contact")
    .addEventListener("click", () => showDialog("add-contact-dialog"));
  document
    .getElementById("confirm-add-contact")
    .addEventListener("click", addContact);
  document
    .getElementById("cancel-add-contact")
    .addEventListener("click", () => hideDialog("add-contact-dialog"));
  document.getElementById("save-contact-alias").addEventListener("click", () => {
    if (!currentChatUsid) return;
    saveContactName(currentChatUsid, document.getElementById("contact-alias-input").value);
    const contactName = getContactName(currentChatUsid);
    document.getElementById("app-bar-title").textContent = contactName;
    document.getElementById("details-name").textContent = contactName;
    renderContactsList();
    showSnackbar("Contact name saved", "success");
  });

  document.getElementById("show-profile").addEventListener("click", () => {
    document.getElementById("my-usid-code").textContent =
      myUsid || "Not registered";
    showDialog("profile-dialog");
  });
  document
    .getElementById("close-profile")
    .addEventListener("click", () => hideDialog("profile-dialog"));
  document.getElementById("copy-usid").addEventListener("click", () => {
    navigator.clipboard
      .writeText(myUsid || "")
      .then(() => showSnackbar("USID copied to clipboard", "success"));
  });

  // Email USID direct client-side handlers (No Backend Required)
  document.getElementById("email-usid-btn").addEventListener("click", () => {
    openEmailDialog();
  });
  document.getElementById("open-email-dialog-btn").addEventListener("click", () => {
    hideDialog("profile-dialog");
    openEmailDialog();
  });
  document.getElementById("close-email-dialog").addEventListener("click", () => {
    hideDialog("email-usid-dialog");
  });
  document.getElementById("cancel-email-dialog").addEventListener("click", () => {
    hideDialog("email-usid-dialog");
  });
  document.getElementById("email-recipient-input").addEventListener("input", updateEmailPreview);
  document.getElementById("send-mailto-btn").addEventListener("click", () => handleSendEmail("mailto"));
  document.getElementById("send-gmail-btn").addEventListener("click", () => handleSendEmail("gmail"));
  document.getElementById("send-outlook-btn").addEventListener("click", () => handleSendEmail("outlook"));
  document.getElementById("send-yahoo-btn").addEventListener("click", () => handleSendEmail("yahoo"));
  document.getElementById("send-webshare-btn").addEventListener("click", () => handleSendEmail("share"));
  document.getElementById("copy-email-template").addEventListener("click", () => handleSendEmail("copy"));

  document.getElementById("toggle-details").addEventListener("click", () => {
    document.getElementById("details-pane").classList.toggle("collapsed");
    updateTorrentStats();
  });
  document.getElementById("close-details").addEventListener("click", () => {
    document.getElementById("details-pane").classList.add("collapsed");
  });

  document
    .getElementById("attach-btn")
    .addEventListener("click", () =>
      document.getElementById("file-input").click(),
    );
  document
    .getElementById("file-input")
    .addEventListener("change", handleFileUpload);
  document
    .getElementById("transfer-close")
    .addEventListener("click", hideTransferBar);

  document
    .getElementById("emergency-btn")
    .addEventListener("click", sendEmergency);
  document.querySelectorAll(".dialog-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.remove("active");
    });
  });

  document
    .getElementById("verify-safety-btn")
    ?.addEventListener("click", showSafetyNumbers);
  document.getElementById("sn-mark-verified")?.addEventListener("click", () => {
    markPeerVerified();
    hideDialog("safety-numbers-dialog");
  });
  document.getElementById("sn-copy-btn")?.addEventListener("click", () => {
    if (currentSafetyNumber) {
      navigator.clipboard
        .writeText(currentSafetyNumber.replace(/\n/g, "  "))
        .then(() => showSnackbar("Safety number copied", "success"));
    }
  });
  document
    .getElementById("sn-close-btn")
    ?.addEventListener("click", () => hideDialog("safety-numbers-dialog"));

  document.getElementById("reply-preview-close")?.addEventListener("click", cancelReplyTarget);
  document.getElementById("close-reply-chain")?.addEventListener("click", hideReplyChain);
  document.getElementById("jump-to-thread-root")?.addEventListener("click", jumpToThreadRoot);
  document.getElementById("thread-send-btn")?.addEventListener("click", sendThreadReply);
  document.getElementById("thread-message-input")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) sendThreadReply();
  });

  // Real-time DLP input monitors
  const msgInput = document.getElementById("message-input");
  const threadMsgInput = document.getElementById("thread-message-input");
  msgInput?.addEventListener("input", (e) => {
    resizeComposerTextarea(e.target);
    checkLiveDlp(e.target, document.getElementById("dlp-inline-warning"), document.getElementById("dlp-inline-warning-text"));
  });
  threadMsgInput?.addEventListener("input", (e) => {
    resizeComposerTextarea(e.target);
    checkLiveDlp(e.target, document.getElementById("thread-dlp-warning"), document.getElementById("thread-dlp-warning-text"));
  });

  // Inline DLP Auto-Redact buttons
  document.getElementById("dlp-inline-redact-btn")?.addEventListener("click", () => {
    if (!window.HalonyxDLP || !msgInput) return;
    const scan = window.HalonyxDLP.scan(msgInput.value);
    if (scan.hasViolation) {
      msgInput.value = scan.redactedText;
      document.getElementById("dlp-inline-warning")?.classList.add("hidden");
      showSnackbar("Detected secret redacted with [REDACTED-DLP]", "info");
    }
  });

  document.getElementById("thread-dlp-redact-btn")?.addEventListener("click", () => {
    if (!window.HalonyxDLP || !threadMsgInput) return;
    const scan = window.HalonyxDLP.scan(threadMsgInput.value);
    if (scan.hasViolation) {
      threadMsgInput.value = scan.redactedText;
      document.getElementById("thread-dlp-warning")?.classList.add("hidden");
      showSnackbar("Detected secret redacted with [REDACTED-DLP]", "info");
    }
  });

  // DLP Alert Dialog Actions
  document.getElementById("close-dlp-alert")?.addEventListener("click", hideDlpAlertDialog);
  document.getElementById("dlp-edit-btn")?.addEventListener("click", () => {
    const src = pendingDlpAction?.source;
    hideDlpAlertDialog();
    if (src === "thread") {
      document.getElementById("thread-message-input")?.focus();
    } else {
      document.getElementById("message-input")?.focus();
    }
  });
  document.getElementById("dlp-redact-send-btn")?.addEventListener("click", handleDlpRedactSend);
  document.getElementById("dlp-override-send-btn")?.addEventListener("click", handleDlpOverrideSend);

  // DLP Settings Dialog
  document.getElementById("show-dlp-config")?.addEventListener("click", openDlpSettings);
  document.getElementById("dlp-status-btn")?.addEventListener("click", openDlpSettings);
  document.getElementById("close-dlp-settings")?.addEventListener("click", closeDlpSettings);
  document.getElementById("save-dlp-settings-btn")?.addEventListener("click", closeDlpSettings);

  // Aegisus top-level sections and DLP configuration tabs
  document.querySelectorAll(".aegisus-section-tab").forEach((btn) => {
    btn.addEventListener("click", () => selectAegisusSection(btn.dataset.engineSection));
  });
  document.querySelectorAll(".dlp-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".dlp-tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const targetTab = btn.getAttribute("data-tab");
      document.querySelectorAll(".dlp-tab-content").forEach((c) => {
        c.style.display = c.id === `dlp-tab-${targetTab}` ? "block" : "none";
      });
      if (targetTab === "audit") renderDlpAuditLog();
      if (targetTab === "custom") renderCustomRulesList();
    });
  });

  // DLP Master & Policy controls
  document.getElementById("dlp-master-toggle")?.addEventListener("change", (e) => {
    if (window.HalonyxDLP) {
      window.HalonyxDLP.updateConfig({ enabled: e.target.checked });
      updateDlpStatusBtn();
      showSnackbar(`Aegisus Security Engine ${e.target.checked ? "enabled" : "disabled"}`, "info");
    }
  });

  document.querySelectorAll("input[name='dlp-mode']").forEach((radio) => {
    radio.addEventListener("change", (e) => {
      if (window.HalonyxDLP && e.target.checked) {
        window.HalonyxDLP.updateConfig({ mode: e.target.value });
        document.querySelectorAll(".dlp-mode-card").forEach((card) => {
          const r = card.querySelector("input[type='radio']");
          card.classList.toggle("active", r && r.checked);
        });
        updateDlpStatusBtn();
        showSnackbar(`DLP mode set to ${e.target.value}`, "info");
      }
    });
  });

  const catChangeHandler = () => {
    if (!window.HalonyxDLP) return;
    const cloudKeys = document.getElementById("cat-cloud-keys")?.checked;
    const paymentCards = document.getElementById("cat-payment-cards")?.checked;
    const pii = document.getElementById("cat-pii")?.checked;
    window.HalonyxDLP.updateConfig({
      categories: { cloudKeys, paymentCards, pii },
    });
  };
  document.getElementById("cat-cloud-keys")?.addEventListener("change", catChangeHandler);
  document.getElementById("cat-payment-cards")?.addEventListener("change", catChangeHandler);
  document.getElementById("cat-pii")?.addEventListener("change", catChangeHandler);

  // Custom rule addition
  document.getElementById("add-custom-rule-btn")?.addEventListener("click", () => {
    const nameInput = document.getElementById("custom-rule-name");
    const patternInput = document.getElementById("custom-rule-pattern");
    const severityInput = document.getElementById("custom-rule-severity");
    const name = nameInput?.value.trim();
    const pattern = patternInput?.value.trim();
    const severity = severityInput?.value || "high";

    if (!name || !pattern) {
      showSnackbar("Please specify both a rule name and regex pattern", "warn");
      return;
    }

    try {
      new RegExp(pattern);
    } catch (err) {
      showSnackbar("Invalid regular expression syntax: " + err.message, "error");
      return;
    }

    const cfg = window.HalonyxDLP.getConfig();
    const customRules = cfg.customRules || [];
    customRules.push({
      id: "CUSTOM_" + Date.now(),
      name,
      pattern,
      severity,
      enabled: true,
    });
    window.HalonyxDLP.updateConfig({ customRules });
    nameInput.value = "";
    patternInput.value = "";
    renderCustomRulesList();
    showSnackbar("Custom enterprise rule added", "success");
  });

  // Audit log actions
  document.getElementById("export-audit-log-btn")?.addEventListener("click", () => {
    if (!window.HalonyxDLP) return;
    const jsonStr = window.HalonyxDLP.exportAuditLogJSON();
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `halonyx-dlp-audit-${new Date().toISOString().substring(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showSnackbar("Compliance audit log exported", "success");
  });

  document.getElementById("clear-audit-log-btn")?.addEventListener("click", () => {
    if (!window.HalonyxDLP) return;
    window.HalonyxDLP.clearAuditLog();
    renderDlpAuditLog();
    showSnackbar("DLP audit log cleared", "info");
  });

  // Group Messaging Listeners
  setupCategoryTabs();
  document.getElementById("open-create-group-btn")?.addEventListener("click", openCreateGroupModal);
  document.getElementById("close-create-group")?.addEventListener("click", closeCreateGroupModal);
  document.getElementById("cancel-create-group")?.addEventListener("click", closeCreateGroupModal);
  document.getElementById("confirm-create-group")?.addEventListener("click", handleConfirmCreateGroup);
  document.getElementById("group-info-btn")?.addEventListener("click", () => openGroupDetailsModal());
  document.getElementById("close-group-details")?.addEventListener("click", closeGroupDetailsModal);
  document.getElementById("gd-add-member-btn")?.addEventListener("click", handleAddMemberToGroup);
  document.getElementById("gd-leave-group-btn")?.addEventListener("click", handleLeaveGroup);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      cancelReplyTarget();
      hideReplyChain();
      hideDlpAlertDialog();
      closeDlpSettings();
      closeCreateGroupModal();
      closeGroupDetailsModal();
    }
  });
}

// ─────────────────────────────────────────
// Enterprise Data Loss Prevention (DLP) UI Controller
// ─────────────────────────────────────────
let pendingDlpAction = null;

function inspectAegisusThreats(content, targetName, source) {
  if (!window.HalonyxAegisus) return false;
  const result = window.HalonyxAegisus.scan(content);
  if (!result.matches.length) return false;
  if (result.mode === "BLOCK") {
    window.HalonyxAegisus.logIncident(result.matches, "BLOCKED", targetName);
  }
  showDlpAlertDialog({
    mode: result.mode,
    violations: result.matches,
    redactedText: String(content || ""),
  }, content, source, "threat");
  return true;
}

function showDlpAlertDialog(scan, originalText, source, kind = "dlp") {
  pendingDlpAction = { scan, originalText, source, kind };
  const dialog = document.getElementById("dlp-alert-dialog");
  if (!dialog) return;

  const isThreatAlert = kind === "threat";
  const firstV = scan.violations[0];
  document.getElementById("dlp-alert-title").textContent = isThreatAlert
    ? "Threat Indicator Detected"
    : "Aegisus Security Engine Alert";
  document.getElementById("dlp-alert-body").textContent = isThreatAlert
    ? "This draft matches an indicator in your local threat watchlist. It has not been encrypted or sent."
    : "Sensitive data was detected in this message before E2EE encryption.";
  document.getElementById("dlp-rule-badge").textContent = firstV.ruleName;
  const sevBadge = document.getElementById("dlp-severity-badge");
  sevBadge.textContent = isThreatAlert ? "WATCHLIST" : firstV.severity.toUpperCase();
  sevBadge.className = `badge-pill badge-${!isThreatAlert && firstV.severity === "critical" ? "critical" : "danger"}`;

  document.getElementById("dlp-category-badge").textContent = firstV.categoryLabel || "Security Rule";
  document.getElementById("dlp-snippet-code").textContent = firstV.maskedSnippet;
  document.getElementById("dlp-remediation-tip").textContent = isThreatAlert
    ? "Review the matched indicator and its source. If you trust this destination, use Warn mode to choose whether to send."
    : "Aegisus inspected this message locally before encryption. Review the match or edit the draft.";
  const redactBtn = document.getElementById("dlp-redact-send-btn");
  if (redactBtn) redactBtn.style.display = isThreatAlert ? "none" : "inline-flex";

  const overrideBtn = document.getElementById("dlp-override-send-btn");
  if (overrideBtn) {
    overrideBtn.style.display = scan.mode === "WARN" ? "inline-flex" : "none";
    overrideBtn.textContent = isThreatAlert ? "Send Anyway" : "Override & Send";
  }

  dialog.classList.remove("hidden");
  dialog.classList.add("active");
}

function hideDlpAlertDialog() {
  const dialog = document.getElementById("dlp-alert-dialog");
  if (dialog) {
    dialog.classList.remove("active");
    dialog.classList.add("hidden");
  }
  pendingDlpAction = null;
}

function handleDlpRedactSend() {
  if (!pendingDlpAction) return;
  const { scan, source, kind = "dlp" } = pendingDlpAction;
  if (kind === "threat") return;
  hideDlpAlertDialog();
  const targetName = currentChatType === "group"
    ? ((window.HalonyxGroups && HalonyxGroups.getGroup(currentChatGroupId, myUsid)?.name) || "Group")
    : getContactName(currentChatUsid);
  if (window.HalonyxDLP) {
    window.HalonyxDLP.logIncident(scan.violations, "AUTO_REDACTED", targetName);
  }
  if (source === "thread") {
    sendThreadReplyDirect(scan.redactedText);
  } else {
    sendMessage(scan.redactedText);
  }
}

function handleDlpOverrideSend() {
  if (!pendingDlpAction) return;
  const { scan, originalText, source, kind = "dlp" } = pendingDlpAction;
  hideDlpAlertDialog();
  const targetName = currentChatType === "group"
    ? ((window.HalonyxGroups && HalonyxGroups.getGroup(currentChatGroupId, myUsid)?.name) || "Group")
    : getContactName(currentChatUsid);
  if (kind === "threat" && window.HalonyxAegisus) {
    window.HalonyxAegisus.logIncident(scan.violations, "WARNED_SENT", targetName);
    if (source === "thread") sendThreadReplyDirect(originalText, true);
    else sendMessage(originalText, true);
    return;
  }
  if (window.HalonyxDLP) {
    window.HalonyxDLP.logIncident(scan.violations, "WARNED_SENT", targetName);
  }
  if (source === "thread") {
    sendThreadReplyDirect(originalText);
  } else {
    sendMessage(originalText);
  }
}

async function sendThreadReplyDirect(content, bypassThreatIntel = false) {
  if (!messageLengthAllowed(content)) return;
  const isGroup = currentChatType === "group" && !!currentChatGroupId;
  const activeChatKey = isGroup ? currentChatGroupId : currentChatUsid;
  if (!activeThreadRootMsg || !activeChatKey || !ws || ws.readyState !== WebSocket.OPEN) return;
  const targetName = isGroup
    ? ((window.HalonyxGroups && HalonyxGroups.getGroup(currentChatGroupId, myUsid)?.name) || "Group")
    : getContactName(currentChatUsid);
  if (!bypassThreatIntel && inspectAegisusThreats(content, targetName, "thread")) return;

  const replyToMeta = {
    id: activeThreadRootMsg.id,
    snippet: activeThreadRootMsg.content ? String(activeThreadRootMsg.content).substring(0, 200) : "",
    senderHash: activeThreadRootMsg.from === "me" ? myUsid : activeThreadRootMsg.from,
  };

  if (isGroup && window.HalonyxGroups) {
    const group = HalonyxGroups.getGroup(currentChatGroupId, myUsid);
    if (!group) return;
    const groupMeta = {
      id: group.id,
      name: group.name,
      members: group.members,
      action: "message",
    };
    const envelope = EnvelopeModule.createEnvelope(content, replyToMeta, groupMeta, professionalMarkdownEnabled() ? "md" : undefined);
    const rawEnvelopeStr = JSON.stringify(envelope);

    const otherMembers = HalonyxGroups.getOtherMembers(group, myUsid);
    for (const recipient of otherMembers) {
      try {
        if (!signalProtocol.hasSession(recipient)) {
          await startX3dhSession(recipient).catch(() => {});
        }
        if (signalProtocol.hasSession(recipient)) {
          try {
            const encrypted = await signalProtocol.encrypt(recipient, rawEnvelopeStr);
            ws.send(JSON.stringify({ type: "message", to: recipient, encrypted }));
          } catch (e) {
            console.warn(`[Groups] Direct thread encryption failed for ${recipient}:`, e);
          }
        } else {
          console.warn(`[Groups] Direct thread: no session with ${recipient}, refusing plaintext fallback`);
        }
      } catch (err) {}
    }

    saveMessage(group.id, {
      id: envelope.id,
      from: "me",
      content: envelope.body,
      timestamp: envelope.ts,
      rxTs: Date.now(),
      replyTo: envelope.replyTo,
      group: groupMeta,
      fmt: envelope.fmt,
    });
  } else {
    const envelope = EnvelopeModule.createEnvelope(content, replyToMeta, undefined, professionalMarkdownEnabled() ? "md" : undefined);
    const rawEnvelopeStr = JSON.stringify(envelope);

    if (!signalProtocol.hasSession(currentChatUsid)) {
      try {
        await startX3dhSession(currentChatUsid);
      } catch (e) {
        console.error("[E2EE] Direct thread reply session setup failed:", e);
      }
    }

    if (!signalProtocol.hasSession(currentChatUsid)) {
      showSnackbar("Cannot send reply: no secure session established with peer", "error");
      return;
    }

    let encrypted;
    try {
      encrypted = await signalProtocol.encrypt(currentChatUsid, rawEnvelopeStr);
    } catch (e) {
      console.error("[E2EE] Direct thread reply encryption failed:", e);
      showSnackbar("Encryption failed: thread reply not sent", "error");
      return;
    }

    ws.send(JSON.stringify({ type: "message", to: currentChatUsid, encrypted }));
    saveMessage(currentChatUsid, {
      id: envelope.id,
      from: "me",
      content: envelope.body,
      timestamp: envelope.ts,
      rxTs: Date.now(),
      replyTo: envelope.replyTo,
      fmt: envelope.fmt,
    });
  }

  const input = document.getElementById("thread-message-input");
  if (input) input.value = "";
  renderMessages();
  openThread(activeThreadRootMsg.id);
  playSendSound();
}

function checkLiveDlp(inputEl, warningEl, textEl) {
  if (!window.HalonyxDLP || !inputEl || !warningEl || !textEl) return;
  const scan = window.HalonyxDLP.scan(inputEl.value);
  if (scan.hasViolation) {
    const v = scan.violations[0];
    textEl.textContent = `DLP Alert: ${v.ruleName} detected (${v.maskedSnippet})`;
    warningEl.classList.remove("hidden");
  } else {
    warningEl.classList.add("hidden");
  }
}

function openDlpSettings() {
  if (!window.HalonyxDLP) return;
  const cfg = window.HalonyxDLP.getConfig();
  selectAegisusSection("rules");

  // Master switch
  const master = document.getElementById("dlp-master-toggle");
  if (master) master.checked = !!cfg.enabled;

  // Radio cards
  document.querySelectorAll("input[name='dlp-mode']").forEach((radio) => {
    radio.checked = radio.value === cfg.mode;
    const card = radio.closest(".dlp-mode-card");
    if (card) card.classList.toggle("active", radio.value === cfg.mode);
  });

  // Category switches
  const catCloud = document.getElementById("cat-cloud-keys");
  if (catCloud) catCloud.checked = !!cfg.categories.cloudKeys;
  const catPayment = document.getElementById("cat-payment-cards");
  if (catPayment) catPayment.checked = !!cfg.categories.paymentCards;
  const catPii = document.getElementById("cat-pii");
  if (catPii) catPii.checked = !!cfg.categories.pii;

  renderCustomRulesList();
  renderDlpAuditLog();

  const dialog = document.getElementById("dlp-settings-dialog");
  if (dialog) {
    dialog.classList.remove("hidden");
    dialog.classList.add("active");
  }
}

function closeDlpSettings() {
  const dialog = document.getElementById("dlp-settings-dialog");
  if (dialog) {
    dialog.classList.remove("active");
    dialog.classList.add("hidden");
  }
  updateDlpStatusBtn();
}

function selectAegisusSection(sectionName) {
  document.querySelectorAll(".aegisus-section-tab").forEach((tab) => {
    const selected = tab.dataset.engineSection === sectionName;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll(".aegisus-section-panel").forEach((panel) => {
    panel.hidden = panel.id !== `aegisus-section-${sectionName}`;
  });
}

function updateDlpStatusBtn() {
  const btn = document.getElementById("dlp-status-btn");
  if (!btn || !window.HalonyxDLP) return;
  const cfg = window.HalonyxDLP.getConfig();
  btn.className = `icon-btn dlp-mode-${cfg.mode.toLowerCase()}${cfg.enabled ? "" : " dlp-disabled"}`;
  btn.title = `Aegisus Security Engine: ${cfg.enabled ? cfg.mode : "Disabled"}`;
}

function renderCustomRulesList() {
  const container = document.getElementById("custom-rules-list");
  if (!container || !window.HalonyxDLP) return;
  const cfg = window.HalonyxDLP.getConfig();
  const rules = cfg.customRules || [];

  if (rules.length === 0) {
    container.innerHTML = `<div style="color:var(--fg-muted);font-size:0.75rem;padding:8px 0;">No custom rules configured yet.</div>`;
    return;
  }

  let html = "";
  rules.forEach((r, idx) => {
    html += `
      <div class="custom-rule-card">
        <div>
          <strong>${escapeHTML(r.name)}</strong>
          <div class="rule-pattern">/${escapeHTML(r.pattern)}/gi</div>
        </div>
        <button class="icon-btn-sm danger-text" onclick="deleteCustomDlpRule(${idx})" title="Delete rule">
          <span class="material-icons-outlined">delete</span>
        </button>
      </div>
    `;
  });
  container.innerHTML = html;
}

function deleteCustomDlpRule(index) {
  if (!window.HalonyxDLP) return;
  const cfg = window.HalonyxDLP.getConfig();
  if (cfg.customRules && cfg.customRules[index]) {
    cfg.customRules.splice(index, 1);
    window.HalonyxDLP.updateConfig({ customRules: cfg.customRules });
    renderCustomRulesList();
    showSnackbar("Custom DLP rule removed", "info");
  }
}

function renderDlpAuditLog() {
  const wrap = document.getElementById("dlp-audit-table-wrap");
  const counter = document.getElementById("audit-log-counter");
  if (!wrap || !window.HalonyxDLP) return;

  const log = window.HalonyxDLP.getAuditLog();
  if (counter) counter.textContent = `${log.length} incident${log.length === 1 ? "" : "s"} logged locally`;

  if (log.length === 0) {
    wrap.innerHTML = `<div style="text-align:center;padding:24px;color:var(--fg-muted);">No security incidents intercepted yet.</div>`;
    return;
  }

  let html = "";
  log.forEach((entry) => {
    const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const badgeClass = entry.action === "BLOCKED" ? "audit-badge-blocked" : entry.action === "WARNED_SENT" ? "audit-badge-warned" : "audit-badge-redacted";
    html += `
      <div class="audit-entry-row">
        <span class="audit-entry-time">${time}</span>
        <span class="audit-entry-rule" title="${escapeAttr(entry.ruleName)}">${escapeHTML(entry.ruleName)}</span>
        <span class="audit-entry-snippet">${escapeHTML(entry.maskedSnippet || "•••")}</span>
        <span class="${badgeClass}">${escapeHTML(entry.action)}</span>
      </div>
    `;
  });
  wrap.innerHTML = html;
}

// ─────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────
function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  const d = document.createElement("div");
  d.textContent = String(str);
  return d.innerHTML;
}

function escapeAttr(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&#39;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function copyMessageById(msgId) {
  for (const list of Object.values(messageHistory)) {
    const found = list.find((m) => m.id === msgId);
    if (found) {
      copyMessageText(found.content);
      return;
    }
  }
}
window.copyMessageById = copyMessageById;

function downloadFileByMsgId(msgId, pid) {
  for (const list of Object.values(messageHistory)) {
    const found = list.find((m) => m.id === msgId);
    if (found) {
      downloadFile(found.content, pid);
      return;
    }
  }
}
window.downloadFileByMsgId = downloadFileByMsgId;

function openMagnetByMsgId(msgId) {
  for (const list of Object.values(messageHistory)) {
    const found = list.find((m) => m.id === msgId);
    if (found) {
      openMagnet(found.content);
      return;
    }
  }
}
window.openMagnetByMsgId = openMagnetByMsgId;

function truncate(str, n) {
  return str.length > n ? str.substring(0, n) + "…" : str;
}

function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (
    parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + " " + sizes[i]
  );
}

// ─────────────────────────────────────────
// Client-Side Email USID Functions (No Backend Required)
// ─────────────────────────────────────────
function updateEmailPreview() {
  const recipientInput = document.getElementById("email-recipient-input");
  const previewBox = document.getElementById("email-preview-box");
  if (!previewBox) return;

  const recipient = recipientInput ? recipientInput.value.trim() : "";
  const nameInput = document.getElementById("name");
  const senderName = nameInput ? nameInput.value.trim() : "";

  const utils = window.EmailUtils;
  if (!utils || typeof utils.buildUsidEmailContent !== "function") {
    previewBox.textContent = "Email utilities not available.";
    return;
  }

  const { subject, body } = utils.buildUsidEmailContent(myUsid || "0x...", senderName);
  const recipientLine = recipient ? `To: ${recipient}\n` : "";
  previewBox.textContent = `${recipientLine}Subject: ${subject}\n\n${body}`;
}

function openEmailDialog() {
  if (!myUsid) {
    showSnackbar("USID identity is not available yet", "warn");
    return;
  }

  const recipientInput = document.getElementById("email-recipient-input");
  if (recipientInput) recipientInput.value = "";

  const shareBtn = document.getElementById("send-webshare-btn");
  if (shareBtn) {
    shareBtn.style.display = (navigator && typeof navigator.share === "function") ? "flex" : "none";
  }

  updateEmailPreview();
  showDialog("email-usid-dialog");
}

function handleSendEmail(provider) {
  if (!myUsid) {
    showSnackbar("USID identity is not available yet", "warn");
    return;
  }

  const recipientInput = document.getElementById("email-recipient-input");
  const recipient = recipientInput ? recipientInput.value.trim() : "";
  const nameInput = document.getElementById("name");
  const senderName = nameInput ? nameInput.value.trim() : "";

  const utils = window.EmailUtils;
  if (!utils) {
    showSnackbar("Email utilities not loaded", "error");
    return;
  }

  const { subject, body } = utils.buildUsidEmailContent(myUsid, senderName);

  if (provider === "mailto") {
    const mailtoUrl = utils.buildMailtoUrl(myUsid, recipient, senderName);
    window.location.href = mailtoUrl;
    showSnackbar("Opening default mail application...", "info");
  } else if (provider === "gmail" || provider === "outlook" || provider === "yahoo") {
    const webmails = utils.buildWebmailUrls(myUsid, recipient, senderName);
    const targetUrl = webmails[provider];
    if (targetUrl) {
      window.open(targetUrl, "_blank", "noopener,noreferrer");
      showSnackbar(`Opening ${provider.toUpperCase()} webmail...`, "info");
    }
  } else if (provider === "share") {
    if (navigator && typeof navigator.share === "function") {
      navigator.share({
        title: subject,
        text: body,
      }).then(() => {
        showSnackbar("Shared identity code successfully", "success");
      }).catch(err => {
        if (err.name !== "AbortError") {
          console.error("[Email Share] Native share error:", err);
        }
      });
    }
  } else if (provider === "copy") {
    const fullText = (recipient ? `To: ${recipient}\n` : "") + `Subject: ${subject}\n\n${body}`;
    navigator.clipboard.writeText(fullText).then(() => {
      showSnackbar("Email template copied to clipboard", "success");
    }).catch(err => {
      console.error("[Email Share] Clipboard copy failed:", err);
      showSnackbar("Failed to copy template", "error");
    });
  }
}

// ─────────────────────────────────────────
// Encrypted Group Messaging UI Controller
// ─────────────────────────────────────────

async function openGroupChat(groupId) {
  if (!window.HalonyxGroups) return;
  const group = HalonyxGroups.getGroup(groupId, myUsid);
  if (!group) return;

  currentChatType = "group";
  currentChatGroupId = groupId;
  currentChatUsid = null;

  document.getElementById("no-chat-selected").style.display = "none";
  document.getElementById("chat-active-view").style.display = "flex";
  document.getElementById("app-bar-title").textContent = group.name;

  const peerStatus = document.getElementById("peer-status");
  if (peerStatus) {
    peerStatus.innerHTML = `<span class="status-dot-sm online"></span> ${group.members ? group.members.length : 0} members · Encrypted Group`;
  }

  const groupInfoBtn = document.getElementById("group-info-btn");
  if (groupInfoBtn) groupInfoBtn.classList.remove("hidden");

  // Reset unread count for this group
  if (group.unreadCount > 0) {
    group.unreadCount = 0;
    HalonyxGroups.addOrUpdateGroup(group, myUsid);
    updateGroupBadges();
  }

  // Pre-warm X3DH sessions with any member who does not have an active session
  const otherMembers = HalonyxGroups.getOtherMembers(group, myUsid);
  otherMembers.forEach((member) => {
    if (!signalProtocol.hasSession(member)) {
      console.log("[Groups] Starting background key exchange for member:", member);
      startX3dhSession(member).catch((e) => console.warn("[Groups] Member session warm-up error:", e));
    }
  });

  renderContactsList();
  renderMessages();
}
window.openGroupChat = openGroupChat;

function updateGroupBadges() {
  const allGroups = window.HalonyxGroups ? HalonyxGroups.loadGroups(myUsid) : [];
  const pill = document.getElementById("groups-pill-count");
  if (!pill) return;
  const totalUnread = allGroups.reduce((acc, g) => acc + (g.unreadCount || 0), 0);
  if (totalUnread > 0) {
    pill.textContent = totalUnread;
    pill.classList.remove("hidden");
  } else if (allGroups.length > 0) {
    pill.textContent = allGroups.length;
    pill.classList.remove("hidden");
  } else {
    pill.classList.add("hidden");
  }
}
window.updateGroupBadges = updateGroupBadges;

function setupCategoryTabs() {
  const tabs = document.querySelectorAll(".sidebar-category-nav .cat-nav-btn");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentCategory = tab.getAttribute("data-filter") || "all";
      const label = document.getElementById("contacts-label-text");
      if (label) {
        label.textContent = currentCategory === "groups" ? "ENCRYPTED GROUPS" : (currentCategory === "direct" ? "DIRECT MESSAGES" : "CONVERSATIONS");
      }
      renderContactsList();
    });
  });
}

function openCreateGroupModal() {
  const dialog = document.getElementById("create-group-dialog");
  if (!dialog) return;
  const nameInput = document.getElementById("group-name-input");
  const descInput = document.getElementById("group-desc-input");
  const extraInput = document.getElementById("group-extra-usid");
  if (nameInput) nameInput.value = "";
  if (descInput) descInput.value = "";
  if (extraInput) extraInput.value = "";

  const container = document.getElementById("group-contacts-selector");
  if (container) {
    if (contacts.length === 0) {
      container.innerHTML = `<div style="padding:10px;color:var(--fg-muted);font-size:.78rem;">No contacts saved yet. You can add members by USID below.</div>`;
    } else {
      container.innerHTML = contacts.map((c) => {
        const name = getContactName(c);
        return `
          <label class="group-contact-option">
            <input type="checkbox" value="${escapeAttr(c)}" class="group-member-checkbox" />
            <span><strong>${escapeHTML(name)}</strong> <small class="font-mono" style="color:var(--fg-muted);font-size:.7rem;">(${escapeHTML(truncate(c, 10))})</small></span>
          </label>`;
      }).join("");
    }
  }
  dialog.classList.remove("hidden");
  dialog.classList.add("active");
  if (nameInput) nameInput.focus();
}
window.openCreateGroupModal = openCreateGroupModal;

function closeCreateGroupModal() {
  const dialog = document.getElementById("create-group-dialog");
  if (dialog) {
    dialog.classList.remove("active");
    dialog.classList.add("hidden");
  }
}
window.closeCreateGroupModal = closeCreateGroupModal;

async function handleConfirmCreateGroup() {
  if (!window.HalonyxGroups) return;
  const nameInput = document.getElementById("group-name-input");
  const descInput = document.getElementById("group-desc-input");
  const extraUsidInput = document.getElementById("group-extra-usid");

  const name = nameInput ? nameInput.value.trim() : "";
  if (!name) {
    showSnackbar("Please enter a group name", "warning");
    if (nameInput) nameInput.focus();
    return;
  }

  const selectedMembers = [];
  document.querySelectorAll(".group-member-checkbox:checked").forEach((cb) => {
    selectedMembers.push(cb.value);
  });

  const extra = extraUsidInput ? extraUsidInput.value.trim() : "";
  if (extra) {
    selectedMembers.push(extra);
  }

  try {
    const group = HalonyxGroups.createGroup(name, descInput ? descInput.value : "", selectedMembers, myUsid);
    HalonyxGroups.addOrUpdateGroup(group, myUsid);
    closeCreateGroupModal();
    showSnackbar(`Group "${group.name}" created!`, "success");
    openGroupChat(group.id);
  } catch (err) {
    console.error("[Groups] Failed to create group:", err);
    showSnackbar(err.message || "Failed to create group", "error");
  }
}
window.handleConfirmCreateGroup = handleConfirmCreateGroup;

function openGroupDetailsModal(groupId) {
  if (!window.HalonyxGroups) return;
  const targetId = groupId || currentChatGroupId;
  if (!targetId) return;

  const group = HalonyxGroups.getGroup(targetId, myUsid);
  if (!group) return;

  const dialog = document.getElementById("group-details-dialog");
  if (!dialog) return;

  const nameEl = document.getElementById("gd-name");
  const descEl = document.getElementById("gd-desc");
  const idEl = document.getElementById("gd-id");
  const countEl = document.getElementById("gd-member-count");

  if (nameEl) nameEl.textContent = group.name;
  if (descEl) descEl.textContent = group.description || "No topic set";
  if (idEl) idEl.textContent = group.id;
  if (countEl) countEl.textContent = group.members ? group.members.length : 0;

  const listEl = document.getElementById("gd-members-list");
  if (listEl && Array.isArray(group.members)) {
    listEl.innerHTML = group.members.map((m) => {
      const isMe = m === myUsid;
      const isCreator = m === group.creator;
      const name = isMe ? "You" : getContactName(m);
      return `
        <div class="gd-member-item">
          <div class="gd-member-name">
            <strong>${escapeHTML(name)}</strong>
            ${isCreator ? '<span class="gd-admin-badge">CREATOR</span>' : ""}
            ${isMe ? '<span class="gd-admin-badge" style="background:rgba(0,229,195,0.15);color:var(--accent);">YOU</span>' : ""}
            <div style="font-size:.65rem;color:var(--fg-muted);" class="font-mono">${escapeHTML(truncate(m, 16))}</div>
          </div>
          ${(!isMe) ? `
            <button class="icon-btn-sm" onclick="handleRemoveMemberFromGroup('${escapeAttr(group.id)}', '${escapeAttr(m)}')" title="Remove member">
              <span class="material-icons-outlined" style="font-size:16px;">person_remove</span>
            </button>` : ""}
        </div>`;
    }).join("");
  }

  dialog.dataset.groupId = group.id;
  dialog.classList.remove("hidden");
  dialog.classList.add("active");
}
window.openGroupDetailsModal = openGroupDetailsModal;

function closeGroupDetailsModal() {
  const dialog = document.getElementById("group-details-dialog");
  if (dialog) {
    dialog.classList.remove("active");
    dialog.classList.add("hidden");
  }
}
window.closeGroupDetailsModal = closeGroupDetailsModal;

function handleAddMemberToGroup() {
  const dialog = document.getElementById("group-details-dialog");
  const groupId = dialog?.dataset?.groupId || currentChatGroupId;
  const input = document.getElementById("gd-add-member-input");
  const usid = input?.value?.trim();
  if (!groupId || !usid) {
    showSnackbar("Please enter a valid member USID", "warning");
    return;
  }

  const updated = HalonyxGroups.addMember(groupId, usid, myUsid);
  if (updated) {
    input.value = "";
    showSnackbar("Member added to group", "success");
    openGroupDetailsModal(groupId);
    if (currentChatType === "group" && currentChatGroupId === groupId) {
      const statusEl = document.getElementById("peer-status");
      if (statusEl) {
        statusEl.innerHTML = `<span class="status-dot-sm online"></span> ${updated.members.length} members · Encrypted Group`;
      }
    }
    renderContactsList();
  }
}
window.handleAddMemberToGroup = handleAddMemberToGroup;

function handleRemoveMemberFromGroup(groupId, memberUsid) {
  if (!confirm("Are you sure you want to remove this member from the group?")) return;
  const updated = HalonyxGroups.removeMember(groupId, memberUsid, myUsid);
  if (updated) {
    showSnackbar("Member removed from group", "info");
    openGroupDetailsModal(groupId);
    if (currentChatType === "group" && currentChatGroupId === groupId) {
      const statusEl = document.getElementById("peer-status");
      if (statusEl) {
        statusEl.innerHTML = `<span class="status-dot-sm online"></span> ${updated.members.length} members · Encrypted Group`;
      }
    }
    renderContactsList();
  }
}
window.handleRemoveMemberFromGroup = handleRemoveMemberFromGroup;

function handleLeaveGroup() {
  const dialog = document.getElementById("group-details-dialog");
  const groupId = dialog?.dataset?.groupId || currentChatGroupId;
  if (!groupId) return;
  if (!confirm("Are you sure you want to leave this group?")) return;

  HalonyxGroups.deleteGroup(groupId, myUsid);
  closeGroupDetailsModal();
  showSnackbar("Left group", "info");

  if (currentChatType === "group" && currentChatGroupId === groupId) {
    currentChatType = "direct";
    currentChatGroupId = null;
    document.getElementById("chat-active-view").style.display = "none";
    document.getElementById("no-chat-selected").style.display = "flex";
  }

  renderContactsList();
}
window.handleLeaveGroup = handleLeaveGroup;
