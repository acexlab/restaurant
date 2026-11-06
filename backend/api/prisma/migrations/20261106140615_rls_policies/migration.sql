-- ════════════════════════════════════════════════════════════════════
-- Tenant isolation with PostgreSQL Row Level Security (spec 5.2).
--
-- The API sets these per-transaction settings (SET LOCAL semantics):
--   app.tenant_id  the tenant resolved server-side from the authenticated session
--   app.user_id    the authenticated platform user (lets login list the user's own memberships)
--   app.system     'on' only for trusted internal workers (outbox dispatcher, platform admin
--                  operations, which are themselves audited)
--
-- With no settings, every policy evaluates to false: tenant data is invisible (fail closed).
-- The policies apply to role xeva_app (no superuser, no BYPASSRLS).
-- ════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_is_system() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.system', true), '') = 'on' $$;

-- Standard policy for every tenant-scoped table.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branches', 'roles', 'role_permissions', 'employee_roles', 'customers',
    'subscriptions', 'module_installations', 'module_configurations', 'feature_flags',
    'integrations', 'integration_permissions', 'outbox_events', 'event_deliveries',
    'idempotency_keys', 'support_access_grants'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING ("tenantId" = app_current_tenant() OR app_is_system())
         WITH CHECK ("tenantId" = app_current_tenant() OR app_is_system())', t);
  END LOOP;
END $$;

-- Employees: also visible to the platform user they belong to, so login can list memberships.
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON employees
  USING ("tenantId" = app_current_tenant() OR "platformUserId" = app_current_user() OR app_is_system())
  WITH CHECK ("tenantId" = app_current_tenant() OR app_is_system());

-- Audit logs: tenant rows in tenant context; platform-level rows (tenantId NULL) only for system.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_logs
  USING ("tenantId" = app_current_tenant() OR app_is_system())
  WITH CHECK ("tenantId" = app_current_tenant() OR app_is_system());

-- Audit logs are immutable (spec 5.3: immutable audit records).
CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (% blocked)', TG_OP;
END $$;

CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

-- Make sure the application role can use everything created by the init migration.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO xeva_app;
REVOKE UPDATE, DELETE ON audit_logs FROM xeva_app;
