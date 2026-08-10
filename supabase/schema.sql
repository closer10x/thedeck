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
  archived boolean default false,
  created_at timestamptz default now()
);

-- create table if not exists won't add columns to an existing people table
alter table people add column if not exists phone text;
alter table people add column if not exists photos jsonb default '[]'::jsonb;
alter table people add column if not exists photos_synced_at timestamptz;

create table if not exists invites (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people(id) on delete cascade,
  invited_at timestamptz default now(),
  what text,                             -- "dinner", "beach day", etc
  outcome text default 'pending',        -- pending / yes / no / ghost
  created_at timestamptz default now()
);

create index if not exists invites_person_idx on invites(person_id, invited_at desc);

-- single-user app with no login screen: RLS is off, so the anon key alone can
-- read and write these two tables. Keep the deployment behind the app's own
-- passcode (ROLODECK_PASSCODE) or Vercel password protection.
alter table people disable row level security;
alter table invites disable row level security;

-- STORAGE, done once from the dashboard rather than here:
-- create a public bucket named "avatars" (Storage -> New bucket -> Public).
-- No policies are needed. The browser never writes to storage directly —
-- /api/upload and /api/ig do it with the service role, which bypasses RLS.
-- Creating the bucket in SQL requires ownership of storage.objects, which the
-- SQL editor role doesn't have; attempting it rolls back this entire script.
