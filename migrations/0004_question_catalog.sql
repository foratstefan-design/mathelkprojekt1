CREATE TABLE question_fact_families (
  fact_key TEXT PRIMARY KEY,
  family_id TEXT NOT NULL
);
CREATE INDEX question_fact_families_by_family ON question_fact_families(family_id);
CREATE TRIGGER question_fact_family_immutable BEFORE UPDATE OF fact_key,family_id ON question_fact_families
WHEN NEW.fact_key <> OLD.fact_key OR NEW.family_id <> OLD.family_id
BEGIN
  SELECT RAISE(ABORT, 'Fact family identities are immutable');
END;
CREATE TABLE question_catalog (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('common','rare','earlier','later','general')),
  difficulty INTEGER NOT NULL CHECK(difficulty BETWEEN 1 AND 3),
  category TEXT NOT NULL,
  prompt_fingerprint TEXT NOT NULL UNIQUE,
  content_json TEXT NOT NULL CHECK(json_valid(content_json) AND json_type(content_json, '$.factKeys') = 'array' AND json_array_length(content_json, '$.factKeys') > 0 AND json_extract(content_json,'$.id')=id AND json_extract(content_json,'$.familyId')=family_id AND json_extract(content_json,'$.type')=type AND json_extract(content_json,'$.difficulty')=difficulty),
  selection_key INTEGER NOT NULL,
  pool TEXT NOT NULL CHECK(pool IN ('free','daily')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
);
CREATE INDEX question_catalog_pick ON question_catalog(pool, type, difficulty, enabled, selection_key);
CREATE INDEX question_catalog_mix_pick ON question_catalog(pool, enabled, difficulty, selection_key);
CREATE INDEX question_catalog_by_family ON question_catalog(family_id);
CREATE TRIGGER question_catalog_fact_guard BEFORE INSERT ON question_catalog
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.content_json, '$.factKeys') k
    LEFT JOIN question_fact_families f ON f.fact_key = k.value
    WHERE f.family_id IS NULL OR f.family_id <> NEW.family_id
  ) THEN RAISE(ABORT, 'A fact must belong to exactly one catalog family') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM question_catalog c WHERE c.family_id = NEW.family_id AND c.pool <> NEW.pool
  ) THEN RAISE(ABORT, 'A family must remain in one question pool') END;
END;
CREATE TRIGGER question_catalog_update_fact_guard BEFORE UPDATE OF family_id, content_json, pool ON question_catalog
BEGIN
  SELECT CASE WHEN NEW.family_id <> OLD.family_id OR NEW.pool <> OLD.pool THEN RAISE(ABORT, 'Catalog family and pool identities are immutable') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.content_json, '$.factKeys') k
    LEFT JOIN question_fact_families f ON f.fact_key = k.value
    WHERE f.family_id IS NULL OR f.family_id <> NEW.family_id
  ) THEN RAISE(ABORT, 'A fact must belong to exactly one catalog family') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM question_catalog c WHERE c.family_id = NEW.family_id AND c.id <> NEW.id AND c.pool <> NEW.pool
  ) THEN RAISE(ABORT, 'A family must remain in one question pool') END;
END;
CREATE TABLE question_family_aliases (
  alias_family_id TEXT NOT NULL,
  family_id TEXT NOT NULL,
  PRIMARY KEY(alias_family_id,family_id)
);
CREATE INDEX question_family_aliases_target ON question_family_aliases(family_id,alias_family_id);
CREATE TABLE seen_questions (
  device TEXT NOT NULL,
  family_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  run_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY(device, family_id),
  UNIQUE(run_id, position)
);
CREATE INDEX seen_questions_by_run ON seen_questions(run_id, position);
CREATE TABLE seen_question_backfills (
  device TEXT PRIMARY KEY,
  completed_at INTEGER NOT NULL,
  catalog_version TEXT NOT NULL DEFAULT ''
);
CREATE TABLE daily_question_slots (
  day TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 9),
  family_id TEXT NOT NULL UNIQUE,
  question_id TEXT NOT NULL,
  content_json TEXT NOT NULL CHECK(json_valid(content_json)),
  PRIMARY KEY(day, position)
);
CREATE INDEX daily_question_slots_by_day ON daily_question_slots(day, position);
CREATE TABLE question_catalog_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
