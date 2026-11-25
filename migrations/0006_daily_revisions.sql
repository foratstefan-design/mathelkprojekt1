ALTER TABLE runs ADD COLUMN daily_revision INTEGER NOT NULL DEFAULT 0;
DROP INDEX one_daily_flight;
CREATE UNIQUE INDEX one_daily_flight ON runs(device,day,daily_revision) WHERE flight_kind='daily';
CREATE TABLE daily_challenge_revisions (
  day TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision>0),
  mode TEXT NOT NULL,
  questions_json TEXT NOT NULL CHECK(json_valid(questions_json)),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(day,revision)
);
