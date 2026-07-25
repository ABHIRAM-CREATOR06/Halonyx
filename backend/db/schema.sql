CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hashed_usid TEXT NOT NULL UNIQUE,
    public_key_bundle TEXT
);

CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    contact_hashed_usid TEXT NOT NULL,
    UNIQUE(user_id, contact_hashed_usid),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Offline mailbox: stores messages for users who are not currently connected.
-- Messages are flushed and deleted when the recipient comes online.
CREATE TABLE IF NOT EXISTS mailbox (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_hashed_usid TEXT NOT NULL,
    sender_hashed_usid    TEXT NOT NULL,
    content               TEXT NOT NULL,
    timestamp             DATETIME DEFAULT CURRENT_TIMESTAMP
);
