ALTER TABLE runs ADD COLUMN flight_kind TEXT NOT NULL DEFAULT 'free';
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN day TEXT;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN start_altitude INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN peak_altitude INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN danger INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN correct_total INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN question_json TEXT;
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1;
--> statement-breakpoint
CREATE UNIQUE INDEX one_daily_flight ON runs(device, day) WHERE flight_kind = 'daily';
