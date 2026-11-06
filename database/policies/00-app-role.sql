-- Runs once when the Postgres container is first created.
-- xeva_owner (superuser) owns the schema and runs migrations.
-- xeva_app is what the API connects as: no superuser, no BYPASSRLS,
-- so every Row Level Security policy applies to it.
CREATE ROLE xeva_app LOGIN PASSWORD 'xeva_app_dev' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE xeva TO xeva_app;
GRANT USAGE ON SCHEMA public TO xeva_app;
ALTER DEFAULT PRIVILEGES FOR ROLE xeva_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO xeva_app;
ALTER DEFAULT PRIVILEGES FOR ROLE xeva_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO xeva_app;
