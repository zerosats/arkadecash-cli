-- Initial schema for private-payments daemon

CREATE TABLE IF NOT EXISTS mints (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('cashu', 'fedimint')),
  name TEXT NOT NULL,
  url TEXT UNIQUE,
  invite_code TEXT UNIQUE,
  federation_id TEXT,
  trust_score INTEGER DEFAULT 50,
  successful_ops INTEGER DEFAULT 0,
  failed_ops INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS proofs (
  id TEXT PRIMARY KEY,
  mint_id TEXT NOT NULL REFERENCES mints(id) ON DELETE CASCADE,
  secret TEXT UNIQUE NOT NULL,
  amount INTEGER NOT NULL,
  c TEXT NOT NULL,
  keyset_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  lock_id TEXT,
  spent_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_proofs_mint_id ON proofs(mint_id);
CREATE INDEX IF NOT EXISTS idx_proofs_lock_id ON proofs(lock_id);
CREATE INDEX IF NOT EXISTS idx_proofs_spent_at ON proofs(spent_at);

CREATE TABLE IF NOT EXISTS pending_quotes (
  quote_id TEXT PRIMARY KEY,
  mint_id TEXT NOT NULL REFERENCES mints(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('mint', 'melt')),
  amount_sats INTEGER NOT NULL,
  invoice TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'completed', 'expired')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_quotes_mint_id ON pending_quotes(mint_id);
CREATE INDEX IF NOT EXISTS idx_pending_quotes_status ON pending_quotes(status);

CREATE TABLE IF NOT EXISTS federations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  trust_score INTEGER DEFAULT 50,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS seed_store (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  encrypted_seed BLOB NOT NULL,
  salt BLOB NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daemon_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  state TEXT NOT NULL DEFAULT 'UNINITIALIZED' CHECK (state IN ('UNINITIALIZED', 'LOCKED', 'UNLOCKED')),
  updated_at INTEGER NOT NULL
);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (1, strftime('%s', 'now') * 1000);
