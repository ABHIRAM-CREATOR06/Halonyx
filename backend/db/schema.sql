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
