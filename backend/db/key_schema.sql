-- Key Database Schema
-- Stores public key bundles for Signal Protocol key exchange

CREATE TABLE IF NOT EXISTS key_bundles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hashed_usid TEXT NOT NULL UNIQUE,
    identity_key TEXT,
    signed_prekey TEXT,
    signed_prekey_signature TEXT,
    one_time_prekeys TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
