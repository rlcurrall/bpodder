PRAGMA user_version = 1;
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id               INTEGER PRIMARY KEY,
  name             TEXT NOT NULL,
  password         TEXT NOT NULL,
  token            TEXT NULL,
  external_user_id INTEGER NULL
);
CREATE UNIQUE INDEX users_unique ON users (name, external_user_id);

CREATE TABLE devices (
  id       INTEGER PRIMARY KEY,
  user     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  deviceid TEXT NOT NULL,
  caption  TEXT NULL,
  type     TEXT NULL,
  data     TEXT NULL
);
CREATE UNIQUE INDEX devices_unique ON devices (deviceid, user);

CREATE TABLE feeds (
  id          INTEGER PRIMARY KEY,
  feed_url    TEXT NOT NULL UNIQUE,
  image_url   TEXT NULL,
  url         TEXT NULL,
  language    TEXT NULL,
  title       TEXT NULL,
  description TEXT NULL,
  pubdate        TEXT NULL,
  last_fetch     INTEGER NOT NULL,
  fetch_failures INTEGER NOT NULL DEFAULT 0,
  next_fetch_after INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE subscriptions (
  id      INTEGER PRIMARY KEY,
  user    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  feed    INTEGER NULL REFERENCES feeds (id) ON DELETE SET NULL,
  url     TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  changed INTEGER NOT NULL,
  data    TEXT NULL
);
CREATE UNIQUE INDEX subscriptions_unique ON subscriptions (url, user);
CREATE INDEX subscription_feed ON subscriptions (feed);

CREATE TABLE episodes (
  id          INTEGER PRIMARY KEY,
  feed        INTEGER NOT NULL REFERENCES feeds (id) ON DELETE CASCADE,
  media_url   TEXT NOT NULL,
  url         TEXT NULL,
  image_url   TEXT NULL,
  duration    INTEGER NULL,
  title       TEXT NULL,
  description TEXT NULL,
  pubdate     TEXT NULL
);
CREATE UNIQUE INDEX episodes_unique ON episodes (feed, media_url);

CREATE TABLE episodes_actions (
  id           INTEGER PRIMARY KEY,
  user         INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  subscription INTEGER NOT NULL REFERENCES subscriptions (id) ON DELETE CASCADE,
  episode      INTEGER NULL REFERENCES episodes (id) ON DELETE SET NULL,
  device       INTEGER NULL REFERENCES devices (id) ON DELETE SET NULL,
  url          TEXT NOT NULL,
  changed      INTEGER NOT NULL,
  uploaded_at  INTEGER NOT NULL,
  action       TEXT NOT NULL,
  position     INTEGER NULL,
  started      INTEGER NULL,
  total        INTEGER NULL,
  data         TEXT NULL
);
CREATE INDEX ea_user_uploaded_at ON episodes_actions (user, uploaded_at);
CREATE INDEX ea_episode ON episodes_actions (episode);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

CREATE TABLE poll_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NULL REFERENCES users (id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts   INTEGER DEFAULT 0
);
CREATE INDEX idx_poll_expires ON poll_tokens (expires_at);
