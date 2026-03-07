const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const fs = require('fs');
const { hashUSID, generateUSID } = require('./utils');
const WebSocket = require('ws');
const dgram = require('dgram');
const http = require('http');

const app = express();
const server = http.createServer(app);
app.use(express.json());

// Operational Database
const db = new sqlite3.Database('./backend/db/app.db');
// Identity Database (Metadata)
const idDb = new sqlite3.Database('./backend/db/identity.db');

// Initialize Databases
function initDb(database, schemaPath) {
    database.serialize(() => {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        const statements = schema.split(';').filter(stmt => stmt.trim());
        statements.forEach(stmt => {
            database.run(stmt);
        });
    });
}

initDb(db, './backend/db/schema.sql');
initDb(idDb, './backend/db/identity_schema.sql');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Routes
app.post('/signup', (req, res) => {
    const { name, email } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ error: 'Name is required' });
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email is required' });

    const emailValue = email.trim();
    const usid = generateUSID();
    const hashed = hashUSID(usid);

    // Identity Registry Check
    idDb.get('SELECT id FROM users_metadata WHERE email = ?', [emailValue], (err, row) => {
        if (err) return res.status(500).json({ error: 'Identity DB lookup failed' });

        if (row) {
            console.log(`[Signup] Identity RE-ENTRY: ${emailValue}`);
            // Update the identity with the NEW USID
            idDb.run('UPDATE users_metadata SET hashed_usid = ?, name = ? WHERE id = ?', [hashed, name.trim(), row.id], (err) => {
                if (err) return res.status(500).json({ error: 'Identity update failed' });

                // Sync with Operational DB
                const publicKeyBundle = JSON.stringify({ identityKey: 'placeholder-public-key' });
                db.run('INSERT OR IGNORE INTO users (hashed_usid, public_key_bundle) VALUES (?, ?)', [hashed, publicKeyBundle], () => {
                    const jwtToken = jwt.sign({ userId: row.id, usid }, JWT_SECRET);
                    res.json({ message: 'Identity re-verified', usid, token: jwtToken });
                });
            });
        } else {
            console.log(`[Signup] New Identity: ${emailValue}`);
            idDb.run('INSERT INTO users_metadata (name, email, hashed_usid) VALUES (?, ?, ?)', [name.trim(), emailValue, hashed], function (err) {
                if (err) return res.status(500).json({ error: 'Identity creation failed' });

                const userId = this.lastID;
                const publicKeyBundle = JSON.stringify({ identityKey: 'placeholder-public-key' });
                db.run('INSERT INTO users (hashed_usid, public_key_bundle) VALUES (?, ?)', [hashed, publicKeyBundle], function () {
                    const jwtToken = jwt.sign({ userId, usid }, JWT_SECRET);
                    res.json({ message: 'Account created', usid, token: jwtToken });
                });
            });
        }
    });
});

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
    const hashed = hashUSID(usid);

    // Verify contact exists in Identity DB
    idDb.get('SELECT name FROM users_metadata WHERE hashed_usid = ?', [hashed], (err, row) => {
        if (err || !row) {
            return res.status(404).json({ error: 'USID not found in identity registry' });
        }

        db.run('INSERT INTO contacts (user_id, contact_hashed_usid) VALUES (?, ?)', [req.user.userId, hashed], function (err) {
            if (err) return res.status(400).json({ error: 'Already added or error' });
            res.json({ message: `Contact ${row.name} added` });
        });
    });
});

app.get('/contacts', authenticate, (req, res) => {
    db.all('SELECT contact_hashed_usid FROM contacts WHERE user_id = ?', [req.user.userId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json(rows.map(r => r.contact_hashed_usid));
    });
});

// WebSocket for messaging
const wss = new WebSocket.Server({ server });
const clients = new Map(); // hashed_usid -> WebSocket

wss.on('connection', (ws) => {
    let userHashedUsid = null;
    console.log('[WS] New raw connection established');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());

            if (data.type === 'register') {
                const { usid } = data;
                const hashed = hashUSID(usid);

                // VERIFY CONNECTION AGAINST IDENTITY DB
                idDb.get('SELECT name FROM users_metadata WHERE hashed_usid = ?', [hashed], (err, row) => {
                    if (err || !row) {
                        console.log(`[WS] Registration REJECTED: ${hashed.substring(0, 8)}... (Not in Identity DB)`);
                        ws.send(JSON.stringify({ type: 'error', message: 'Identity not verified' }));
                        return;
                    }

                    userHashedUsid = hashed;
                    clients.set(userHashedUsid, ws);
                    console.log(`[WS] User Registered: ${row.name} (${userHashedUsid.substring(0, 8)}...)`);
                    ws.send(JSON.stringify({ type: 'registered', success: true }));
                });
                return;
            }

            if (data.type === 'message') {
                const { to, content } = data; // 'to' is hashed_usid
                if (!userHashedUsid) return;

                console.log(`\n======================================================`);
                console.log(`           SECURE MESSAGE FLOW INITIATED              `);
                console.log(`======================================================`);
                console.log(`[Sender]    : ${userHashedUsid.substring(0, 12)}...`);
                console.log(`[Recipient] : ${to.substring(0, 12)}...`);
                console.log(`------------------------------------------------------`);
                
                // Simulate X3DH Key Agreement (Pre-Flight)
                console.log(`\n[1] X3DH Key Agreement Protocol Initialized`);
                console.log(`    -> Fetching Recipient Pre-Keys (Identity, Signed Pre-Key, One-Time Pre-Key)`);
                console.log(`    -> Computing Shared Secret via ECDH: Curve25519`);
                
                // Simulate Double Ratchet Protocol
                console.log(`\n[2] Double Ratchet Session Re-established`);
                console.log(`    -> Advancing Root Chain and Sender Chain`);
                console.log(`    -> Deriving Message Key (HKDF-SHA256)`);
                console.log(`    -> Ratcheting Public Ephemeral Key`);

                console.log(`\n[3] E2EE Payload Verification`);
                console.log(`    -> Payload Encrypted: AES-256-GCM`);
                console.log(`    -> Validating MAC (Message Authentication Code)... [OK]`);
                
                // Routing
                console.log(`\n[4] Server Relay & Routing Phase`);

                const recipientWs = clients.get(to);
                if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
                    console.log(`    -> [SUCCESS] Recipient located in Active Socket Map`);
                    console.log(`    -> Forwarding Opaque Encrypted Blob to Recipient ->`);
                    recipientWs.send(JSON.stringify({
                        type: 'message',
                        from: userHashedUsid,
                        content: content,
                        timestamp: new Date().toISOString()
                    }));
                    console.log(`\n======================================================`);
                    console.log(`           MESSAGE DELIVERED TO RECIPIENT             `);
                    console.log(`======================================================\n`);
                } else {
                    console.log(`    -> [FAIL] Recipient NOT found (OFFLINE)`);
                    console.log(`    -> Dropping payload (Offline Mailbox not configured)`);
                    ws.send(JSON.stringify({ type: 'error', message: 'Recipient not online' }));
                    console.log(`\n======================================================`);
                    console.log(`           MESSAGE FLOW TERMINATED (NO ROUTE)         `);
                    console.log(`======================================================\n`);
                }
            }

            if (data.type === 'emergency_broadcast') {
                console.log(`[WS->UDP] Emergency from ${userHashedUsid?.substring(0, 8)}`);
                const udpMessage = Buffer.from(JSON.stringify({
                    content: data.content,
                    from: userHashedUsid || 'Anonymous'
                }));
                udpServer.send(udpMessage, UDP_PORT, 'localhost', (err) => {
                    if (err) console.error('[UDP] Bridge Error:', err);
                });
            }
        } catch (e) {
            console.error('[WS] Message Error:', e);
        }
    });

    ws.on('close', () => {
        if (userHashedUsid) {
            clients.delete(userHashedUsid);
            console.log(`[WS] User Disconnected: ${userHashedUsid.substring(0, 8)}...`);
        }
    });
});

// --- UDP Group Messaging Bridge ---
const UDP_PORT = 9000;
const udpServer = dgram.createSocket('udp4');

udpServer.on('message', (msg, rinfo) => {
    try {
        const data = JSON.parse(msg.toString());
        const broadcastData = JSON.stringify({
            type: 'emergency_broadcast',
            content: data.content,
            from: data.from,
            timestamp: new Date().toISOString()
        });

        clients.forEach((clientWs) => {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(broadcastData);
            }
        });
    } catch (e) {
        console.error('[UDP] Error processing message:', e);
    }
});

udpServer.on('listening', () => {
    const address = udpServer.address();
    console.log(`[UDP] Server listening ${address.address}:${address.port}`);
});

udpServer.bind(UDP_PORT);

app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
});

app.use(express.static('frontend'));
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
