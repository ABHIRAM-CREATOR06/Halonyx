let token = localStorage.getItem('token');
let usid = localStorage.getItem('usid');

const ws = new WebSocket('ws://localhost:8081');

ws.onmessage = (event) => {
    const msgDiv = document.createElement('div');
    msgDiv.textContent = event.data;
    document.getElementById('messages').appendChild(msgDiv);
};

if (token && usid) {
    showDashboard();
} else {
    showSignup();
}

function showSignup() {
    document.getElementById('signup-form').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
}

function showDashboard() {
    document.getElementById('signup-form').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    document.getElementById('usid').textContent = usid;
    loadContacts();
}

document.getElementById('signup-btn').addEventListener('click', async () => {
    console.log('Signup button clicked');
    try {
        const res = await fetch('/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        console.log('Response status:', res.status);
        const data = await res.json();
        console.log('Response data:', data);
        if (res.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('usid', data.usid);
            console.log('USID set:', data.usid);
            showDashboard();
        } else {
            alert('Signup failed: ' + data.error);
        }
    } catch (error) {
        console.error('Fetch error:', error);
        alert('Network error');
    }
});

document.getElementById('add-contact-btn').addEventListener('click', async () => {
    const contactUsid = document.getElementById('contact-usid').value;
    const res = await fetch('/add-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ usid: contactUsid })
    });
    if (res.ok) {
        loadContacts();
    } else {
        alert('Add contact failed');
    }
});

async function loadContacts() {
    const res = await fetch('/contacts', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const contacts = await res.json();
    const list = document.getElementById('contacts-list');
    list.innerHTML = '';
    contacts.forEach(c => {
        const li = document.createElement('li');
        li.textContent = c;
        list.appendChild(li);
    });
}

document.getElementById('send-btn').addEventListener('click', () => {
    const message = document.getElementById('message-input').value;
    ws.send(message);
    document.getElementById('message-input').value = '';
});