const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const { hashUSID, generateUSID } = require("./utils");
const WebSocket = require("ws");
const dgram = require("dgram");
const http = require("http");
const rateLimit = require("express-rate-limit");

const app = express();
const server = http.createServer(app);
app.use(express.json());
app.set('trust proxy', 1);

// ── Serve Frontend ──
app.use(express.static(path.join(__dirname, "../frontend")));

// Operational Database
const db = new sqlite3.Database("./backend/db/app.db");
// Identity Database (Metadata)
const idDb = new sqlite3.Database("./backend/db/identity.db");
const keyDb = new sqlite3.Database("./backend/db/keys.db");

// Initialize Databases
function initDb(database, schemaPath) {
  database.serialize(() => {
    const schema = fs.readFileSync(schemaPath, "utf8");
    const statements = schema.split(";").filter((stmt) => stmt.trim());
    statements.forEach((stmt) => {
      database.run(stmt);
    });
  });
}

initDb(db, "./backend/db/schema.sql");
initDb(idDb, "./backend/db/identity_schema.sql");
initDb(keyDb, "./backend/db/key_schema.sql");

const crypto = require("crypto");
const JWT_SECRET_FILE = "./backend/db/.jwt_secret";

function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  try {
    if (fs.existsSync(JWT_SECRET_FILE)) {
      const stored = fs.readFileSync(JWT_SECRET_FILE, "utf8").trim();
      if (stored && stored.length >= 16) return stored;
    }
    const secret = crypto.randomBytes(32).toString("hex");
    const dbDir = "./backend/db";
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    fs.writeFileSync(JWT_SECRET_FILE, secret, "utf8");
    return secret;
  } catch (e) {
    return crypto.randomBytes(32).toString("hex");
  }
}
const JWT_SECRET = getJwtSecret();

const signupLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: "Too many accounts created from this IP, please try again after 5 minutes" },
  validate: { trustProxy: false, xForwardedForHeader: false },
});

const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: "Too many key uploads from this IP, please try again later" },
  validate: { trustProxy: false, xForwardedForHeader: false },
});

// Routes
app.post("/signup", signupLimiter, (req, res) => {
  const { name, email, publicKey } = req.body;
  if (!name || name.trim() === "")
    return res.status(400).json({ error: "Name is required" });
  if (!email || !email.includes("@"))
    return res.status(400).json({ error: "Valid email is required" });

  const emailValue = email.trim();
  const usid = generateUSID();
  const hashed = hashUSID(usid);
  // Use submitted public key if provided, otherwise fall back to placeholder
  const publicKeyBundle = JSON.stringify({
    identityKey: publicKey || "placeholder-public-key",
  });

  // Identity Registry Check
  idDb.get(
    "SELECT id, hashed_usid FROM users_metadata WHERE email = ?",
    [emailValue],
    (err, row) => {
      if (err)
        return res.status(500).json({ error: "Identity DB lookup failed" });

      if (row) {
        console.log(`[Signup] Identity RE-ENTRY: ${emailValue}`);
        const existingHashedUsid = row.hashed_usid;
        idDb.run(
          "UPDATE users_metadata SET name = ? WHERE id = ?",
          [name.trim(), row.id],
          (updateErr) => {
            if (updateErr)
              return res.status(500).json({ error: "Identity update failed" });
            db.run(
              "INSERT OR IGNORE INTO users (hashed_usid, public_key_bundle) VALUES (?, ?)",
              [existingHashedUsid, publicKeyBundle],
              () => {
                const jwtToken = jwt.sign({ userId: row.id, hashedUsid: existingHashedUsid }, JWT_SECRET);
                res.json({
                  message: "Identity re-verified",
                  usid: existingHashedUsid,
                  token: jwtToken,
                });
              },
            );
          },
        );
      } else {
        console.log(`[Signup] New Identity: ${emailValue}`);
        idDb.run(
          "INSERT INTO users_metadata (name, email, hashed_usid) VALUES (?, ?, ?)",
          [name.trim(), emailValue, hashed],
          function (err) {
            if (err)
              return res
                .status(500)
                .json({ error: "Identity creation failed" });
            const userId = this.lastID;
            db.run(
              "INSERT INTO users (hashed_usid, public_key_bundle) VALUES (?, ?)",
              [hashed, publicKeyBundle],
              function () {
                const jwtToken = jwt.sign({ userId, hashedUsid: hashed }, JWT_SECRET);
                res.json({ message: "Account created", usid: hashed, token: jwtToken });
              },
            );
          },
        );
      }
    },
  );
});

app.post("/connect", (req, res) => {
  const { usid, email } = req.body;
  if ((!usid || !usid.trim()) && (!email || !email.includes("@"))) {
    return res.status(400).json({ error: "USID or valid Email is required to connect" });
  }

  if (usid && usid.trim()) {
    const cleanUsid = usid.trim();
    const hashed = hashUSID(cleanUsid);

    idDb.get(
      "SELECT id, name, email, hashed_usid FROM users_metadata WHERE hashed_usid = ? OR hashed_usid = ?",
      [cleanUsid, hashed],
      (err, row) => {
        if (err) return res.status(500).json({ error: "Identity DB lookup failed" });
        if (!row) return res.status(404).json({ error: "Identity not found. Please sign up first." });

        const jwtToken = jwt.sign({ userId: row.id, hashedUsid: row.hashed_usid }, JWT_SECRET);
        res.json({
          message: "Connected successfully",
          usid: row.hashed_usid,
          name: row.name,
          email: row.email,
          token: jwtToken,
        });
      }
    );
  } else {
    idDb.get(
      "SELECT id, name, email, hashed_usid FROM users_metadata WHERE email = ?",
      [email.trim()],
      (err, row) => {
        if (err) return res.status(500).json({ error: "Identity DB lookup failed" });
        if (!row) return res.status(404).json({ error: "Identity not found. Please sign up first." });

        const jwtToken = jwt.sign({ userId: row.id, hashedUsid: row.hashed_usid }, JWT_SECRET);
        res.json({
          message: "Connected successfully",
          usid: row.hashed_usid,
          name: row.name,
          email: row.email,
          token: jwtToken,
        });
      }
    );
  }
});

function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "No token" });
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: "Invalid token" });
    req.user = decoded;
    next();
  });
}

app.post("/add-contact", authenticate, (req, res) => {
  const { usid } = req.body;

  if (!usid || usid.trim() === "") {
    return res.status(400).json({ error: "USID is required" });
  }

  const cleanUsid = usid.trim().toLowerCase().replace(/^0x/, "");
  const hashedCandidates = [...new Set([cleanUsid, hashUSID(cleanUsid)])];
  const userHashedUsid = req.user.hashedUsid;

  if (hashedCandidates.includes(userHashedUsid)) {
    return res
      .status(400)
      .json({ error: "You cannot add yourself as a contact" });
  }

  idDb.get(
    "SELECT name, hashed_usid FROM users_metadata WHERE hashed_usid IN (?, ?)",
    hashedCandidates,
    (err, row) => {
      if (err || !row) {
        return res
          .status(404)
          .json({ error: "USID not found in identity registry" });
      }

      const hashed = row.hashed_usid;

      db.get(
        "SELECT id FROM contacts WHERE user_id = ? AND contact_hashed_usid = ?",
        [req.user.userId, hashed],
        (err, existing) => {
          if (err) {
            return res.status(500).json({ error: "Database error" });
          }

          const addContactFresh = () => {
            db.run(
              "INSERT INTO contacts (user_id, contact_hashed_usid) VALUES (?, ?)",
              [req.user.userId, hashed],
              function (err) {
                if (err)
                  return res.status(500).json({ error: "Failed to add contact" });
                res.json({ message: "Contact added", name: row.name, usid: hashed });
              }
            );
          };

          if (existing) {
            db.run(
              "DELETE FROM contacts WHERE user_id = ? AND contact_hashed_usid = ?",
              [req.user.userId, hashed],
              addContactFresh
            );
          } else {
            addContactFresh();
          }
        }
      );
    }
  );
});

// WebSocket setup
const wss = new WebSocket.Server({ server });
const clients = new Map();

wss.on("connection", (ws, req) => {
  console.log("[WS] New connection");

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === "register" && msg.usid) {
        clients.set(msg.usid, ws);
        ws.usid = msg.usid;
        console.log(`[WS] Registered: ${msg.usid}`);
      } else if (msg.type === "message" && msg.to && msg.payload) {
        const target = clients.get(msg.to);
        if (target && target.readyState === WebSocket.OPEN) {
          target.send(JSON.stringify({ type: "message", from: ws.usid, payload: msg.payload }));
        }
      } else if (msg.type === "broadcast") {
        clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "broadcast", from: ws.usid, payload: msg.payload }));
          }
        });
      }
    } catch (e) {
      console.error("[WS] Parse error:", e.message);
    }
  });

  ws.on("close", () => {
    if (ws.usid) {
      clients.delete(ws.usid);
      console.log(`[WS] Disconnected: ${ws.usid}`);
    }
  });
});

// Fallback: serve index.html for any non-API route (SPA support)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[Halonyx] Server running on http://localhost:${PORT}`);
  console.log(`[Halonyx] Frontend served from ./frontend/`);
});
