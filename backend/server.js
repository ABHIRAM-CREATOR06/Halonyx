const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const fs = require('fs');
const { generateUSID, hashUSID } = require('./utils');
const { sendVerificationEmail, generateVerificationToken } = require('./email');
const WebSocket = require('ws');

const app = express();
app.use(express.json());

const db = new sqlite3.Database('./backend/db/app.db');

// Initialize DB
db.serialize(() => {
    const schema = fs.readFileSync('./backend/db/schema.sql', 'utf8');
    const statements = schema.split(';').filter(stmt => stmt.trim());
    statements.forEach(stmt => {
        db.run(stmt);
    });
});

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Routes

app.post('/signup', (req, res) => {
    const usid = generateUSID();
    const hashed = hashUSID(usid);
    console.log('Generated USID:', usid, 'Hashed:', hashed);
    // Placeholder for Signal key bundle
    const publicKeyBundle = JSON.stringify({ identityKey: 'placeholder-public-key' });

    db.run('INSERT INTO users (hashed_usid, public_key_bundle) VALUES (?, ?)', [hashed, publicKeyBundle], function(err) {
        if (err) {
            console.log('Signup DB error:', err);
            return res.status(500).json({ error: 'DB error' });
        }
        const jwtToken = jwt.sign({ userId: this.lastID, usid }, JWT_SECRET);
        console.log('Returning USID:', usid, 'Token:', jwtToken);
        res.json({ message: 'Account created', usid, token: jwtToken });
    });
});

// Middleware for authentication
function authenticate(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Invalid token' });
        req.user = decoded;
        next();
    });
}

app.post('/add-contact', authenticate, (req, res) => {
    const { usid } = req.body;
    console.log('Add contact request:', { userId: req.user.userId, usid });
    const hashed = hashUSID(usid);
    console.log('Hashed USID:', hashed);
    db.get('SELECT id FROM users WHERE hashed_usid = ?', [hashed], (err, contact) => {
        if (err) {
            console.log('DB error finding contact:', err);
            return res.status(500).json({ error: 'DB error' });
        }
        if (!contact) {
            console.log('USID not found');
            return res.status(404).json({ error: 'USID not found' });
        }
        console.log('Contact found, ID:', contact.id);
        db.run('INSERT INTO contacts (user_id, contact_hashed_usid) VALUES (?, ?)', [req.user.userId, hashed], function(err) {
            if (err) {
                console.log('Insert contact error:', err);
                return res.status(400).json({ error: 'Already added or error' });
            }
            console.log('Contact added successfully');
            res.json({ message: 'Contact added' });
        });
    });
});

app.post('/resolve-usid', (req, res) => {
    const { usid } = req.body;
    const hashed = hashUSID(usid);
    db.get('SELECT public_key_bundle FROM users WHERE hashed_usid = ?', [hashed], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'USID not found' });
        res.json({ publicKeyBundle: JSON.parse(user.public_key_bundle) });
    });
});

// WebSocket for messaging
// Kill any existing process on 8080 if needed, or change port
const wss = new WebSocket.Server({ port: 8081 });
wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        // Placeholder for Signal protocol handling
        console.log('Received message:', message.toString());
        // Broadcast to all clients (including sender for testing)
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message.toString());
            }
        });
    });
});

app.use(express.static('frontend'));

app.get('/contacts', authenticate, (req, res) => {
    db.all('SELECT contact_hashed_usid FROM contacts WHERE user_id = ?', [req.user.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json(rows.map(r => r.contact_hashed_usid));
    });
});

app.listen(3000, () => console.log('Server running on port 3000'));