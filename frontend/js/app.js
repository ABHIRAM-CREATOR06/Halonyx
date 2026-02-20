// State management
let token = localStorage.getItem('token');
let myUsid = localStorage.getItem('usid');

// Force clean state if values are corrupted
if (myUsid === 'null' || myUsid === 'undefined' || !myUsid) myUsid = null;
if (token === 'null' || token === 'undefined' || !token) token = null;

let currentChatUsid = null; // Always a hashed USID
let contacts = []; // List of hashed USIDs
let messageHistory = JSON.parse(localStorage.getItem('messageHistory') || '{}');

console.log('[Init] Halonyx: Secura initializing...');

// MANDATORY INITIALIZATION FLOW
window.addEventListener('load', () => {
    const splashHeader = document.getElementById('splash-header');
    const registrationForm = document.getElementById('registration-form');
    const loaderContainer = document.getElementById('splash-loader-container');

    if (token && myUsid) {
        // User exists: verifying identity with server...
        console.log('[Init] Existing credentials found. Verifying identity...');
        loaderContainer.style.display = 'block';
        connectWS();
    } else {
        // New user or cleared state: forcing registration
        console.log('[Init] No credentials. Showing mandatory registration.');
        setTimeout(() => {
            splashHeader.classList.add('shift-up');
            registrationForm.style.display = 'block';
        }, 1200);
    }
});

function hideSplashScreen() {
    const splash = document.getElementById('splash-screen');
    splash.classList.add('hidden');
    setTimeout(() => {
        splash.style.display = 'none';
        showMainView();
    }, 800);
}

function showRegistrationForm() {
    const splash = document.getElementById('splash-screen');
    const splashHeader = document.getElementById('splash-header');
    const registrationForm = document.getElementById('registration-form');
    const loaderContainer = document.getElementById('splash-loader-container');

    splash.classList.remove('hidden');
    splash.style.display = 'flex';
    loaderContainer.style.display = 'none';
    splashHeader.classList.add('shift-up');
    registrationForm.style.display = 'block';
}

let ws;
let reconnectTimeout = null;

function connectWS() {
    if (!myUsid) return;

    ws = new WebSocket(`ws://${window.location.hostname}:8081`);

    ws.onopen = () => {
        console.log('[WS] Connected. Sending registration check...');
        registerConnection();
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('[WS] Payload:', data.type);

            if (data.type === 'registered') {
                console.log('[WS] Identity confirmed.');
                hideSplashScreen();
            } else if (data.type === 'error' && data.message === 'Identity not verified') {
                console.error('[WS] Identity FAILED. Forcing re-registration.');
                localStorage.removeItem('token');
                localStorage.removeItem('usid');
                token = null;
                myUsid = null;
                showSnackbar('Identity invalid. Registration mandatory.');
                showRegistrationForm();
            } else if (data.type === 'message') {
                const { from, content, timestamp } = data;
                saveMessage(from, { from, content, timestamp });
                if (currentChatUsid === from) renderMessages();
                else showSnackbar(`New message received`);
            } else if (data.type === 'emergency_broadcast') {
                showEmergencyAlert(data.content, data.from);
            }
        } catch (e) {
            console.error('WS logic error', e);
        }
    };

    ws.onclose = () => {
        if (myUsid) {
            console.log('[WS] Reconnecting...');
            reconnectTimeout = setTimeout(connectWS, 2000);
        }
    };
}

// Functions
function registerConnection() {
    if (ws && ws.readyState === WebSocket.OPEN && myUsid) {
        ws.send(JSON.stringify({ type: 'register', usid: myUsid }));
    }
}

function saveMessage(chatUsid, msg) {
    if (!messageHistory[chatUsid]) messageHistory[chatUsid] = [];
    messageHistory[chatUsid].push(msg);
    localStorage.setItem('messageHistory', JSON.stringify(messageHistory));
}

async function signup() {
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const registrationForm = document.getElementById('registration-form');
    const loaderContainer = document.getElementById('splash-loader-container');

    if (!name) {
        showSnackbar('Please enter your name');
        return;
    }
    if (!email || !email.includes('@')) {
        showSnackbar('Please enter a valid email');
        return;
    }

    try {
        // Transition to loader
        registrationForm.style.display = 'none';
        loaderContainer.style.display = 'block';

        console.log('[Signup] Requesting new account...');
        const res = await fetch('/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email })
        });
        const data = await res.json();

        if (res.ok) {
            token = data.token;
            myUsid = data.usid;
            localStorage.setItem('token', token);
            localStorage.setItem('usid', myUsid);
            console.log('[Signup] Success. Connecting to verify identity...');

            connectWS(); // Initialize WS now that we have USID
            updateUsidDisplay();
        } else {
            // Show form again on error
            loaderContainer.style.display = 'none';
            registrationForm.style.display = 'block';
            showSnackbar('Signup failed: ' + data.error);
        }
    } catch (e) {
        loaderContainer.style.display = 'none';
        registrationForm.style.display = 'block';
        showSnackbar('Network error during signup');
    }
}

async function loadContacts() {
    if (!token) return;
    try {
        const res = await fetch('/contacts', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        contacts = await res.json();
        renderContactsList();
    } catch (e) {
        console.error('Failed to load contacts', e);
    }
}

async function addContact() {
    const usidInput = document.getElementById('contact-usid');
    const contactUsid = usidInput.value.trim();
    if (!contactUsid) return;

    console.log('[AddContact] Attempting to add:', contactUsid.substring(0, 8) + '...');
    try {
        const res = await fetch('/add-contact', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ usid: contactUsid })
        });
        if (res.ok) {
            usidInput.value = '';
            hideDialog('add-contact-dialog');
            loadContacts();
            showSnackbar('Contact added');
        } else {
            const data = await res.json();
            showSnackbar(data.error || 'Failed to add contact');
        }
    } catch (e) {
        showSnackbar('Error adding contact');
    }
}

function sendMessage() {
    const input = document.getElementById('message-input');
    const content = input.value.trim();
    if (!content || !currentChatUsid) return;

    console.log('[Message] Sending to:', currentChatUsid.substring(0, 8) + '...');
    const msg = {
        type: 'message',
        to: currentChatUsid,
        content: content
    };

    ws.send(JSON.stringify(msg));

    const localMsg = {
        from: 'me',
        content,
        timestamp: new Date().toISOString()
    };
    saveMessage(currentChatUsid, localMsg);

    input.value = '';
    renderMessages();
}

// UI Rendering
function updateUsidDisplay() {
    const snippetEl = document.getElementById('user-usid-snippet');
    const fullCodeEl = document.getElementById('my-usid-code');

    if (myUsid && snippetEl && fullCodeEl) {
        snippetEl.textContent = myUsid;
        fullCodeEl.textContent = myUsid;
    }
}

function renderContactsList() {
    const list = document.getElementById('contacts-list');
    if (contacts.length === 0) {
        list.innerHTML = `
            <div class="m3-list-item empty-state" role="listitem">
                <div class="m3-list-item-text">
                    <span class="m3-list-item-headline">No contacts yet</span>
                    <span class="m3-list-item-supporting-text">Add someone to start chatting</span>
                </div>
            </div>`;
        return;
    }

    list.innerHTML = contacts.map(c => {
        const history = messageHistory[c] || [];
        const lastMsg = history.length > 0 ? history[history.length - 1].content : 'No messages yet';
        return `
            <div class="m3-list-item" tabindex="0" onclick="openChat('${c}')" onkeypress="if(event.key==='Enter')openChat('${c}')" role="listitem">
                <span class="material-icons-outlined" aria-hidden="true">account_circle</span>
                <div class="m3-list-item-text">
                    <span class="m3-list-item-headline">${c.substring(0, 12)}...</span>
                    <span class="m3-list-item-supporting-text">${lastMsg}</span>
                </div>
            </div>
        `;
    }).join('');
}

function openChat(hashedUsid) {
    currentChatUsid = hashedUsid;
    document.getElementById('app-bar-title').textContent = hashedUsid.substring(0, 12) + '...';
    document.getElementById('user-usid-snippet').style.visibility = 'hidden';
    document.getElementById('contacts-screen').classList.remove('show');
    document.getElementById('chat-screen').classList.add('show');
    document.getElementById('back-to-contacts').style.display = 'flex';
    renderMessages();
    setTimeout(() => document.getElementById('message-input').focus(), 100);
}

function renderMessages() {
    const container = document.getElementById('messages-container');
    const history = messageHistory[currentChatUsid] || [];

    container.innerHTML = history.map(msg => {
        const isMe = msg.from === 'me';
        const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return `
            <div class="message-bubble ${isMe ? 'message-sent' : 'message-received'}">
                ${msg.content}
                <span class="message-time">${time}</span>
            </div>
        `;
    }).join('');

    container.scrollTop = container.scrollHeight;
}

// Navigation & Dialog Helpers
function showMainView() {
    document.getElementById('main-view').classList.add('active');
    updateUsidDisplay();
    loadContacts();
}

function showDialog(id) {
    const dialog = document.getElementById(id);
    dialog.classList.add('active');
    const firstInput = dialog.querySelector('input, button:not([disabled])');
    if (firstInput) setTimeout(() => firstInput.focus(), 150);
}

function hideDialog(id) {
    document.getElementById(id).classList.remove('active');
}

function showSnackbar(text) {
    const snack = document.getElementById('snackbar');
    if (!snack) return;
    snack.querySelector('.m3-snackbar-text').textContent = text;
    snack.classList.add('active');
    setTimeout(() => snack.classList.remove('active'), 3000);
}

function showEmergencyAlert(content, from) {
    const banner = document.createElement('div');
    banner.className = 'emergency-alert-banner';
    banner.innerHTML = `
        <span class="material-icons-outlined">report_problem</span>
        <div style="flex:1">
            <div style="font-weight:700">EMERGENCY BROADCAST</div>
            <div style="font-size:14px">${content}</div>
        </div>
        <button class="m3-button m3-button-text" style="color:white" onclick="this.parentElement.remove()">Dismiss</button>
    `;
    document.getElementById('main-view').prepend(banner);
    showSnackbar('!!! EMERGENCY ALERT RECEIVED !!!');
}

// Event Listeners
document.getElementById('signup-btn').addEventListener('click', signup);
document.getElementById('fab-add-contact').addEventListener('click', () => showDialog('add-contact-dialog'));
document.getElementById('cancel-add-contact').addEventListener('click', () => hideDialog('add-contact-dialog'));
document.getElementById('confirm-add-contact').addEventListener('click', addContact);
document.getElementById('show-profile').addEventListener('click', () => {
    updateUsidDisplay();
    showDialog('profile-dialog');
});
document.getElementById('close-profile').addEventListener('click', () => hideDialog('profile-dialog'));
document.getElementById('copy-usid').addEventListener('click', () => {
    navigator.clipboard.writeText(myUsid);
    showSnackbar('USID copied to clipboard');
});

document.getElementById('back-to-contacts').addEventListener('click', () => {
    currentChatUsid = null;
    document.getElementById('app-bar-title').textContent = 'Halonyx';
    document.getElementById('user-usid-snippet').style.visibility = 'visible';
    document.getElementById('contacts-screen').classList.add('show');
    document.getElementById('chat-screen').classList.remove('show');
    document.getElementById('back-to-contacts').style.display = 'none';
    loadContacts();
});

document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Emergency Broadcast logic
document.getElementById('emergency-btn').addEventListener('click', () => {
    const content = "EMERGENCY ALERT: Immediate assistance required!";
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'emergency_broadcast',
            content: content,
            from: myUsid || 'Anonymous'
        }));
        showSnackbar('Emergency broadcast sent!');
    } else {
        showSnackbar('Cannot send: Offline');
    }
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.m3-dialog-overlay.active').forEach(d => {
            hideDialog(d.id);
        });
    }
});