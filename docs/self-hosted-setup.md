# CRAS — Bring Your Own Database

## Overview

CRAS supports **self-hosted data**. Your business data (clients, contacts, activity history) can live on **your own PostgreSQL database** while CRAS handles authentication centrally.

**What this means:**
- You own your data — it stays on your infrastructure
- CRAS connects to your database to read/write data
- Authentication is managed centrally by CRAS

---

## Requirements

| Requirement | Details |
|-------------|---------|
| **PostgreSQL** | Version 14 or later (tested on 17.6) |
| **Access** | A database user with CREATE/INSERT/UPDATE/DELETE permissions |
| **Network** | Your database must be reachable from CRAS servers (or you expose it via a tunnel) |

### Compatible Providers

Any PostgreSQL hosting works:

- **DigitalOcean** Managed Database
- **AWS RDS** / Aurora
- **Google Cloud SQL**
- **Azure Database for PostgreSQL**
- **Supabase** (separate project)
- **Neon**, **Railway**, **Fly.io**
- **Self-hosted** on your own server

---

## Setup Steps

### Step 1: Create Your Database

Create a PostgreSQL database on your preferred provider. Example for DigitalOcean:

```sql
CREATE DATABASE cras_db;
```

### Step 2: Create a Dedicated User

```sql
CREATE USER cras_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE cras_db TO cras_user;
```

Then connect to `cras_db` and grant schema permissions:

```sql
GRANT ALL ON SCHEMA public TO cras_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO cras_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO cras_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO cras_user;
```

### Step 3: Run the CRAS Schema

Download the schema file from CRAS (provided during onboarding) and run it:

```bash
psql -h your-host -p 5432 -U cras_user -d cras_db -f self-hosted-schema.sql
```

Or paste the SQL into your database provider's web console.

This creates all required tables, indexes, and functions. **No seed data is needed** — CRAS provisions your company and default settings automatically on first login.

### Step 4: Provide Your Connection String to CRAS

Once the schema is applied, give CRAS your connection string:

```
postgresql://cras_user:your_secure_password@your-host:5432/cras_db?sslmode=require
```

**Format:**
```
postgresql://<username>:<password>@<host>:<port>/<database>?sslmode=require
```

**sslmode options:**
| Mode | When to use |
|------|-------------|
| `require` | Recommended for cloud providers (DigitalOcean, AWS, etc.) |
| `verify-full` | Stricter — verifies server certificate |
| `disable` | Only for local/trusted networks |

---

## What CRAS Stores Where

### On YOUR database:
- Clients and contact details
- Activity history and stage events
- Categories and products
- Follow-ups and reminders
- Notifications
- Company settings

### On CRAS central servers:
- User accounts and authentication
- Login sessions
- Company registry (name, slug, your DB connection string)

**CRAS never stores your business data centrally.** Only the connection pointer lives on our side.

---

## Connection Security

- All connections use SSL/TLS encryption
- The database user has **full access only to your database** — it cannot access other tenants' data
- Connection strings are encrypted at rest
- You can rotate your database password at any time from CRAS settings

---

## FAQ

**Q: Can I block CRAS from accessing my database?**
A: Yes. Revoke the database user's privileges or change the password. CRAS will show a connection error until access is restored.

**Q: Can I run my own migrations on the same database?**
A: Yes. Add custom tables or columns — CRAS only reads/writes to the tables it owns. Avoid modifying or dropping CRAS tables.

**Q: What if my database goes down?**
A: CRAS will show a connection error. Your data is safe — just restore access when your database is back.

**Q: Can I migrate from hosted to self-hosted later?**
A: Yes. Export your data from CRAS hosted, import into your own database, then update the connection string in CRAS settings.

**Q: Do I need to manage backups?**
A: Yes. CRAS does not backup your self-hosted database. We recommend automated backups from your provider (DigitalOcean, AWS, etc.).

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Connection refused` | Database not reachable | Check host, port, and firewall rules |
| `password authentication failed` | Wrong credentials | Verify username and password |
| `SSL required` | sslmode mismatch | Add `?sslmode=require` to connection string |
| `role "cras_user" does not exist` | User not created | Run Step 2 again |
| `relation "clients" does not exist` | Schema not applied | Run Step 3 again |
