CREATE TABLE newsletters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_address TEXT,
  subject TEXT,
  received_at INTEGER NOT NULL,
  html_body TEXT,
  text_body TEXT,
  processed_at INTEGER
);

CREATE TABLE articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  newsletter_id INTEGER REFERENCES newsletters(id),
  url TEXT NOT NULL UNIQUE,
  title TEXT,
  fetched_text TEXT,
  summary TEXT,
  score INTEGER,
  must_read INTEGER NOT NULL DEFAULT 0,
  rationale TEXT,
  created_at INTEGER NOT NULL,
  sent_at INTEGER
);

CREATE INDEX idx_articles_unsent ON articles(sent_at) WHERE sent_at IS NULL;

CREATE TABLE interests_override (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  profile_text TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT NOT NULL UNIQUE,
  url TEXT NOT NULL,
  title TEXT,
  channel TEXT,
  duration_seconds INTEGER,
  transcript TEXT,
  short_summary TEXT,
  learn_notes TEXT,
  requested_at INTEGER NOT NULL
);
