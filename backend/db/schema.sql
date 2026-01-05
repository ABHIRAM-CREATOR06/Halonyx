CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hashed_usid TEXT UNIQUE,
    public_key_bundle TEXT, -- JSON string containing Signal protocol keys (identityKey, preKeys, signedPreKey)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    contact_hashed_usid TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);