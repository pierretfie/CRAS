# Deities Technologies — DigitalOcean Migration Guide

## Prerequisites

- A DigitalOcean Managed Database (PostgreSQL 14+)
- `psql` client installed locally
- The exported files in `~/Documents/CRAS/Migrate data to Digital Ocean/deities-technologies/`

## Step 1: Create the Database

In the DigitalOcean dashboard:
1. Go to **Databases** → **Create Database**
2. Choose **PostgreSQL**
3. Select your cluster size (recommended: Basic $15/mo minimum)
4. Note the **Connection String** from the database overview

## Step 2: Connect and Apply Schema

```bash
# Replace with your DigitalOcean connection details
psql "postgresql://doadmin:YOUR_PASSWORD@db-mycluster-do-user-XXXX.db.ondigitalocean.com:5432 defaultdb?sslmode=require"

# Apply the schema
\i /path/to/schema.sql
```

Or pipe it directly:

```bash
psql "postgresql://doadmin:YOUR_PASSWORD@db-mycluster-do-user-XXXX.db.ondigitalocean.com:5432 defaultdb?sslmode=require" -f schema.sql
```

> **Self-hosted note (2026-09-08):** `schema.sql` is patched for external DBs — all `→ auth.users` FKs now point to `profiles(id)` (`clients_created_by_fkey`, `client_stage_events_user_id_fkey`, `client_follow_ups_user_id_fkey`, etc.) and `profiles_id_fkey` is removed because `auth.users` is empty externally. `set_client_defaults()` is also conditional (`if auth.uid() is not null`) so `query(..., companyId)` writes via `src/lib/db.server.ts:60` `getPool(companyId)` keep the `company_id`/`created_by` you pass instead of overwriting with `null`.

## Step 3: Import Data (in order)

The import order matters because of foreign key constraints. Import in this exact order:

```bash
DB_URL="postgresql://doadmin:YOUR_PASSWORD@db-mycluster-do-user-XXXX.db.ondigitalocean.com:5432 defaultdb?sslmode=require"
DIR="/path/to/deities-technologies"

# 1. Companies (must come first — referenced by everything)
psql "$DB_URL" -c "\copy companies FROM '$DIR/companies.csv' CSV HEADER;"

# 2. Profiles (references companies)
psql "$DB_URL" -c "\copy profiles FROM '$DIR/profiles.csv' CSV HEADER;"

# 3. User Roles (references companies)
psql "$DB_URL" -c "\copy user_roles FROM '$DIR/user_roles.csv' CSV HEADER;"

# 4. Admin Categories (references companies)
psql "$DB_URL" -c "\copy admin_categories FROM '$DIR/admin_categories.csv' CSV HEADER;"

# 5. Admin Products (references companies)
psql "$DB_URL" -c "\copy admin_products FROM '$DIR/admin_products.csv' CSV HEADER;"

# 6. Conversion Stage Config (references companies)
psql "$DB_URL" -c "\copy conversion_stage_config FROM '$DIR/conversion_stage_config.csv' CSV HEADER;"

# 7. Clients (references companies — disable trigger first)
psql "$DB_URL" -c "ALTER TABLE clients DISABLE TRIGGER clients_set_defaults;"
psql "$DB_URL" -c "\copy clients FROM '$DIR/clients.csv' CSV HEADER;"
psql "$DB_URL" -c "ALTER TABLE clients ENABLE TRIGGER clients_set_defaults;"

# 8. Client Follow-ups (references clients)
psql "$DB_URL" -c "\copy client_follow_ups FROM '$DIR/client_follow_ups.csv' CSV HEADER;"

# 9. Follow-up Logs (references clients, follow_ups)
psql "$DB_URL" -c "\copy follow_up_logs FROM '$DIR/follow_up_logs.csv' CSV HEADER;"

# 10. Client Interactions (references clients)
psql "$DB_URL" -c "\copy client_interactions FROM '$DIR/client_interactions.csv' CSV HEADER;"

# 11. Client Stage Events (references clients)
psql "$DB_URL" -c "\copy client_stage_events FROM '$DIR/client_stage_events.csv' CSV HEADER;"

# 12. Client Access Requests (references clients)
psql "$DB_URL" -c "\copy client_access_requests FROM '$DIR/client_access_requests.csv' CSV HEADER;"

# 13. Notifications (references companies, clients)
psql "$DB_URL" -c "\copy notifications FROM '$DIR/notifications.csv' CSV HEADER;"
```

## Step 4: Verify Import

Run these queries to confirm everything landed correctly:

```sql
-- Should return 1
SELECT COUNT(*) FROM companies;

-- Should return 16
SELECT COUNT(*) FROM profiles;

-- Should return 95
SELECT COUNT(*) FROM clients;

-- Should return 107
SELECT COUNT(*) FROM client_stage_events;

-- Should return 88
SELECT COUNT(*) FROM client_follow_ups;

-- Should return 11
SELECT COUNT(*) FROM admin_categories;

-- Should return 5
SELECT COUNT(*) FROM admin_products;

-- Verify all clients have a valid company_id
SELECT COUNT(*) FROM clients WHERE company_id = '1453f476-5568-42cb-bb2d-40c7b3cffa14';
```

## Step 5: Grant Permissions

If the CRAS server connects with a specific user (not the admin), grant access:

```sql
-- Create a CRAS application user
CREATE USER cras_app WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO cras_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO cras_app;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO cras_app;
```

## Step 6: Update CRAS Connection

In your CRAS deployment, update the `companies` table with the new connection string:

```sql
UPDATE companies
SET connection_string = 'postgresql://cras_app:your_secure_password@db-mycluster-do-user-XXXX.db.ondigitalocean.com:5432/defaultdb?sslmode=require'
WHERE id = '1453f476-5568-42cb-bb2d-40c7b3cffa14';
```

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `permission denied for table X` | User lacks grants | Run Step 5 grants |
| `foreign key violation` | Wrong import order | Re-import in the order listed in Step 3 |
| `violates foreign key "clients_created_by_fkey"` on new client add | Old self-hosted dump referenced `auth.users` (empty externally) | Re-apply `schema.sql` patch above or run `alter table clients drop constraint clients_created_by_fkey; alter table clients add constraint clients_created_by_fkey foreign key (created_by) references profiles(id) on delete cascade;` (same for `client_stage_events`, `client_follow_ups`, `user_roles`, etc.) |
| `null value in column "created_by"` | Trigger fired during import | Make sure trigger is disabled before importing clients |
| `client added but not appear` (self-hosted) | App wrote to central via `supabase` instead of external via `query(..., companyId)` | Update to CRAS ≥ `cebccdc` (`src/routes/_authenticated/clients.new.tsx:169` + `src/components/csv-import-drawer.tsx:262` use `query`) |
| `connection refused` | Wrong host/port | Check DO dashboard for correct connection details |
| `SSL required` | Missing sslmode | Add `?sslmode=require` to connection string |
