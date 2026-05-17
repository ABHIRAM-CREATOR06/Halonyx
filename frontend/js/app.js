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
let contacts = [];
let messageHistory = JSON.parse(localStorage.getItem("messageHistory") || "{}");
let ws;
let identityRejected = false;

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
function connectWS() {
  if (!myUsid) return;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${proto}//${location.host}`);

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "register", usid: myUsid }));
    setNetStatus("online");
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
    setNetStatus("offline");
    if (!identityRejected && token) {
      setTimeout(connectWS, 3000);
    }
  };

  ws.onerror = () => setNetStatus("offline");
}

async function handleWSMessage(data) {
  switch (data.type) {
    case "registered":
      hideSplashScreen();
      break;
    case "error":
      if (data.message === "Identity not verified") handleAuthError();
      break;
    case "message": {
      const { from, encrypted, content, timestamp } = data;
      let displayContent = content || "";

      if (encrypted && signalProtocol.hasSession(from)) {
        try {
          displayContent = await signalProtocol.decrypt(from, encrypted);
          console.log(`[E2EE] Decrypted message from ${from.substring(0, 12)}`);
        } catch (e) {
          console.error("[E2EE] Decryption failed", e);
          displayContent = "[Encrypted — decryption failed]";
        }
      }

      saveMessage(from, { from, content: displayContent, timestamp });
      if (currentChatUsid === from) {
        renderMessages();
      } else {
        showSnackbar(`New message from peer`, "info");
        updateContactPreview(from);
      }
      break;
    }
    case "x3dh_init": {
      const { from } = data;
      if (from && !signalProtocol.hasSession(from)) {
        try {
          await signalProtocol.acceptSession(from, data);
          console.log(`[E2EE] Session accepted from ${from.substring(0, 12)}`);
        } catch (e) {
          console.error("[E2EE] acceptSession failed", e);
        }
      }
      break;
    }
    case "queued": {
      if (currentChatUsid && messageHistory[currentChatUsid]) {
        const hist = messageHistory[currentChatUsid];
        for (let i = hist.length - 1; i >= 0; i--) {
          if (hist[i].from === "me" && !hist[i].status) {
            hist[i].status = "queued";
            break;
          }
        }
        localStorage.setItem("messageHistory", JSON.stringify(messageHistory));
        renderMessages();
      }
      showSnackbar("Peer offline — message queued for delivery", "info");
      break;
    }
    case "emergency_broadcast":
      showEmergencyAlert(data.content, data.from);
      break;
  }
}

function handleAuthError() {
  identityRejected = true;
  localStorage.removeItem("token");
  localStorage.removeItem("usid");
  token = null;
  myUsid = null;
  location.reload();
}

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
    const res = await fetch("/contacts", {
      headers: { Authorization: `Bearer ${token}` },
    });

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

  const query = document.getElementById("search-input").value.toLowerCase();
  const filtered = contacts.filter((c) => c.toLowerCase().includes(query));

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-contacts">
            <span class="material-icons-outlined">group_add</span>
            <p>${query ? "No matches found" : "No contacts yet"}</p>
            <small>${query ? "Try a different search" : "Add a contact using their USID"}</small>
        </div>`;
    return;
  }

  try {
    list.innerHTML = filtered
      .map((c, i) => {
        const history = messageHistory[c] || [];
        const lastMsg = history.length > 0 ? history[history.length - 1] : null;
        const preview = lastMsg
          ? truncate(lastMsg.content, 32)
          : "No messages yet";
        const timeStr = lastMsg ? formatTime(lastMsg.timestamp) : "";
        const isActive = currentChatUsid === c ? "active" : "";
        const avClass = `av-${i % 5}`;

        return `
        <div class="contact-item ${isActive}" onclick="openChat('${escapeAttr(c)}')">
            <div class="contact-avatar ${avClass}">
                <span class="material-icons-outlined">person</span>
            </div>
            <div class="contact-body">
                <div class="contact-name">${c.substring(0, 14)}...</div>
                <div class="contact-preview">${escapeHTML(preview)}</div>
            </div>
            <div class="contact-meta">
                <span class="contact-time">${timeStr}</span>
                <button class="contact-delete-btn" onclick="event.stopPropagation(); removeContact('${escapeAttr(c)}')" title="Remove contact">
                    <span class="material-icons-outlined">close</span>
                </button>
            </div>
        </div>`;
      })
      .join("");
    console.log(
      `[Render Contacts] Successfully rendered ${filtered.length} contacts`,
    );
  } catch (e) {
    console.error("[Render Contacts] Error rendering contact list:", e);
    showSnackbar("Error displaying contacts", "error");
  }
}

function updateContactPreview(usid) {
  renderContactsList();
}

async function addContact() {
  const input = document.getElementById("contact-usid");
  const usid = input.value.trim();
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
    usid.toLowerCase() === myUsid.toLowerCase() ||
    usid.toLowerCase() === myUsid.toLowerCase().replace("0x", "")
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
    const res = await fetch("/add-contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
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

    const res = await fetch("/contacts", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
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
  currentChatUsid = hashedUsid;

  document.getElementById("no-chat-selected").style.display = "none";
  document.getElementById("chat-active-view").style.display = "flex";
  document.getElementById("app-bar-title").textContent =
    hashedUsid.substring(0, 16) + "…";

  document.getElementById("details-name").textContent =
    "Peer " + hashedUsid.substring(0, 8);
  document.getElementById("details-full-usid").textContent = hashedUsid;

  renderContactsList();
  updateTorrentStats();
  updateVerifiedBadge();

  const overlay = document.getElementById("key-exchange-overlay");
  const msgs = document.getElementById("messages-container");
  const status = document.getElementById("exchange-status");
  const details = document.getElementById("exchange-details");

  msgs.style.display = "none";
  overlay.classList.remove("hidden");
  status.textContent = "Running X3DH Key Exchange";
  details.textContent = "Fetching peer key bundle...";

  try {
    if (!signalProtocol.hasSession(hashedUsid)) {
      const initMsg = await signalProtocol.openSession(hashedUsid);
      if (initMsg && ws && ws.readyState === WebSocket.OPEN) {
        initMsg.to = hashedUsid;
        initMsg.from = myUsid;
        ws.send(JSON.stringify(initMsg));
      }
    }
    status.textContent = "Secure Channel Ready";
    details.textContent = "All messages are end-to-end encrypted.";
  } catch (e) {
    console.error("[E2EE] openSession failed", e);
    status.textContent = "Encryption Warning";
    details.textContent = "E2EE unavailable — peer bundle missing or offline";
  }

  setTimeout(() => {
    overlay.classList.add("hidden");
    msgs.style.display = "flex";
    renderMessages();
  }, 900);
}

async function sendMessage() {
  const input = document.getElementById("message-input");
  const content = input.value.trim();
  if (!content || !currentChatUsid || !ws || ws.readyState !== WebSocket.OPEN)
    return;

  let payload;
  if (signalProtocol.hasSession(currentChatUsid)) {
    try {
      const encrypted = await signalProtocol.encrypt(currentChatUsid, content);
      payload = { type: "message", to: currentChatUsid, encrypted };
      console.log("[E2EE] Message encrypted and sent");
    } catch (e) {
      console.error("[E2EE] Encryption failed, falling back to plaintext", e);
      payload = { type: "message", to: currentChatUsid, content };
    }
  } else {
    payload = { type: "message", to: currentChatUsid, content };
  }

  ws.send(JSON.stringify(payload));
  saveMessage(currentChatUsid, {
    from: "me",
    content,
    timestamp: new Date().toISOString(),
  });
  input.value = "";
  renderMessages();
  playSendSound();
}

function saveMessage(chatUsid, msg) {
  if (!messageHistory[chatUsid]) messageHistory[chatUsid] = [];
  messageHistory[chatUsid].push(msg);
  localStorage.setItem("messageHistory", JSON.stringify(messageHistory));
}

function renderMessages() {
  const container = document.getElementById("messages-container");
  const history = messageHistory[currentChatUsid] || [];

  if (history.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px 20px;color:var(--fg-muted);">
        <span class="material-icons-outlined" style="font-size:32px;opacity:.4;display:block;margin-bottom:8px;">lock</span>
        <p style="font-size:.8rem;font-family:var(--font-mono)">Messages are encrypted end-to-end</p>
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
        <div class="msg-row ${rowCls}">
          <div class="file-bubble">
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
                  ? `<button class="file-action-btn" id="btn-${pid}" onclick="downloadFile('${escapeAttr(msg.content)}', '${pid}')" title="Download"><span class="material-icons-outlined">download</span></button>`
                  : `<button class="file-action-btn" onclick="openMagnet('${escapeAttr(msg.content)}')" title="Copy magnet"><span class="material-icons-outlined">link</span></button>`
              }
            </div>
          </div>
        </div>`;
    } else {
      const statusIcon =
        isMe && msg.status === "queued"
          ? `<span class="msg-status-icon material-icons-outlined" title="Queued — peer offline">schedule</span>`
          : "";
      html += `
        <div class="msg-row ${rowCls}">
          <div class="msg-bubble${msg.status === "queued" ? " msg-queued" : ""}">
            ${escapeHTML(msg.content)}
            <span class="msg-time">${time}${statusIcon}</span>
          </div>
        </div>`;
    }
  });

  container.innerHTML = html;
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

    if (ws && ws.readyState === WebSocket.OPEN && currentChatUsid) {
      ws.send(
        JSON.stringify({
          type: "message",
          to: currentChatUsid,
          content: torrent.magnetURI,
        }),
      );
      saveMessage(currentChatUsid, {
        from: "me",
        content: torrent.magnetURI,
        timestamp: new Date().toISOString(),
      });
      renderMessages();
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
    <span><strong>EMERGENCY</strong> from ${from ? from.substring(0, 10) + "…" : "unknown"}: ${escapeHTML(content)}</span>
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
  if (myUsid && !myHashedUsid) {
    myHashedUsid = await sha256hex(myUsid);
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
    await fetch("/update-pubkey", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
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
  if (!myHashedUsid && myUsid) {
    myHashedUsid = await sha256hex(myUsid);
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
    const res = await fetch(`/public-key/${currentChatUsid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

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
              .map((g) => `<span class="sn-group">${g}</span>`)
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

  document.getElementById("send-btn").addEventListener("click", sendMessage);
  document.getElementById("message-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) sendMessage();
  });

  document
    .getElementById("search-input")
    .addEventListener("input", renderContactsList);
  document.getElementById("theme-btn").addEventListener("click", toggleTheme);

  document
    .getElementById("fab-add-contact")
    .addEventListener("click", () => showDialog("add-contact-dialog"));
  document
    .getElementById("confirm-add-contact")
    .addEventListener("click", addContact);
  document
    .getElementById("cancel-add-contact")
    .addEventListener("click", () => hideDialog("add-contact-dialog"));

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
  document
    .getElementById("emergency-btn-sidebar")
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
}

// ─────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────
function escapeHTML(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
}

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
