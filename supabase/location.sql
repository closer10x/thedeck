-- Where she's from. Paste into the Supabase SQL editor.
--
-- Safe to run more than once and safe against a database with rows in it.
-- Everything here is also in schema.sql, so a fresh setup doesn't need this.
--
-- `city` is what you typed and what gets shown — "Tampa", "Palm Beach", a
-- neighbourhood, whatever you'd actually say. The coordinates are Google's
-- answer for it, kept alongside so the map never has to geocode again: the
-- lookup happens once, when you pick the place.
alter table people add column if not exists city text;
alter table people add column if not exists lat double precision;
alter table people add column if not exists lng double precision;

-- the map only ever asks for people who have both
create index if not exists people_located_idx on people(lat, lng)
  where lat is not null and lng is not null;
