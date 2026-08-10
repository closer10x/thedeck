-- Adds the activity log and the created_by stamps to a Rolodeck database that
-- already has people and invites in it. Paste into the Supabase SQL editor.
--
-- Safe to run more than once, and safe to run against a database with rows in
-- it: nothing here drops or rewrites anything. Everything below is also in
-- schema.sql, so a fresh setup doesn't need this file.
--
-- The app works before this runs — the log just stays empty and the Activity
-- panel says so — so you can deploy first and run this after.

alter table people add column if not exists created_by text;
alter table invites add column if not exists created_by text;

create table if not exists activity (
  id uuid primary key default gen_random_uuid(),
  at timestamptz default now(),
  actor text not null,                   -- 'Jon' — as it should read back
  action text not null,                  -- 'person.add', 'ask.outcome', ...
  subject text,                          -- her name, copied at write time
  detail text,                           -- the human sentence for the feed
  -- keep the log when she's deleted: the deletion is the entry that matters
  person_id uuid references people(id) on delete set null,
  meta jsonb
);

create index if not exists activity_at_idx on activity(at desc);
create index if not exists activity_person_idx on activity(person_id, at desc);

-- same as the other two tables: on, with no policies, so only the service role
-- behind the PIN gate can read or write it
alter table activity enable row level security;
