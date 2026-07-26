/* ─── Halonyx — app.js ─── */
'use strict';

/* ── State ── */
let currentContact = null;
let contacts = [];
let messageStore = {};
let audioCtx = null;

/* ── Seed contacts ── */
const SEED_CONTACTS = [
  {
    id: 'c1',
    name: 'Commander Ellis',
    usid: '0x3f9a2bc1d4e87f2a1bc3d5e69f2a7b1c4d8e9f23',
    online: true,
    verified: true,
    preview: 'Safe numbers verified.',
    time: '09:42',
    avatar: 'CE',
    avatarColor: ['#3730A3','#1D4ED8'],
    unread: 0,
  },
  {
    id: 'c2',
    name: 'Agent Rivera',
    usid: '0xd7c2a1f4b8e93c17a0b4d6f8e1c2d3e4f5a6b7c8',
    online: false,
    verified: false,
    preview: 'File received. Reviewing.',
    time: 'Yesterday',
    avatar: 'AR',
    avatarColor: ['#065F46','#047857'],
    unread: 2,
  },
  {
    id: 'c3',
    name: 'Dr. K. Nakamura',
    usid: '0xb1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0',
    online: true,
    verified: true,
    preview: 'The session healed automatically.',
    time: '08:10',
    avatar: 'KN',
    avatarColor: ['#7C3AED','#6D28D9'],
    unread: 0,
  },
  {
    id: 'c4',
    name: 'Ops Center',
    usid: '0xe4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3',
    online: true,
    verified: true,
    preview: 'Broadcast acknowledged.',
    time: '07:55',
    avatar: 'OC',
    avatarColor: ['#B45309','#D97706'],
    unread: 1,
  },
];

/* ── Seed messages ── */
const SEED_MESSAGES = {
  c1: [
    { id: 'm1', dir: 'in', text: 'Secure channel established. Safety numbers verified ✓', time: '09:38', status: 'delivered' },
    { id: 'm2', dir: 'out', text: 'Confirmed. Running X3DH handshake now.', time: '09:39', status: 'delivered' },
    { id: 'm3', dir: 'in', text: 'Key exchange complete. Post-compromise security active — double ratchet is running.', time: '09:40', status: 'delivered' },
    { id: 'm4', dir: 'out', text: 'Affirmative. All future messages are forward-secret.', time: '09:41', status: 'delivered' },
    { id: 'm5', dir: 'in', text: 'Safe numbers verified.', time: '09:42', status: 'delivered' },
  ],
  c2: [
    { id: 'm1', dir: 'out', text: 'Sending the document now via P2P.', time: 'Yest 15:20', status: 'delivered' },
    { id: 'm2', dir: 'in', text: 'File received. Reviewing.', time: 'Yest 15:22', status: 'delivered', file: { name: 'threat-assessment.pdf', size: '2.4 MB' } },
  ],
  c3: [
    { id: 'm1', dir: 'in', text: 'Identity key changed warning — this is expected post-rekey.', time: '08:05', status: 'delivered' },
    { id: 'm2', dir: 'out', text: 'Understood. Running safety number check.', time: '08:08', status: 'delivered' },
    { id: 'm3', dir: 'in', text: 'The session healed automatically.', time: '08:10', status: 'delivered' },
  ],
  c4: [
    { id: 'm1', dir: 'in', text: '[BROADCAST] Network maintenance scheduled at 22:00 UTC. All sessions will persist.', time: '07:50', status: 'delivered' },
    { id: 'm2', dir: 'out', text: 'Broadcast acknowledged.', time: '07:55', status: 'delivered' },
  ],
};

/* ─────────────────────── Init ─────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadIdentity();
  contacts = JSON.parse(JSON.stringify(SEED_CONTACTS));
  messageStore = JSON.parse(JSON.stringify(SEED_MESSAGES));
  renderContactList(contacts);
  setupBroadcastCounter();
});

function loadIdentity() {
  const name  = sessionStorage.getItem('halonyx_name') || 'Agent';
  const usid  = sessionStorage.getItem('halonyx_usid') || '0x' + Array.from(
    crypto.getRandomValues(new Uint8Array(20)),
    b => b.toString(16).padStart(2,'0')
  ).join('');

  document.getElementById('self-name').textContent = name;
  document.getElementById('self-usid').textContent = usid.slice(0,20) + '…';
  document.getElementById('self-avatar').textContent = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();

  const settingsUSID = document.getElementById('settings-usid-display');
  if (settingsUSID) settingsUSID.textContent = usid;
  const settingsName = document.getElementById('settings-name-display');
  if (settingsName) settingsName.textContent = name;

  sessionStorage.setItem('halonyx_usid', usid);
}

/* ─────────────────────── Contact List ─────────────────────── */
function renderContactList(list) {
  const el = document.getElementById('contact-list');
  if (!list.length) {
    el.innerHTML = '<div class="contact-list-empty">No contacts. Add a contact by USID.</div>';
    return;
  }

  el.innerHTML = list.map(c => `
    <div class="contact-item ${currentContact?.id === c.id ? 'active' : ''}"
         id="contact-item-${c.id}"
         onclick="openChat('${c.id}')"
         role="button"
         aria-label="Open chat with ${c.name}">
      <div class="contact-avatar ${c.verified ? 'verified' : ''}"
           style="background:linear-gradient(135deg,${c.avatarColor[0]},${c.avatarColor[1]})">
        ${c.avatar}
      </div>
      <div class="contact-info">
        <div class="contact-name">${c.name}</div>
        <div class="contact-preview">${c.preview}</div>
      </div>
      <div class="contact-meta">
        <span class="contact-time">${c.time}</span>
        ${c.unread > 0 ? `<span class="unread-badge">${c.unread}</span>` : ''}
      </div>
    </div>
  `).join('');
}

function filterContacts(query) {
  const q = query.toLowerCase().trim();
  const filtered = q
    ? contacts.filter(c => c.name.toLowerCase().includes(q) || c.usid.includes(q))
    : contacts;
  renderContactList(filtered);
}

function toggleMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.toggle('open');
}

/* ─────────────────────── Chat ─────────────────────── */
function openChat(contactId) {
  currentContact = contacts.find(c => c.id === contactId);
  if (!currentContact) return;

  // Mobile sidebar close
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');

  // Update active state
  document.querySelectorAll('.contact-item').forEach(el => el.classList.remove('active'));
  const item = document.getElementById(`contact-item-${contactId}`);
  if (item) item.classList.add('active');

  // Clear unread
  currentContact.unread = 0;
  renderContactList(contacts);

  // Show chat view
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('chat-view').style.display = 'flex';

  // Set header info
  document.getElementById('chat-avatar').textContent = currentContact.avatar;
  document.getElementById('chat-avatar').style.background =
    `linear-gradient(135deg,${currentContact.avatarColor[0]},${currentContact.avatarColor[1]})`;
  document.getElementById('chat-contact-name').textContent = currentContact.name;
  document.getElementById('chat-contact-usid').textContent =
    currentContact.usid.slice(0,20) + '…';

  const statusEl = document.getElementById('chat-contact-status');
  const dot = currentContact.online
    ? '<span class="status-dot online"></span>Online'
    : '<span class="status-dot offline"></span>Offline';
  statusEl.innerHTML = dot;

  // Render messages
  renderMessages(contactId);
  playSound('open');
}

function renderMessages(contactId) {
  const area = document.getElementById('messages-area');
  const msgs = messageStore[contactId] || [];

  if (!msgs.length) {
    area.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;color:var(--text-muted);font-size:13px;">
        <svg viewBox="0 0 20 20" fill="none" style="width:32px;height:32px;opacity:.4">
          <path d="M10 2L18 6V11C18 15.2 14.4 18.5 10 20C5.6 18.5 2 15.2 2 11V6L10 2Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
        </svg>
        <span>No messages yet. Session keys will be exchanged on first message.</span>
      </div>
    `;
    return;
  }

  area.innerHTML = `
    <div class="date-divider">
      <div class="date-divider-line"></div>
      <span class="date-divider-label">Today · End-to-End Encrypted</span>
      <div class="date-divider-line"></div>
    </div>
    ${msgs.map(m => renderMessage(m)).join('')}
  `;

  area.scrollTop = area.scrollHeight;
}

function renderMessage(msg) {
  if (msg.file) {
    return `
      <div class="msg-row ${msg.dir}" id="msg-${msg.id}">
        <div class="msg-bubble">
          <div class="msg-file" onclick="simulateFileDownload('${msg.file.name}')">
            <div class="msg-file-icon">
              <svg viewBox="0 0 16 16" fill="none"><path d="M4 2H10L13 5V14H4V2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M10 2V5H13" stroke="currentColor" stroke-width="1.3"/><path d="M6 9H10M6 11H8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
            </div>
            <div>
              <div class="msg-file-name">${escapeHtml(msg.file.name)}</div>
              <div class="msg-file-size">${msg.file.size} · P2P transfer</div>
            </div>
          </div>
          ${msg.text ? `<div style="margin-top:6px;font-size:13.5px;">${escapeHtml(msg.text)}</div>` : ''}
          <div class="msg-meta">
            <span class="msg-time">${msg.time}</span>
            ${renderMsgStatus(msg)}
          </div>
          <div class="encrypted-label">
            <svg viewBox="0 0 10 12" fill="none"><rect x="1" y="5" width="8" height="7" rx="1" stroke="currentColor" stroke-width="1"/><path d="M3 5V3.5C3 2.119 3.895 1 5 1C6.105 1 7 2.119 7 3.5V5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>
            Signal Protocol · E2EE
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="msg-row ${msg.dir}" id="msg-${msg.id}">
      <div class="msg-bubble">
        ${escapeHtml(msg.text)}
        <div class="msg-meta">
          <span class="msg-time">${msg.time}</span>
          ${renderMsgStatus(msg)}
        </div>
        <div class="encrypted-label">
          <svg viewBox="0 0 10 12" fill="none"><rect x="1" y="5" width="8" height="7" rx="1" stroke="currentColor" stroke-width="1"/><path d="M3 5V3.5C3 2.119 3.895 1 5 1C6.105 1 7 2.119 7 3.5V5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>
          Signal Protocol · E2EE
        </div>
      </div>
    </div>
  `;
}

function renderMsgStatus(msg) {
  if (msg.dir !== 'out') return '';
  if (msg.status === 'queued') {
    return `<span class="msg-status queued" title="Queued (recipient offline)">
      <svg viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.2"/><path d="M6 3V6L8 7.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
    </span>`;
  }
  return `<span class="msg-status delivered" title="Delivered">
    <svg viewBox="0 0 14 10" fill="none"><path d="M1 5L5 9L13 1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </span>`;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ─────────────────────── Send message ─────────────────────── */
function sendMessage() {
  if (!currentContact) return;
  const input = document.getElementById('message-input');
  const text  = input.value.trim();
  if (!text) return;

  const msg = {
    id: 'msg-' + Date.now(),
    dir: 'out',
    text,
    time: formatTime(new Date()),
    status: currentContact.online ? 'delivered' : 'queued',
  };

  if (!messageStore[currentContact.id]) messageStore[currentContact.id] = [];
  messageStore[currentContact.id].push(msg);

  // Update preview
  currentContact.preview = text;
  currentContact.time = formatTime(new Date());

  renderMessages(currentContact.id);
  renderContactList(contacts);

  input.value = '';
  input.style.height = '';
  playSound('send');

  // Simulate response after delay (for demo)
  if (currentContact.online) {
    setTimeout(() => simulateReply(currentContact.id), 1800 + Math.random() * 2000);
  }
}

function simulateReply(contactId) {
  if (currentContact?.id !== contactId) return;
  const responses = [
    'Message received. Encryption layer validated.',
    'Affirmative. Double ratchet step completed.',
    'Forward secrecy maintained. New message keys derived.',
    'Understood. Session keys rotated.',
    'Copy that. Safety numbers still match.',
  ];
  const contact = contacts.find(c => c.id === contactId);
  if (!contact) return;

  const msg = {
    id: 'msg-' + Date.now(),
    dir: 'in',
    text: responses[Math.floor(Math.random() * responses.length)],
    time: formatTime(new Date()),
    status: 'delivered',
  };

  messageStore[contactId].push(msg);
  contact.preview = msg.text;
  contact.time = formatTime(new Date());

  renderMessages(contactId);
  renderContactList(contacts);
  playSound('receive');
}

function handleMsgKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function autoResize(el) {
  el.style.height = '';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

function formatTime(d) {
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
}

/* ─────────────────────── Add contact ─────────────────────── */
async function doAddContact() {
  const usid = document.getElementById('add-contact-usid').value.trim();
  const name = document.getElementById('add-contact-name').value.trim() || 'Contact ' + (contacts.length + 1);

  if (!usid || usid.length < 6) {
    showAppToast('Enter a valid USID.', 'error');
    return;
  }

  if (contacts.find(c => c.usid === usid)) {
    showAppToast('Contact already exists.', 'warning');
    closeModal('modal-add-contact');
    return;
  }

  const token = sessionStorage.getItem('halonyx_token');
  if (token) {
    try {
      const res = await fetch('/add-contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ usid })
      });
      if (res.ok) {
        showAppToast('Contact registered on server!', 'success');
      }
    } catch (e) {
      console.warn('Backend add-contact fallback:', e.message);
    }
  }

  const colors = [
    ['#1E3A5F','#1D4ED8'],
    ['#3D1A78','#6D28D9'],
    ['#0F3D2E','#047857'],
    ['#5C1A1A','#B91C1C'],
  ];
  const colorPair = colors[contacts.length % colors.length];
  const initials = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();

  const newContact = {
    id: 'c' + Date.now(),
    name,
    usid,
    online: false,
    verified: false,
    preview: 'No messages yet.',
    time: '',
    avatar: initials,
    avatarColor: colorPair,
    unread: 0,
  };

  contacts.push(newContact);
  document.getElementById('add-contact-usid').value = '';
  document.getElementById('add-contact-name').value = '';
  closeModal('modal-add-contact');

  renderContactList(contacts);
  showAppToast(`Added ${name}. Verify safety numbers before messaging.`, 'success');
}

/* ─────────────────────── Remove contact ─────────────────────── */
function removeCurrentContact() {
  if (!currentContact) return;
  const name = currentContact.name;
  contacts = contacts.filter(c => c.id !== currentContact.id);
  delete messageStore[currentContact.id];
  currentContact = null;

  document.getElementById('chat-view').style.display = 'none';
  document.getElementById('empty-state').style.display = '';

  renderContactList(contacts);
  showAppToast(`${name} removed from contacts.`, 'info');
}

/* ─────────────────────── Safety Numbers ─────────────────────── */
function openSafetyNumbers() {
  if (!currentContact) return;

  document.getElementById('safety-contact-name').textContent = currentContact.name;

  // Generate deterministic-looking 60 digit fingerprint
  const digits = generateSafetyDigits(
    sessionStorage.getItem('halonyx_usid') || '0x0',
    currentContact.usid
  );

  const container = document.getElementById('safety-numbers-display');
  // Group into 12 groups of 5
  const groups = [];
  for (let i = 0; i < digits.length; i += 5) {
    groups.push(digits.slice(i, i+5));
  }

  container.innerHTML = groups.map(g => `
    <div class="safety-digit-group">
      <div class="safety-digit">${g}</div>
    </div>
  `).join('');

  openModal('modal-safety');
}

function generateSafetyDigits(usid1, usid2) {
  const combined = (usid1 + usid2).replace(/0x/g,'');
  let hash = '';
  for (let i = 0; i < 60; i++) {
    const idx = i % combined.length;
    const charCode = combined.charCodeAt(idx);
    hash += ((charCode * (i+7) * 31 + 17) % 10).toString();
  }
  return hash;
}

function markVerified() {
  if (currentContact) {
    currentContact.verified = true;
    renderContactList(contacts);
    showAppToast(`${currentContact.name} marked as verified.`, 'success');
  }
  closeModal('modal-safety');
}

/* ─────────────────────── File Transfer ─────────────────────── */
function showFileTransferPanel() {
  const panel = document.getElementById('file-transfer-panel');
  panel.style.display = panel.style.display === 'none' ? '' : 'none';
}

function hideFileTransferPanel() {
  document.getElementById('file-transfer-panel').style.display = 'none';
}

function handleFileSend(input) {
  if (!input.files.length || !currentContact) return;
  const file = input.files[0];
  input.value = '';

  // Show in transfer panel
  document.getElementById('file-transfer-panel').style.display = '';
  const transfersContainer = document.getElementById('active-transfers');
  const fEmpty = transfersContainer.querySelector('.ftp-empty');
  if (fEmpty) fEmpty.remove();

  const transferId = 'tf-' + Date.now();
  const transferEl = document.createElement('div');
  transferEl.className = 'transfer-item';
  transferEl.id = transferId;
  transferEl.innerHTML = `
    <div class="transfer-item-header">
      <span class="transfer-filename">${escapeHtml(file.name)}</span>
      <span style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">Seeding…</span>
    </div>
    <div class="transfer-progress-bar"><div class="transfer-progress-fill" id="${transferId}-fill" style="width:0%"></div></div>
    <div class="transfer-stats">
      <span id="${transferId}-up">↑ 0 KB/s</span>
      <span id="${transferId}-ratio">Ratio: 0.00</span>
    </div>
  `;
  transfersContainer.appendChild(transferEl);

  // Simulate progress
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 8 + 2;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);
      document.getElementById(`${transferId}-up`).textContent = '↑ Seeding';
      document.getElementById(`${transferId}-ratio`).textContent = 'Ratio: 1.00';

      // Add file message
      const sizeStr = file.size > 1048576
        ? (file.size / 1048576).toFixed(1) + ' MB'
        : (file.size / 1024).toFixed(0) + ' KB';

      const msg = {
        id: 'msg-' + Date.now(),
        dir: 'out',
        text: '',
        time: formatTime(new Date()),
        status: 'delivered',
        file: { name: file.name, size: sizeStr },
      };

      if (!messageStore[currentContact.id]) messageStore[currentContact.id] = [];
      messageStore[currentContact.id].push(msg);
      currentContact.preview = `📎 ${file.name}`;
      renderMessages(currentContact.id);
      renderContactList(contacts);
      showAppToast(`${file.name} transferred via P2P (WebTorrent).`, 'success');
    }

    const fill = document.getElementById(`${transferId}-fill`);
    if (fill) fill.style.width = progress + '%';
    const up = document.getElementById(`${transferId}-up`);
    if (up) up.textContent = `↑ ${(Math.random()*800+100).toFixed(0)} KB/s`;
    const ratio = document.getElementById(`${transferId}-ratio`);
    if (ratio) ratio.textContent = `Ratio: ${(progress/100).toFixed(2)}`;
  }, 250);
}

function simulateFileDownload(filename) {
  showAppToast(`Downloading "${filename}" via P2P WebTorrent…`, 'info');
}

/* ─────────────────────── Emergency Broadcast ─────────────────────── */
function setupBroadcastCounter() {
  const ta = document.getElementById('broadcast-message');
  const counter = document.getElementById('broadcast-count');
  if (ta && counter) {
    ta.addEventListener('input', () => {
      counter.textContent = ta.value.length;
    });
  }
}

function sendBroadcast() {
  const msg = document.getElementById('broadcast-message').value.trim();
  const priority = document.querySelector('input[name="priority"]:checked')?.value || 'high';

  if (!msg) {
    showAppToast('Enter a broadcast message.', 'error');
    return;
  }

  closeModal('modal-broadcast');
  document.getElementById('broadcast-message').value = '';
  document.getElementById('broadcast-count').textContent = '0';

  // Show incoming alert banner (simulates what recipients see)
  document.getElementById('alert-banner-msg').textContent = msg;
  document.getElementById('alert-banner').style.display = '';

  showAppToast(`Broadcast sent at ${priority.toUpperCase()} priority via UDP.`, 'success');
  playSound('broadcast');

  setTimeout(() => {
    document.getElementById('alert-banner').style.display = 'none';
  }, 8000);
}

function dismissAlert() {
  document.getElementById('alert-banner').style.display = 'none';
}

/* ─────────────────────── Key change simulation ─────────────────────── */
function dismissKeyChange() {
  document.getElementById('key-change-banner').style.display = 'none';
}

/* ─────────────────────── Settings ─────────────────────── */
function toggleTheme(checkbox) {
  // checked = Dark Mode ON (default), unchecked = Light mode ON
  document.body.classList.toggle('light', !checkbox.checked);
}

function regenKeys() {
  showAppToast('Key bundle regenerated. Next session will use new pre-keys.', 'success');
}

function wipeSession() {
  if (confirm('This will destroy all local keys and message history. This cannot be undone. Continue?')) {
    sessionStorage.clear();
    showAppToast('Session wiped. Redirecting…', 'warning');
    setTimeout(() => window.location.href = 'index.html', 1500);
  }
}

function copySettingsUSID() {
  const usid = sessionStorage.getItem('halonyx_usid') || '';
  if (navigator.clipboard) {
    navigator.clipboard.writeText(usid).then(() => showAppToast('USID copied.', 'success'));
  }
}

/* ─────────────────────── Logout ─────────────────────── */
function doLogout() {
  sessionStorage.removeItem('halonyx_auth');
  window.location.href = 'index.html';
}

/* ─────────────────────── Modal helpers ─────────────────────── */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

// Close on backdrop click
document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
  backdrop.addEventListener('click', e => {
    if (e.target === backdrop) closeModal(backdrop.id);
  });
});

// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-backdrop').forEach(el => {
      if (el.style.display !== 'none') closeModal(el.id);
    });
  }
});

/* ─────────────────────── Toast ─────────────────────── */
let toastTimer;
function showAppToast(msg, type = 'info') {
  const toast = document.getElementById('app-toast');
  toast.textContent = msg;
  toast.className = `app-toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3800);
}

/* ─────────────────────── Web Audio ─────────────────────── */
function getAudioCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
  }
  return audioCtx;
}

function playSound(type) {
  const enabled = document.getElementById('audio-toggle')?.checked;
  if (!enabled) return;
  const ctx = getAudioCtx();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;

  switch(type) {
    case 'send':
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now); osc.stop(now + 0.15);
      break;
    case 'receive':
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.setValueAtTime(900, now + 0.06);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now); osc.stop(now + 0.2);
      break;
    case 'open':
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.1);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now); osc.stop(now + 0.18);
      break;
    case 'broadcast':
      osc.type = 'square';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.setValueAtTime(200, now+0.1);
      osc.frequency.setValueAtTime(300, now+0.2);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now+0.3);
      osc.start(now); osc.stop(now+0.3);
      break;
  }
}
