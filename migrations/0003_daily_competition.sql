ALTER TABLE runs ADD COLUMN competition_version INTEGER NOT NULL DEFAULT 2;
ALTER TABLE runs ADD COLUMN answer_elapsed_ms INTEGER NOT NULL DEFAULT 0;
CREATE TABLE pilots (
  device TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX daily_leaderboard_order ON runs(day, altitude DESC, score DESC, answer_elapsed_ms, started_at, id) WHERE flight_kind = 'daily' AND competition_version = 3 AND status = 'finished';
CREATE TABLE daily_challenges (
  day TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  questions_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
