-- Events: the thing a "yes" turns into. Paste into the Supabase SQL editor.
--
-- Safe to run more than once and safe against a database with rows in it —
-- nothing here drops or rewrites anything. Everything below is also in
-- schema.sql, so a fresh setup doesn't need this file.
--
-- Until this runs, the app works and the Events tab says what's missing.

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,                    -- "Rooftop dinner"
  at timestamptz,                        -- null = someday, no date yet
  place text,
  note text,
  created_at timestamptz default now(),
  created_by text                        -- the name on the PIN that made it
);

-- Who's on it. A row here is a person attached to an event, with where she got
-- to: coming, maybe, and then afterwards whether she actually turned up.
create table if not exists event_people (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  person_id uuid references people(id) on delete cascade,
  status text default 'coming',          -- coming / maybe / came / noshow
  created_at timestamptz default now(),
  created_by text,
  -- adding her twice is a mistake, not a second guest
  unique (event_id, person_id)
);

create index if not exists events_at_idx on events(at desc nulls last);
create index if not exists event_people_event_idx on event_people(event_id);
create index if not exists event_people_person_idx on event_people(person_id);

-- same as every other table: on, with no policies, so only the service role
-- behind the PIN gate can read or write
alter table events enable row level security;
alter table event_people enable row level security;
