const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const jwt = require("jsonwebtoken");
const fs = require("fs");
const { hashUSID, generateUSID } = require("./utils");
const WebSocket = require("ws");
const dgram = require("dgram");
const http = require("http");
const rateLimit = require("express-rate-limit");

const app = express();
const server = http.createServer(app);
app.use(express.json());
app.set('trust proxy', 1);

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
                res.json({ message: "Account created", usid, token: jwtToken });
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

  let query = "";
  let params = [];

  if (usid && usid.trim()) {
    const cleanUsid = usid.trim();
    const hashed = cleanUsid.length === 64 ? cleanUsid : hashUSID(cleanUsid);
    query = "SELECT id, name, email, hashed_usid FROM users_metadata WHERE hashed_usid = ?";
    params = [hashed];
  } else {
    query = "SELECT id, name, email, hashed_usid FROM users_metadata WHERE email = ?";
    params = [email.trim()];
  }

  idDb.get(query, params, (err, row) => {
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
  });
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

  const hashed = hashUSID(usid);
  const userHashedUsid = req.user.hashedUsid;

  // Check if trying to add themselves
  if (hashed === userHashedUsid) {
    return res
      .status(400)
      .json({ error: "You cannot add yourself as a contact" });
  }

  // Verify contact exists in Identity DB
  idDb.get(
    "SELECT name FROM users_metadata WHERE hashed_usid = ?",
    [hashed],
    (err, row) => {
      if (err || !row) {
        return res
          .status(404)
          .json({ error: "USID not found in identity registry" });
      }

      // Check if contact already exists
      db.get(
        "SELECT id FROM contacts WHERE user_id = ? AND contact_hashed_usid = ?",
        [req.user.userId, hashed],
        (err, existing) => {
          if (err) {
            return res.status(500).json({ error: "Database error" });
          }

          // If duplicate exists, remove it first, then add fresh entry
          const addContactFresh = () => {
            db.run(
              "INSERT INTO contacts (user_id, contact_hashed_usid) VALUES (?, ?)",
              [req.user.userId, hashed],
              function (err) {
                if (err) {
                  console.error("[Add Contact] Insert error:", err);
                  return res.status(400).json({
                    error: "Failed to add contact. Please try again.",
                  });
                }
                const message = existing
                  ? `Contact ${row.name} refreshed`
                  : `Contact ${row.name} added successfully`;
                res.json({
                  message,
                  name: row.name,
                  refreshed: !!existing,
                });
              },
            );
          };

          if (existing) {
            // Remove the duplicate first
            console.log(
              `[Add Contact] Duplicate detected for user ${req.user.userId}, contact ${hashed.substring(0, 8)}... Removing old entry.`,
            );
            db.run(
              "DELETE FROM contacts WHERE user_id = ? AND contact_hashed_usid = ?",
              [req.user.userId, hashed],
              (err) => {
                if (err) {
                  console.error("[Add Contact] Error removing duplicate:", err);
                  return res.status(500).json({
                    error: "Failed to process duplicate contact",
                  });
                }
                // Now add the fresh entry
                addContactFresh();
              },
            );
          } else {
            // No duplicate, just add normally
            addContactFresh();
          }
        },
      );
    },
  );
});

app.get("/contacts", authenticate, (req, res) => {
  db.all(
    "SELECT contact_hashed_usid FROM contacts WHERE user_id = ?",
    [req.user.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(rows.map((r) => r.contact_hashed_usid));
    },
  );
});

// Delete contact route — the frontend sends the already-hashed USID (from GET /contacts),
// so we use it directly without hashing again to avoid a double-hash mismatch.
app.delete("/contacts", authenticate, (req, res) => {
  const { usid } = req.body;
  if (!usid) return res.status(400).json({ error: "USID is required" });

  // usid here is already a hashed_usid — do NOT call hashUSID() again
  const hashedUsid = usid;

  db.run(
    "DELETE FROM contacts WHERE user_id = ? AND contact_hashed_usid = ?",
    [req.user.userId, hashedUsid],
    function (err) {
      if (err) return res.status(500).json({ error: "DB error" });
      if (this.changes === 0)
        return res.status(404).json({ error: "Contact not found" });
      console.log(
        `[Contacts] Removed contact ${hashedUsid.substring(0, 8)}... for user ${req.user.userId}`,
      );
      res.json({ message: "Contact removed" });
    },
  );
});

/*
  POST /cleanup-duplicates
  Removes duplicate contacts for all users, keeping only the most recent one.
  This is useful if duplicates somehow exist from earlier versions.
*/
app.post("/cleanup-duplicates", authenticate, (req, res) => {
  // Get all contacts for this user
  db.all(
    "SELECT id, contact_hashed_usid FROM contacts WHERE user_id = ? ORDER BY id ASC",
    [req.user.userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: "Database error" });
      }

      if (!rows || rows.length === 0) {
        return res.json({
          message: "No contacts to clean up",
          duplicatesRemoved: 0,
          contactsKept: 0,
        });
      }

      // Group by contact_hashed_usid to find duplicates
      const contactMap = {};
      const toDelete = [];

      rows.forEach((row) => {
        if (!contactMap[row.contact_hashed_usid]) {
          // First occurrence - keep this one
          contactMap[row.contact_hashed_usid] = row.id;
        } else {
          // Duplicate - mark for deletion
          toDelete.push(row.id);
        }
      });

      if (toDelete.length === 0) {
        return res.json({
          message: "No duplicates found",
          duplicatesRemoved: 0,
          contactsKept: Object.keys(contactMap).length,
        });
      }

      // Delete all duplicate entries
      const placeholders = toDelete.map(() => "?").join(",");
      db.run(
        `DELETE FROM contacts WHERE user_id = ? AND id IN (${placeholders})`,
        [req.user.userId, ...toDelete],
        function (err) {
          if (err) {
            console.error("[Cleanup Duplicates] Delete error:", err);
            return res.status(500).json({
              error: "Failed to clean up duplicates",
            });
          }

          console.log(
            `[Cleanup] Removed ${toDelete.length} duplicates for user ${req.user.userId}`,
          );
          res.json({
            message: `Cleaned up ${toDelete.length} duplicate contact(s)`,
            duplicatesRemoved: toDelete.length,
            contactsKept: Object.keys(contactMap).length,
          });
        },
      );
    },
  );
});

/*
  POST /cleanup-all-duplicates
  Admin endpoint to clean up duplicates for ALL users in the system.
  Requires authentication.
*/
app.post("/cleanup-all-duplicates", authenticate, (req, res) => {
  // Get all contacts grouped by user
  db.all(
    "SELECT user_id, id, contact_hashed_usid FROM contacts ORDER BY user_id ASC, id ASC",
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: "Database error" });
      }

      if (!rows || rows.length === 0) {
        return res.json({
          message: "No contacts to clean up",
          totalDuplicatesRemoved: 0,
          usersAffected: 0,
        });
      }

      // Group by user and then by contact
      const userContactMap = {};
      const toDelete = [];

      rows.forEach((row) => {
        if (!userContactMap[row.user_id]) {
          userContactMap[row.user_id] = {};
        }

        const contactKey = row.contact_hashed_usid;
        if (!userContactMap[row.user_id][contactKey]) {
          userContactMap[row.user_id][contactKey] = row.id;
        } else {
          toDelete.push(row.id);
        }
      });

      if (toDelete.length === 0) {
        return res.json({
          message: "No duplicates found",
          totalDuplicatesRemoved: 0,
          usersAffected: 0,
        });
      }

      // Delete all duplicate entries
      const placeholders = toDelete.map(() => "?").join(",");
      db.run(
        `DELETE FROM contacts WHERE id IN (${placeholders})`,
        toDelete,
        function (err) {
          if (err) {
            console.error("[Cleanup All Duplicates] Delete error:", err);
            return res.status(500).json({
              error: "Failed to clean up duplicates",
            });
          }

          const usersAffected = Object.keys(userContactMap).length;
          console.log(
            `[Cleanup All] Removed ${toDelete.length} duplicates across ${usersAffected} users`,
          );
          res.json({
            message: `Cleaned up ${toDelete.length} duplicate contact(s) across ${usersAffected} user(s)`,
            totalDuplicatesRemoved: toDelete.length,
            usersAffected,
          });
        },
      );
    },
  );
});

// ── Key Bundle Endpoints (for X3DH) ─────────────────────────────────────────

// POST /keys/upload — store caller's public key bundle
app.post("/keys/upload", authenticate, uploadLimiter, (req, res) => {
  const { bundle } = req.body;
  if (!bundle) return res.status(400).json({ error: "Missing bundle" });

  // hashedUsid comes from the verified JWT
  const hashed = req.user.hashedUsid;
  const now = Date.now();

  keyDb.run(
    "INSERT INTO key_bundles (hashed_usid, bundle, updated_at) VALUES (?, ?, ?)" +
    " ON CONFLICT(hashed_usid) DO UPDATE SET bundle=excluded.bundle, updated_at=excluded.updated_at",
    [hashed, JSON.stringify(bundle), now],
    (err) => {
      if (err)
        return res.status(500).json({ error: "Failed to store key bundle" });
      res.json({ message: "Key bundle stored" });
    },
  );
});

// POST /keys/replenish — append one-time pre-keys to the user's bundle
app.post("/keys/replenish", authenticate, uploadLimiter, (req, res) => {
  const { preKeys } = req.body;
  if (!preKeys || !Array.isArray(preKeys)) return res.status(400).json({ error: "Missing preKeys array" });

  const hashed = req.user.hashedUsid;

  keyDb.get("SELECT bundle FROM key_bundles WHERE hashed_usid = ?", [hashed], (err, row) => {
    if (err || !row) return res.status(404).json({ error: "Key bundle not found" });
    try {
      const bundle = JSON.parse(row.bundle);
      bundle.preKeys = (bundle.preKeys || []).concat(preKeys);
      const now = Date.now();

      keyDb.run("UPDATE key_bundles SET bundle = ?, updated_at = ? WHERE hashed_usid = ?",
        [JSON.stringify(bundle), now, hashed],
        (updateErr) => {
          if (updateErr) return res.status(500).json({ error: "Failed to update key bundle" });
          res.json({ message: "Pre-keys replenished", count: bundle.preKeys.length });
        }
      );
    } catch (e) {
      res.status(500).json({ error: "Failed to parse key bundle" });
    }
  });
});

// GET /keys/:hashedUsid — fetch a peer's public key bundle
app.get("/keys/:hashedUsid", (req, res) => {
  const { hashedUsid } = req.params;
  keyDb.get(
    "SELECT bundle FROM key_bundles WHERE hashed_usid = ?",
    [hashedUsid],
    (err, row) => {
      if (err || !row)
        return res.status(404).json({ error: "Key bundle not found" });
      res.json({ bundle: JSON.parse(row.bundle) });
    },
  );
});

// ── Safety Number / Identity Verification Endpoints ─────────────────────────

// GET /public-key/:hashedUsid — return only the identity public key (hex) for
// safety-number computation. Authenticated so random crawlers can't harvest keys.
app.get("/public-key/:hashedUsid", authenticate, (req, res) => {
  const { hashedUsid } = req.params;

  // First try the key_bundles table (users who have uploaded a full bundle)
  keyDb.get(
    "SELECT bundle FROM key_bundles WHERE hashed_usid = ?",
    [hashedUsid],
    (err, row) => {
      if (!err && row) {
        try {
          const bundle = JSON.parse(row.bundle);
          // bundle.identityKey is the hex public key stored during signup/upload
          if (
            bundle.identityKey &&
            bundle.identityKey !== "placeholder-public-key"
          ) {
            return res.json({
              publicKey: bundle.identityKey,
              source: "bundle",
            });
          }
        } catch (_) {
          /* fall through */
        }
      }

      // Fall back to the users table (public_key_bundle column in app.db)
      db.get(
        "SELECT public_key_bundle FROM users WHERE hashed_usid = ?",
        [hashedUsid],
        (err2, row2) => {
          if (err2 || !row2)
            return res.status(404).json({ error: "Public key not found" });
          try {
            const pkb = JSON.parse(row2.public_key_bundle);
            if (
              !pkb.identityKey ||
              pkb.identityKey === "placeholder-public-key"
            ) {
              return res
                .status(404)
                .json({ error: "No real public key registered yet" });
            }
            res.json({ publicKey: pkb.identityKey, source: "users" });
          } catch (_) {
            res.status(500).json({ error: "Failed to parse key bundle" });
          }
        },
      );
    },
  );
});

// POST /update-pubkey — lets existing users push their P-256 identity public key
// without re-registering. Called automatically on reconnect by app.js.
app.post("/update-pubkey", authenticate, (req, res) => {
  const { publicKey } = req.body;
  if (!publicKey || typeof publicKey !== "string" || publicKey.length < 10) {
    return res.status(400).json({ error: "Invalid publicKey" });
  }

  const hashed = req.user.hashedUsid;
  const publicKeyBundle = JSON.stringify({ identityKey: publicKey });

  // Update app.db users table
  db.run(
    "UPDATE users SET public_key_bundle = ? WHERE hashed_usid = ?",
    [publicKeyBundle, hashed],
    function (err) {
      if (err) return res.status(500).json({ error: "DB update failed" });
      if (this.changes === 0) {
        // User row might not exist yet (edge case) — insert it
        db.run(
          "INSERT OR IGNORE INTO users (hashed_usid, public_key_bundle) VALUES (?, ?)",
          [hashed, publicKeyBundle],
          (err2) => {
            if (err2)
              return res.status(500).json({ error: "DB insert failed" });
            console.log(
              `[PubKey] Inserted public key for ${hashed.substring(0, 8)}...`,
            );
            res.json({ message: "Public key stored" });
          },
        );
      } else {
        console.log(
          `[PubKey] Updated public key for ${hashed.substring(0, 8)}...`,
        );
        res.json({ message: "Public key updated" });
      }
    },
  );
});

// --- UDP Anti-Spam Rate Limiter ---
class RateBucket {
  constructor({ windowMs = 60000, maxHits = 5, banAfter = 5, banDurationMs = 300000 } = {}) {
    this.windowMs = windowMs;
    this.maxHits = maxHits;
    this.banAfter = banAfter;          // ban after this many violations
    this.banDurationMs = banDurationMs; // ban duration (default 5 min)
    this.hits = new Map();              // key -> [timestamps]
    this.violations = new Map();        // key -> violation count
    this.bans = new Map();              // key -> ban expiry timestamp
  }

  /** Returns true if the request is allowed, false if rate-limited or banned. */
  allow(key) {
    const now = Date.now();

    // Check ban
    const banExpiry = this.bans.get(key);
    if (banExpiry && now < banExpiry) return false;
    if (banExpiry && now >= banExpiry) {
      this.bans.delete(key);
      this.violations.delete(key);
    }

    // Sliding window
    let timestamps = this.hits.get(key) || [];
    timestamps = timestamps.filter(t => now - t < this.windowMs);

    if (timestamps.length >= this.maxHits) {
      // Record violation
      const v = (this.violations.get(key) || 0) + 1;
      this.violations.set(key, v);
      if (v >= this.banAfter) {
        this.bans.set(key, now + this.banDurationMs);
        console.warn(`[RateBucket] BANNED key="${key}" for ${this.banDurationMs / 1000}s (${v} violations)`);
      }
      this.hits.set(key, timestamps);
      return false;
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return true;
  }

  isBanned(key) {
    const banExpiry = this.bans.get(key);
    if (!banExpiry) return false;
    if (Date.now() >= banExpiry) {
      this.bans.delete(key);
      this.violations.delete(key);
      return false;
    }
    return true;
  }
}

// --- UDP Constants (used by both WS bridge and UDP listener) ---
const UDP_PORT = 9000;
// Max UDP payload size in bytes
const UDP_MAX_PAYLOAD = 512;
// Max content string length inside the JSON payload
const UDP_MAX_CONTENT_LEN = 200;

// WebSocket for messaging
const wss = new WebSocket.Server({ server });
const clients = new Map(); // hashed_usid -> WebSocket

// WS emergency rate limit: 1 emergency broadcast per 60s per user, ban after 3 violations
const wsEmergencyLimiter = new RateBucket({ windowMs: 60000, maxHits: 1, banAfter: 3, banDurationMs: 300000 });


wss.on("connection", (ws) => {
  let userHashedUsid = null;
  console.log("[WS] New raw connection established");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === "register") {
        const { usid } = data;
        const hashed = hashUSID(usid);

        // VERIFY CONNECTION AGAINST IDENTITY DB
        idDb.get(
          "SELECT name FROM users_metadata WHERE hashed_usid = ?",
          [hashed],
          (err, row) => {
            if (err || !row) {
              console.log(
                `[WS] Registration REJECTED: ${hashed.substring(0, 8)}... (Not in Identity DB)`,
              );
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "Identity not verified",
                }),
              );
              return;
            }

            userHashedUsid = hashed;
            clients.set(userHashedUsid, ws);
            console.log(
              `[WS] User Registered: ${row.name} (${userHashedUsid.substring(0, 8)}...)`,
            );
            ws.send(JSON.stringify({ type: "registered", success: true }));

            // ── Offline Mailbox Flush ──────────────────────────────────
            // Deliver any messages that arrived while this user was offline,
            // then purge them so they are not delivered twice.
            db.all(
              "SELECT * FROM mailbox WHERE recipient_hashed_usid = ? ORDER BY timestamp ASC",
              [hashed],
              (mbErr, pending) => {
                if (mbErr || !pending || pending.length === 0) return;
                console.log(
                  `[Mailbox] Flushing ${pending.length} queued message(s) to ${hashed.substring(0, 8)}...`,
                );
                pending.forEach((m) => {
                  let encData = m.content;
                  try { encData = JSON.parse(m.content); } catch (e) { }
                  ws.send(
                    JSON.stringify({
                      type: "message",
                      from: m.sender_hashed_usid,
                      encrypted: encData,
                      timestamp: m.timestamp,
                    }),
                  );
                });
                db.run(
                  "DELETE FROM mailbox WHERE recipient_hashed_usid = ?",
                  [hashed],
                  (delErr) => {
                    if (delErr)
                      console.error(
                        "[Mailbox] Failed to purge mailbox:",
                        delErr,
                      );
                    else
                      console.log(
                        `[Mailbox] Purged ${pending.length} message(s) for ${hashed.substring(0, 8)}...`,
                      );
                  },
                );
              },
            );
            // ──────────────────────────────────────────────────────────
          },
        );
        return;
      }

      if (data.type === "message") {
        const { to, content, encrypted } = data;
        if (!userHashedUsid) return;

        console.log(
          `[WS] Message: ${userHashedUsid.substring(0, 8)} → ${to ? to.substring(0, 8) : "?"}`,
        );

        const recipientWs = clients.get(to);
        if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
          recipientWs.send(
            JSON.stringify({
              type: "message",
              from: userHashedUsid,
              content: content || null,
              encrypted: encrypted || null,
              timestamp: new Date().toISOString(),
            }),
          );
          console.log(`[WS] Message delivered to ${to.substring(0, 8)}`);
        } else {
          // Offline mailbox — enforce encrypted only
          if (!encrypted) {
            ws.send(JSON.stringify({ type: "error", message: "Only encrypted messages are queued" }));
            return;
          }
          const storeContent = typeof encrypted === 'string' ? encrypted : JSON.stringify(encrypted);
          db.run(
            "INSERT INTO mailbox (recipient_hashed_usid, sender_hashed_usid, content) VALUES (?, ?, ?)",
            [to, userHashedUsid, storeContent],
            (mbErr) => {
              if (mbErr) {
                ws.send(
                  JSON.stringify({
                    type: "error",
                    message: "Mailbox store failed",
                  }),
                );
              } else {
                ws.send(
                  JSON.stringify({
                    type: "queued",
                    message: "Recipient offline — message queued",
                  }),
                );
              }
            },
          );
        }
      }

      // X3DH handshake relay — forward to recipient so they can set up E2EE
      if (data.type === "x3dh_init") {
        const { to } = data;
        if (!userHashedUsid || !to) return;
        const recipientWs = clients.get(to);
        if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
          recipientWs.send(JSON.stringify({ ...data, from: userHashedUsid }));
          console.log(
            `[WS] X3DH init relayed: ${userHashedUsid.substring(0, 8)} → ${to.substring(0, 8)}`,
          );
        }
      }

      if (data.type === "emergency_broadcast") {
        if (!userHashedUsid) {
          ws.send(JSON.stringify({ type: "error", message: "Not registered — cannot send emergency" }));
          return;
        }

        // --- WS→UDP rate limit: 1 emergency per 60s per user ---
        if (!wsEmergencyLimiter.allow(userHashedUsid)) {
          console.warn(`[WS->UDP] RATE-LIMITED emergency from ${userHashedUsid.substring(0, 8)}`);
          ws.send(JSON.stringify({ type: "error", message: "Emergency cooldown active — please wait before sending another" }));
          return;
        }

        // Sanitize content
        const emergencyContent = data.content && typeof data.content === "string"
          ? data.content.substring(0, UDP_MAX_CONTENT_LEN)
          : "EMERGENCY: Immediate assistance required!";

        console.log(
          `[WS->UDP] Emergency from ${userHashedUsid.substring(0, 8)}`,
        );
        const udpMessage = Buffer.from(
          JSON.stringify({
            content: emergencyContent,
            from: userHashedUsid,
            token: "INTERNAL_UDP_SECRET"
          }),
        );
        udpServer.send(udpMessage, UDP_PORT, "localhost", (err) => {
          if (err) console.error("[UDP] Bridge Error:", err);
        });
      }
    } catch (e) {
      console.error("[WS] Message Error:", e);
    }
  });

  ws.on("close", () => {
    if (userHashedUsid) {
      clients.delete(userHashedUsid);
      console.log(
        `[WS] User Disconnected: ${userHashedUsid.substring(0, 8)}...`,
      );
    }
  });
});

// --- UDP Group Messaging Bridge ---
const udpServer = dgram.createSocket("udp4");

// UDP limits: 1 message per 30s per source IP, auto-ban after 5 violations (5 min ban)
const udpPerIpLimiter = new RateBucket({ windowMs: 30000, maxHits: 1, banAfter: 5, banDurationMs: 300000 });
// Global UDP limit: max 5 messages per minute across ALL sources
const udpGlobalLimiter = new RateBucket({ windowMs: 60000, maxHits: 5, banAfter: 999, banDurationMs: 0 });

udpServer.on("message", (msg, rinfo) => {
  const srcKey = `${rinfo.address}:${rinfo.port}`;

  // --- Guard 1: Payload size ---
  if (msg.length > UDP_MAX_PAYLOAD) {
    console.warn(`[UDP] REJECTED oversized packet (${msg.length}B) from ${srcKey}`);
    return;
  }

  // --- Guard 2: Per-IP rate limit ---
  if (!udpPerIpLimiter.allow(rinfo.address)) {
    console.warn(`[UDP] RATE-LIMITED ${srcKey} (per-IP)`);
    return;
  }

  // --- Guard 3: Global rate limit ---
  if (!udpGlobalLimiter.allow("__global__")) {
    console.warn(`[UDP] RATE-LIMITED (global cap reached)`);
    return;
  }

  try {
    const data = JSON.parse(msg.toString());

    // --- Guard 4: Token validation ---
    if (data.token !== "INTERNAL_UDP_SECRET") {
      console.warn(`[UDP] Unauthorized broadcast attempt from ${srcKey}`);
      return;
    }

    // --- Guard 5: Content validation ---
    if (!data.content || typeof data.content !== "string" || data.content.trim().length === 0) {
      console.warn(`[UDP] REJECTED empty/invalid content from ${srcKey}`);
      return;
    }
    if (data.content.length > UDP_MAX_CONTENT_LEN) {
      console.warn(`[UDP] REJECTED oversized content (${data.content.length} chars) from ${srcKey}`);
      return;
    }

    const broadcastData = JSON.stringify({
      type: "emergency_broadcast",
      content: data.content.substring(0, UDP_MAX_CONTENT_LEN),
      from: data.from ? String(data.from).substring(0, 64) : "unknown",
      timestamp: new Date().toISOString(),
    });

    let delivered = 0;
    clients.forEach((clientWs) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(broadcastData);
        delivered++;
      }
    });
    console.log(`[UDP] Broadcast delivered to ${delivered} client(s) from ${srcKey}`);
  } catch (e) {
    console.error(`[UDP] Malformed packet from ${srcKey}:`, e.message);
  }
});

udpServer.on("listening", () => {
  const address = udpServer.address();
  console.log(`[UDP] Server listening ${address.address}:${address.port}`);
});

udpServer.bind(UDP_PORT, "127.0.0.1");

// Serve protocol/ files at /protocol/* (before cache middleware so headers apply)
app.use(
  "/protocol",
  express.static("protocol", { etag: false, lastModified: false }),
);

// Disable all caching — must come BEFORE static middleware so Edge (and other browsers)
// never serve a stale app.js from cache, which would cause identity hash mismatches.
app.use((req, res, next) => {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});

app.use(express.static("frontend", { etag: false, lastModified: false }));
const PORT = 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
