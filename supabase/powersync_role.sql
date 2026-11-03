-- Run ONCE in the Supabase SQL Editor (or via psql). Replace the password
-- with a generated value (e.g. `openssl rand -base64 32`) and put the same
-- value in .env as PS_DATABASE_PASSWORD. Do not commit the real password.
create role powersync_role with replication bypassrls login password 'REPLACE_WITH_GENERATED_PASSWORD';
grant usage on schema public to powersync_role;
grant select on all tables in schema public to powersync_role;
alter default privileges in schema public grant select on tables to powersync_role;
