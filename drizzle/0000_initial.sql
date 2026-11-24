CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  device TEXT NOT NULL,
  mode TEXT NOT NULL,
  seed TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  question_index INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  altitude INTEGER NOT NULL DEFAULT 0,
  deadline INTEGER,
  crash_reason TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS runs_by_device ON runs(device, started_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS answers (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  choice_id TEXT,
  expired INTEGER NOT NULL DEFAULT 0,
  result TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, position)
);
