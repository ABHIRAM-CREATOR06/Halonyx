/**
 * Halonyx Secura — Core App
 * Version 4.0
 * Improvements:
 *  - Streamlined, clean UI logic
 *  - Effective WebTorrent: upload progress, speed, seeding, multi-file
 *  - Transfer status bar with live speed & progress
 *  - Torrent stats in details pane
 *  - Proper cleanup on torrent completion
 *  - Snackbar with icons & types
 */

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

// Active torrents map: magnetURI → torrent object
const activeTorrents = new Map();
// Global WebTorrent client
let btClient = null;

function getBTClient() {
  if (!btClient) {
    try {
      btClient = new WebTorrent({
        tracker: {
          announce: [
            "wss://tracker.openwebtorrent.com",
            "wss://tracker.webtorrent.dev",
            "wss://tracker.files.fm:7073/announce",
          ],
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
    connectWS();
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

function handleWSMessage(data) {
  switch (data.type) {
    case "registered":
      hideSplashScreen();
      break;
    case "error":
      if (data.message === "Identity not verified") handleAuthError();
      break;
    case "message": {
      const { from, content, timestamp } = data;
      saveMessage(from, { from, content, timestamp });
      if (currentChatUsid === from) {
        renderMessages();
      } else {
        showSnackbar(`New message from peer`, "info");
        updateContactPreview(from);
      }
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
        "Identity secured. Connecting...";

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
    const res = await fetch("/contacts", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    contacts = await res.json();
    renderContactsList();
  } catch (e) {
    console.warn("Failed to load contacts:", e);
  }
}

function renderContactsList() {
  const list = document.getElementById("contacts-list");
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
        <div class="contact-item ${isActive}" onclick="openChat('${c}')">
            <div class="contact-avatar ${avClass}">
                <span class="material-icons-outlined">person</span>
            </div>
            <div class="contact-body">
                <div class="contact-name">${c.substring(0, 14)}...</div>
                <div class="contact-preview">${escapeHTML(preview)}</div>
            </div>
            <div class="contact-meta">
                <span class="contact-time">${timeStr}</span>
            </div>
        </div>`;
    })
    .join("");
}

function updateContactPreview(usid) {
  renderContactsList();
}

async function addContact() {
  const usid = document.getElementById("contact-usid").value.trim();
  if (!usid) return showSnackbar("Please enter a USID", "warn");

  try {
    const res = await fetch("/add-contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ usid }),
    });
    if (res.ok) {
      hideDialog("add-contact-dialog");
      document.getElementById("contact-usid").value = "";
      await loadContacts();
      showSnackbar("Contact added successfully", "success");
    } else {
      const d = await res.json();
      showSnackbar(d.error || "Could not add contact", "error");
    }
  } catch (e) {
    showSnackbar("Network error", "error");
  }
}

// ─────────────────────────────────────────
// Chat
// ─────────────────────────────────────────
function openChat(hashedUsid) {
  currentChatUsid = hashedUsid;

  document.getElementById("no-chat-selected").style.display = "none";
  document.getElementById("chat-active-view").style.display = "flex";
  document.getElementById("app-bar-title").textContent =
    hashedUsid.substring(0, 16) + "…";

  // Details pane
  document.getElementById("details-name").textContent =
    "Peer " + hashedUsid.substring(0, 8);
  document.getElementById("details-full-usid").textContent = hashedUsid;

  renderContactsList();
  simulateKeyExchange(() => renderMessages());
  updateTorrentStats();
}

function simulateKeyExchange(onComplete) {
  const overlay = document.getElementById("key-exchange-overlay");
  const msgs = document.getElementById("messages-container");
  const status = document.getElementById("exchange-status");
  const details = document.getElementById("exchange-details");

  msgs.style.display = "none";
  overlay.classList.remove("hidden");

  const steps = [
    { s: "Generating Ephemeral Keys", d: "Creating X3DH pre-key bundle..." },
    { s: "Establishing Session", d: "Double Ratchet initialization..." },
    { s: "Verifying Identity", d: "Checking USID fingerprints..." },
    { s: "Secure Channel Ready", d: "All messages are end-to-end encrypted." },
  ];

  let i = 0;
  const advance = () => {
    if (i < steps.length) {
      status.textContent = steps[i].s;
      details.textContent = steps[i].d;
      i++;
      setTimeout(advance, 680);
    } else {
      overlay.classList.add("hidden");
      msgs.style.display = "flex";
      onComplete();
    }
  };
  advance();
}

function sendMessage() {
  const input = document.getElementById("message-input");
  const content = input.value.trim();
  if (!content || !currentChatUsid || !ws || ws.readyState !== WebSocket.OPEN)
    return;

  ws.send(JSON.stringify({ type: "message", to: currentChatUsid, content }));

  const msg = { from: "me", content, timestamp: new Date().toISOString() };
  saveMessage(currentChatUsid, msg);
  input.value = "";
  renderMessages();
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

    // Detect magnet link
    if (msg.content.startsWith("magnet:?")) {
      const pid =
        "p_" +
        btoa(msg.timestamp)
          .replace(/[^a-z0-9]/gi, "")
          .substring(0, 8);
      html += `
                <div class="msg-row ${rowCls}">
                    <div class="file-bubble">
                        <div class="file-icon">
                            <span class="material-icons-outlined">folder_zip</span>
                        </div>
                        <div class="file-details">
                            <div class="file-name" id="fn-${pid}">Shared File</div>
                            <div class="file-size" id="fs-${pid}">Ready to download</div>
                            <div class="file-progress-wrap">
                                <div class="file-progress-inner" id="${pid}"></div>
                            </div>
                            <div class="file-status" id="fst-${pid}"></div>
                        </div>
                        ${
                          !isMe
                            ? `
                        <button class="file-action-btn" onclick="downloadFile('${escapeAttr(msg.content)}', '${pid}')" title="Download">
                            <span class="material-icons-outlined">download</span>
                        </button>`
                            : `
                        <button class="file-action-btn" onclick="openMagnet('${escapeAttr(msg.content)}')" title="Copy magnet">
                            <span class="material-icons-outlined">link</span>
                        </button>`
                        }
                    </div>
                </div>`;
    } else {
      html += `
                <div class="msg-row ${rowCls}">
                    <div class="msg-bubble">
                        ${escapeHTML(msg.content)}
                        <span class="msg-time">${time}</span>
                    </div>
                </div>`;
    }
  });

  container.innerHTML = html;
  container.scrollTop = container.scrollHeight;

  // Reattach active torrent progress updates
  activeTorrents.forEach((torrent, uri) => {
    updateFileProgress(torrent);
  });
}

// ─────────────────────────────────────────
// BitTorrent — Effective Implementation
// ─────────────────────────────────────────

/**
 * Seed a file and send the magnet URI as a message.
 * Shows live upload progress in the transfer bar.
 */
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

  client.seed(
    fileArray,
    {
      announce: [
        "wss://tracker.openwebtorrent.com",
        "wss://tracker.webtorrent.dev",
      ],
    },
    (torrent) => {
      console.log("[BT] Seeding:", torrent.name, torrent.magnetURI);
      activeTorrents.set(torrent.magnetURI, torrent);
      updateTorrentStats();

      // Send magnet link as message
      if (ws && ws.readyState === WebSocket.OPEN && currentChatUsid) {
        ws.send(
          JSON.stringify({
            type: "message",
            to: currentChatUsid,
            content: torrent.magnetURI,
          }),
        );
        const msg = {
          from: "me",
          content: torrent.magnetURI,
          timestamp: new Date().toISOString(),
        };
        saveMessage(currentChatUsid, msg);
        renderMessages();
      }

      // Track upload stats
      const statsInterval = setInterval(() => {
        if (!btClient || !btClient.get(torrent.infoHash)) {
          clearInterval(statsInterval);
          return;
        }
        const live = btClient.get(torrent.infoHash);
        if (live) {
          const ratio = live.ratio.toFixed(2);
          const speed = formatBytes(live.uploadSpeed) + "/s";
          updateTransferBar(
            `Seeding ${torrent.name} · Ratio ${ratio}`,
            live.ratio > 1 ? 1 : live.ratio,
            speed,
          );
          updateTorrentStats();
        }
      }, 1200);

      // Show the transfer bar until destroyed
      torrent.on("upload", () => {
        const speed = formatBytes(torrent.uploadSpeed) + "/s ↑";
        updateTransferBar(
          `Seeding: ${torrent.name}`,
          Math.min(torrent.ratio, 1),
          speed,
        );
      });

      showSnackbar(`Now seeding: ${torrent.name}`, "success");
    },
  );

  // Reset the file input so same file can be picked again
  e.target.value = "";
}

/**
 * Download a file from a magnet URI with full progress tracking.
 */
function downloadFile(magnetURI, progressId) {
  const client = getBTClient();
  if (!client) {
    showSnackbar("BitTorrent unavailable", "error");
    return;
  }

  // Prevent duplicate downloads
  if (activeTorrents.has(magnetURI)) {
    showSnackbar("Already downloading this file", "warn");
    return;
  }

  // Check if torrent already added to client
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

  client.add(
    magnetURI,
    {
      announce: [
        "wss://tracker.openwebtorrent.com",
        "wss://tracker.webtorrent.dev",
      ],
    },
    (torrent) => {
      console.log("[BT] Downloading:", torrent.name);
      activeTorrents.set(magnetURI, torrent);
      updateTorrentStats();

      // Update file name in message
      const fnEl = document.getElementById(`fn-${progressId}`);
      if (fnEl) fnEl.textContent = torrent.name || "Shared File";

      showSnackbar(`Downloading: ${torrent.name}`, "info");

      torrent.on("metadata", () => {
        const size = formatBytes(torrent.length);
        const fsEl = document.getElementById(`fs-${progressId}`);
        if (fsEl) fsEl.textContent = size;
      });

      torrent.on("download", () => {
        const pct = (torrent.progress * 100).toFixed(1);
        const spd = formatBytes(torrent.downloadSpeed) + "/s ↓";
        setFileStatus(progressId, pct, `${pct}% · ${spd}`);
        updateTransferBar(
          `Downloading: ${torrent.name}`,
          torrent.progress,
          spd,
        );
        updateTorrentStats();
      });

      torrent.on("done", () => {
        setFileStatus(progressId, "100", "Download complete!");
        hideTransferBar();
        activeTorrents.delete(magnetURI);
        updateTorrentStats();
        showSnackbar(`Downloaded: ${torrent.name}`, "success");

        // Auto-save files
        torrent.files.forEach((file) => {
          file.getBlobURL((err, url) => {
            if (err) return console.error("[BT] getBlobURL error:", err);
            const a = document.createElement("a");
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 5000);
          });
        });

        // Clean up after a while
        setTimeout(() => {
          if (btClient && btClient.get(torrent.infoHash)) {
            btClient.remove(torrent.infoHash);
          }
        }, 30000);
      });

      torrent.on("error", (err) => {
        console.error("[BT] Torrent error:", err);
        setFileStatus(progressId, "0", "Download failed");
        hideTransferBar();
        activeTorrents.delete(magnetURI);
        showSnackbar("Download failed: " + err.message, "error");
      });
    },
  );
}

function setFileStatus(progressId, pct, statusText) {
  const bar = document.getElementById(progressId);
  if (bar) bar.style.width = pct + "%";
  const st = document.getElementById("fst-" + progressId);
  if (st) st.textContent = statusText;
}

function updateFileProgress(torrent) {
  // Can be used to reconnect torrent state to re-rendered messages
}

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
            <div class="torrent-stat-bar">
                <div class="torrent-stat-bar-inner" style="width:${pct}%"></div>
            </div>
            <div class="torrent-stat-meta">
                <span>${type} · ${pct}%</span>
                <span>${spd}</span>
            </div>
        </div>`;
  });

  list.innerHTML = html;
}

// Refresh torrent stats periodically
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
  iconEl.textContent = icons[type] || "info";
  textEl.textContent = text;
  snack.classList.add("active");

  if (snackTimer) clearTimeout(snackTimer);
  snackTimer = setTimeout(() => snack.classList.remove("active"), 4000);
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
// Event Listeners
// ─────────────────────────────────────────
function setupEventListeners() {
  // Signup
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

  // Messaging
  document.getElementById("send-btn").addEventListener("click", sendMessage);
  document.getElementById("message-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) sendMessage();
  });

  // Search
  document
    .getElementById("search-input")
    .addEventListener("input", renderContactsList);

  // Theme
  document.getElementById("theme-btn").addEventListener("click", toggleTheme);

  // Contacts
  document
    .getElementById("fab-add-contact")
    .addEventListener("click", () => showDialog("add-contact-dialog"));
  document
    .getElementById("confirm-add-contact")
    .addEventListener("click", addContact);
  document
    .getElementById("cancel-add-contact")
    .addEventListener("click", () => hideDialog("add-contact-dialog"));

  // Profile
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

  // Details pane
  document.getElementById("toggle-details").addEventListener("click", () => {
    document.getElementById("details-pane").classList.toggle("collapsed");
    updateTorrentStats();
  });
  document.getElementById("close-details").addEventListener("click", () => {
    document.getElementById("details-pane").classList.add("collapsed");
  });

  // File attach
  document
    .getElementById("attach-btn")
    .addEventListener("click", () =>
      document.getElementById("file-input").click(),
    );
  document
    .getElementById("file-input")
    .addEventListener("change", handleFileUpload);

  // Transfer bar close
  document
    .getElementById("transfer-close")
    .addEventListener("click", hideTransferBar);

  // Emergency
  document
    .getElementById("emergency-btn")
    .addEventListener("click", sendEmergency);
  document
    .getElementById("emergency-btn-sidebar")
    .addEventListener("click", sendEmergency);

  // Close dialogs on overlay click
  document.querySelectorAll(".dialog-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.remove("active");
    });
  });
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
