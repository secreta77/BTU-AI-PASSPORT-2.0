-- PostgreSQL schema. Values in CHECK lists must change together with server/shared/constants.js.

-- Numbers for new Passport IDs (BTU-AI-000NNN). Bootstrap must setval() it to the highest imported number.
CREATE SEQUENCE passport_number_seq START 1;

CREATE TABLE students (
  student_id       text PRIMARY KEY CHECK (student_id ~ '^BTU-T-[0-9]{4}$'),
  first_name       text NOT NULL,
  last_name        text NOT NULL,
  email            text NOT NULL,
  program          text NOT NULL,
  education_level  text NOT NULL,
  status           text NOT NULL CHECK (status IN ('Active', 'Graduate')), -- keep in sync with constants.js
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX students_email_idx ON students (lower(email));

CREATE TABLE skills (
  skill_id     text PRIMARY KEY CHECK (skill_id ~ '^SKL-[0-9]{3}$'),
  name         text NOT NULL,
  category     text NOT NULL CHECK (category IN ('AI Skill', 'AI Applied Skill', 'AI Advanced Skill')), -- keep in sync with constants.js
  description  text NOT NULL
);

-- public_token is the secret part of the permanent link /p/:token (LinkedIn). It is random, never changes and is not
-- derived from anything else. The DEFAULT makes the database create it (43 base64url characters from 2 random UUIDs,
-- about 240 bits), so every code path that inserts a passport gets one. The same expression is in
-- db/migrations/2026-10-28-public-token.sql, which adds the column to a database that already exists.
CREATE TABLE passports (
  passport_id      text PRIMARY KEY CHECK (passport_id ~ '^BTU-AI-[0-9]{6}$'),
  student_id       text NOT NULL UNIQUE REFERENCES students (student_id),
  first_issued_at  date NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  public_token     text NOT NULL UNIQUE CHECK (public_token ~ '^[A-Za-z0-9_-]{22,64}$')
    DEFAULT (rtrim(translate(encode(decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/', '-_'), '='))
);

CREATE TABLE passport_versions (
  id                 serial PRIMARY KEY,
  passport_id        text NOT NULL REFERENCES passports (passport_id),
  version            integer NOT NULL CHECK (version >= 1),
  verification_code  text NOT NULL UNIQUE CHECK (verification_code ~ '^BTU-V-[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  status             text NOT NULL CHECK (status IN ('latest', 'superseded')), -- keep in sync with constants.js
  doc_hash           text NOT NULL CHECK (doc_hash ~ '^[0-9a-f]{64}$'),
  tx_hash            text NOT NULL CHECK (tx_hash ~ '^0x[0-9a-f]{64}$'),
  pdf_path           text NOT NULL,
  issued_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (passport_id, version)
);
CREATE UNIQUE INDEX one_latest_per_passport_idx ON passport_versions (passport_id) WHERE status = 'latest';

CREATE TABLE skill_awards (
  id              serial PRIMARY KEY,
  record_id       text NOT NULL UNIQUE,
  student_id      text NOT NULL REFERENCES students (student_id),
  skill_id        text NOT NULL REFERENCES skills (skill_id),
  earned_through  text,
  date_earned     date NOT NULL,
  version_id      integer REFERENCES passport_versions (id), -- NULL = not yet issued in a passport
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, skill_id)
);
CREATE INDEX skill_awards_student_idx ON skill_awards (student_id);
CREATE INDEX skill_awards_skill_idx ON skill_awards (skill_id);

CREATE TABLE sync_log (
  id          bigserial PRIMARY KEY,
  sheet_row   integer,
  record_id   text,
  student_id  text,  -- plain text on purpose: invalid IDs like BTU-T-9999 must be loggable
  level       text NOT NULL CHECK (level IN ('info', 'error', 'duplicate')), -- keep in sync with constants.js
  message     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- Each error/duplicate is logged once: use INSERT ... ON CONFLICT DO NOTHING. Message always contains the Sheet row number (Row N: ...), so rows without record_id stay distinct.
CREATE UNIQUE INDEX sync_log_issue_once_idx ON sync_log (record_id, message) NULLS NOT DISTINCT WHERE level <> 'info'; -- needs PostgreSQL 15+
CREATE INDEX sync_log_record_idx ON sync_log (record_id);

CREATE TABLE otp_codes (
  id          serial PRIMARY KEY,
  email       text NOT NULL,
  code_hash   text NOT NULL,
  attempts    integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_codes_email_idx ON otp_codes (lower(email));
