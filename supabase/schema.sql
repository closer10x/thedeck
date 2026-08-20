-- Rolodeck schema. Paste into the Supabase SQL editor.
--
-- The editor runs the whole script as one transaction, so anything that errors
-- takes the rest down with it. Nothing here needs privileges beyond creating
-- your own tables — no extensions, no storage policies. See the note at the
-- bottom for the one piece of setup that lives outside this file.

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ig_handle text,
  photos jsonb default '[]'::jsonb,      -- up to 6: pulled from IG or uploaded
  photos_synced_at timestamptz,          -- last Instagram re-pull; weekly
  phone text,
  photo_url text,
  note text,
  rat_chat boolean default false,        -- is she in the rat chat
  axed boolean default false,            -- her photo shows up smashed
  wingman boolean default false,         -- he's who you bring, not who you ask
  archived boolean default false,
  created_at timestamptz default now()
);

-- create table if not exists won't add columns to an existing people table
alter table people add column if not exists phone text;
-- where she's from: the text you typed, plus Google's answer for it, so the
-- map never has to geocode again
alter table people add column if not exists city text;
alter table people add column if not exists lat double precision;
alter table people add column if not exists lng double precision;
alter table people add column if not exists photos jsonb default '[]'::jsonb;
alter table people add column if not exists photos_synced_at timestamptz;
alter table people add column if not exists axed boolean default false;
-- who you bring rather than who you ask — kept out of every counter
alter table people add column if not exists wingman boolean default false;

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people(id) on delete cascade,
  invited_at timestamptz default now(),
  what text,                             -- "dinner", "beach day", etc
  outcome text default 'pending',        -- pending / yes / no / ghost
  note text,                             -- why she said no, mostly
  created_at timestamptz default now()
);

alter table invites add column if not exists note text;

create index if not exists invites_person_idx on invites(person_id, invited_at desc);

-- who put the row there. A name, not a foreign key: users live in the
-- ROLODECK_USERS env var, not in the database, and the point of stamping it is
-- that it still reads correctly years later even if that list changes.
alter table people add column if not exists created_by text;
alter table invites add column if not exists created_by text;

-- Events: the thing a "yes" turns into. An event has people on it, and each of
-- them has a status — coming, maybe, and afterwards whether she turned up.
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,                    -- "Rooftop dinner"
  at timestamptz,                        -- null = someday, no date yet
  place text,
  note text,
  created_at timestamptz default now(),
  created_by text
);

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

-- The log. Every write the app makes lands here, and nothing ever updates or
-- deletes a row — an audit trail you can edit isn't one.
create table if not exists activity (
  id uuid primary key default gen_random_uuid(),
  at timestamptz default now(),
  actor text not null,                   -- 'Jon' — as it should read back
  action text not null,                  -- 'person.add', 'ask.outcome', ...
  subject text,                          -- her name, copied at write time
  detail text,                           -- the human sentence for the feed
  -- keep the log when she's deleted: the deletion is the entry that matters
  person_id uuid references people(id) on delete set null,
  meta jsonb                             -- changed fields, old/new outcome
);

create index if not exists activity_at_idx on activity(at desc);
create index if not exists activity_person_idx on activity(person_id, at desc);

-- Deleting someone shouldn't erase the record that she existed, so the name is
-- copied onto the entry at write time rather than joined out of people.

-- RLS on with NO policies. That denies anon and authenticated outright; the
-- service role bypasses RLS, and it only runs server-side behind the PIN gate.
-- The browser holds no database credential at all, so there is nothing to steal.
alter table people enable row level security;
alter table invites enable row level security;
alter table activity enable row level security;
alter table events enable row level security;
alter table event_people enable row level security;

drop policy if exists "own rows" on people;
drop policy if exists "own rows" on invites;

-- STORAGE, done once from the dashboard rather than here:
-- create a public bucket named "avatars" (Storage -> New bucket -> Public).
-- No policies are needed. The browser never writes to storage directly —
-- /api/upload and /api/ig do it with the service role, which bypasses RLS.
-- Creating the bucket in SQL requires ownership of storage.objects, which the
-- SQL editor role doesn't have; attempting it rolls back this entire script.
