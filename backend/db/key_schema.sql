CREATE TABLE IF NOT EXISTS key_bundles (
  hashed_usid TEXT PRIMARY KEY,
  bundle      TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
