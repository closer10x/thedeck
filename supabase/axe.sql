-- The axe. Run once in the Supabase SQL editor on a database made before it
-- existed; new databases get it from schema.sql already.
--
-- One boolean, because that's all the feature is: whether her photo shows up
-- smashed on the deck. Everything else about it — the swing, the cracks, the
-- axe left in her face — is drawn in the browser and stored nowhere.
--
-- Until this runs the app still works. /api/people notices the column is
-- missing, writes the row without it, and her sheet says to run this.
alter table people add column if not exists axed boolean default false;
