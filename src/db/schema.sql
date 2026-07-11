-- Rollcall schema. SQLite in WAL mode. Timestamps are ISO-8601 UTC strings
-- (datetime('now') yields "YYYY-MM-DD HH:MM:SS" in UTC), compared lexically.

CREATE TABLE IF NOT EXISTS crews (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS riders (
  id            TEXT PRIMARY KEY,
  phone         TEXT UNIQUE NOT NULL,          -- E.164, e.g. +14045551234
  display_name  TEXT NOT NULL,
  crew_id       TEXT REFERENCES crews(id),
  muted         INTEGER NOT NULL DEFAULT 0,    -- rider opted out of fan-out, still a member
  opted_out     INTEGER NOT NULL DEFAULT 0,    -- carrier-level STOP; never message
  welcomed_at   TEXT,                          -- first welcome reply sent (null = never)
  footer_shown_at TEXT,                        -- last time the compliance footer was appended
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ride_sessions (
  id            TEXT PRIMARY KEY,
  rider_id      TEXT NOT NULL REFERENCES riders(id),
  started_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  ended_at      TEXT,                          -- null while live
  location_text TEXT,                          -- free text as typed
  lat           REAL,                          -- v1.1, unused in MVP
  lng           REAL                           -- v1.1, unused in MVP
);

-- Fast lookup of a rider's live session and of all live sessions in a crew.
CREATE INDEX IF NOT EXISTS idx_sessions_rider   ON ride_sessions(rider_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON ride_sessions(expires_at);

CREATE TABLE IF NOT EXISTS message_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  direction  TEXT NOT NULL,                    -- 'in' | 'out'
  phone      TEXT NOT NULL,
  body       TEXT NOT NULL,
  twilio_sid TEXT UNIQUE,                      -- inbound MessageSid; used for idempotency
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
