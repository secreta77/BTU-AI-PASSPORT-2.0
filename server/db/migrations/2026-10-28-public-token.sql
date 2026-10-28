-- Adds passports.public_token (the secret of the permanent link /p/:token) to a database that already exists.
-- Run it ONCE in the Supabase SQL Editor, BEFORE the server version that reads public_token is deployed.
-- It only ADDS a column and two constraints: no data is changed or deleted, and the old server code ignores the column.
-- A second run stops at the first statement ("column already exists") and, being one transaction, changes nothing.
--
-- Backfill: the DEFAULT is volatile, so PostgreSQL evaluates it once per existing row. Every passport gets its own random
-- value (two random UUIDs -> 32 bytes -> base64url, 43 characters). The same expression is the DEFAULT in db/schema.sql,
-- so passports created later get a token in the same way.

BEGIN;

ALTER TABLE passports ADD COLUMN public_token text NOT NULL
  DEFAULT (rtrim(translate(encode(decode(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/', '-_'), '='));

ALTER TABLE passports ADD CONSTRAINT passports_public_token_key UNIQUE (public_token);
ALTER TABLE passports ADD CONSTRAINT passports_public_token_check CHECK (public_token ~ '^[A-Za-z0-9_-]{22,64}$');

COMMIT;

-- Check (run after the migration). Expected: passports = distinct_tokens, shortest = longest = 43.
-- This shows counts and lengths only, never the tokens themselves.
SELECT count(*) AS passports,
       count(DISTINCT public_token) AS distinct_tokens,
       min(length(public_token)) AS shortest,
       max(length(public_token)) AS longest
FROM passports;
