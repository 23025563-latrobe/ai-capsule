# Azure deployment preparation

This branch prepares the application; it does not provision or deploy Azure resources.
The existing Linux F1 plan is `plan-ai-capsule-free` in `rg-ai-capsule-student`, East Asia.
No Azure SQL database or production OAuth App has been verified yet.

## Build and start

Use Node 24.19.0 for local verification. App Service should use Node 24 LTS.
Run from the repository root:

```sh
npm ci
npm --prefix client ci
npm run build
npm start
```

Build before packaging. Include the built `client/dist`, server, package files and
runtime dependencies in the deployment artifact; exclude `.env`, `.certs`, `data`,
`.git`, test data and local configuration. Do not commit the artifact or build output.
`npm start` uses App Settings, reads Azure's `PORT`, and binds to `0.0.0.0`.
Express serves the frontend and API from the same origin. Unknown `/api` requests
return JSON 404 responses. Configure HTTPS-only mode and `TRUST_PROXY=1` in Azure;
set `NODE_ENV=production` in App Settings and leave `TRUST_PROXY` unset for direct local development.

## Database configuration

SQLite remains the default. Existing local databases are not migrated or uploaded.
Use these App Settings for Azure SQL:

- `DATABASE_BACKEND=azure-sql`
- `AZURE_SQL_SERVER=<server-name>.database.windows.net`
- `AZURE_SQL_DATABASE=ai-capsule`
- `AZURE_SQL_AUTHENTICATION=managed-identity`

Enable the web app's system-assigned managed identity. The driver obtains tokens
server-side; no SQL password or connection string is required. Connections require
TLS and validate the server certificate. SQL startup failures stop the process;
they never select SQLite as a fallback. Runtime checks the existing capsule columns
without running DDL. The small connection pool releases idle connections, although
actual SQL auto-pause behavior must still be verified on Azure.

## Schema and permissions

Provision a new SQL database only after separate authorization, with
`useFreeLimit=true`, `freeLimitExhaustionBehavior=AutoPause`, local backup redundancy,
and a 32 GB maximum. Confirm the actual resource properties after creation. Never
select paid overages. Regional capabilities advertised AutoPause free-limit support
in East Asia; this is not a claim of successful database provisioning.

Use an authorized Microsoft Entra migration identity with schema creation permissions
(for example, the SQL server's Entra administrator). Run separately from app startup:

```sh
DATABASE_BACKEND=azure-sql AZURE_SQL_AUTHENTICATION=default npm run db:migrate
```

Set the SQL server and database environment variables securely before running that
command. The default credential chain can use an authorized `az login` session.
The migration uses a transaction and application lock, creates the table and owner
index only when missing, and never drops or replaces existing data. New schema
changes should be separate reviewed migrations; this script does not repair an
incompatible existing table automatically. SQL-generated IDs, UTC timestamps and
empty/default values are retained. UTF-16 text columns preserve Unicode content.

As the Entra administrator, create the runtime user and grant access only to this table
(replace the bracketed name with the actual managed identity name):

```sql
CREATE USER [app-ai-capsule-23025563] FROM EXTERNAL PROVIDER;
GRANT SELECT, INSERT, UPDATE, DELETE ON OBJECT::dbo.capsules
    TO [app-ai-capsule-23025563];
```

Do not grant the web app `db_owner`, `db_ddladmin` or schema migration permissions.
Resolving the managed identity may require appropriate tenant directory permissions;
verify this during provisioning rather than granting broad directory access blindly.
Restrict SQL firewall rules to the web app's required outbound addresses. Do not
open the firewall to all IP addresses or automatically enable access for all Azure
services. No firewall rules or database users are created by this repository.

## OAuth and remaining live checks

Create a separate production GitHub OAuth App once Azure assigns the actual public
HTTPS hostname. Use that exact origin as the homepage and `PUBLIC_APP_URL`; use
`<origin>/api/auth/github/callback` for both the registered callback and
`GITHUB_CALLBACK_URL`. Keep the local OAuth App and ignored local `.env` unchanged.
Set `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and a fresh `JWT_SECRET` through Azure
App Settings without printing values. JWT cookies remain Secure, HttpOnly, SameSite
Lax, path `/`, with the existing expiry. Production has no test-login route.

SQL driver tests use mocks. They do not execute T-SQL against Azure. Before deployment
is accepted, run the migration twice against a real database and confirm records
survive, test all protected CRUD/ownership behavior, verify real GitHub OAuth in a
browser, then check persistence after an App Service restart and redeployment.

F1 has 60 CPU minutes/day, 3 CPU minutes per five-minute interval, 1 GB storage,
1,024 MB memory and 165 MB bandwidth under Microsoft's documented quotas. It has
no Always On or availability guarantee. SQL free allowance is 100,000 vCore seconds,
32 GB data and 32 GB backup per month, with idle auto-pause and unavailability until
the next month when the free limit is exhausted. Do not promise uninterrupted access
throughout the marking period. Verify current quotas and resource configuration
before deployment. No deployment URL or live persistence result exists yet.

References:

- https://tediousjs.github.io/node-mssql/
- https://learn.microsoft.com/en-us/azure/azure-sql/database/azure-sql-javascript-mssql-quickstart
- https://learn.microsoft.com/en-us/azure/azure-sql/database/free-tier
- https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits
