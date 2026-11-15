# Azure deployment

Public origin: https://app-ai-capsule-23025563.azurewebsites.net

The application is deployed in East Asia, in `rg-ai-capsule-student`:

- `plan-ai-capsule-free`: Linux F1 / Free, `reserved=true`, Ready.
- `app-ai-capsule-23025563`: Node 24 LTS, HTTPS-only, system-assigned managed identity.
- `sql-ai-capsule-23025563`: SQL logical server with Entra-only authentication;
  the signed-in migration user is its Entra administrator.
- `ai-capsule`: General Purpose serverless Gen5, maximum 2 vCores, minimum 0.5,
  32 GB maximum size, locally redundant backups, `useFreeLimit=true`,
  `freeLimitExhaustionBehavior=AutoPause`.

The Azure for Students subscription is Enabled, quota identifier
`AzureForStudents_2018-01-01`, with spending limit On. No paid tier, paid overage,
monitoring resource, private endpoint or extra storage resource was enabled.
Production OAuth client credentials are still pending.

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

The actual database properties were checked after provisioning and redeployment:
`useFreeLimit=true`, `freeLimitExhaustionBehavior=AutoPause`, local backup redundancy,
and a 32 GB maximum. Keep these protections enabled; never select paid overages.
The resource reports `autoPauseDelay=60`. Azure rejected an attempt to set 15 with
`ProvisioningDisabled: Only default value for auto pause delay is allowed for Free
Limit database with auto pause exhaustion behavior`. The provider default was left
unchanged; idle suspension has not been observed. Monthly free-limit exhaustion
and idle auto-pause are separate settings.

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
services. The deployed firewall has 13 individual current web-app outbound IPv4
rules. A single-IP rule for the migration machine was removed after verification.
Recheck outbound addresses if the plan or networking changes. Migration access
must be permitted temporarily if another local schema migration is needed.
Runtime application code creates neither firewall rules nor database users.

## OAuth and remaining live checks

Register a separate **AI Capsule Production** OAuth App at
https://github.com/settings/applications/new using:

- Homepage: `https://app-ai-capsule-23025563.azurewebsites.net`
- Callback: `https://app-ai-capsule-23025563.azurewebsites.net/api/auth/github/callback`

These URLs are already configured as `PUBLIC_APP_URL` and `GITHUB_CALLBACK_URL`.
In Azure Portal, open App Services > app-ai-capsule-23025563 > Settings > Environment
variables > App settings. Add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` directly,
then Apply and confirm the restart. Do not share secrets in chat or change the
separate production `JWT_SECRET` already generated in Azure. Local OAuth secrets
and ignored local configuration remain separate and unchanged.

`DATABASE_BACKEND`, `AZURE_SQL_SERVER`, `AZURE_SQL_DATABASE`,
`AZURE_SQL_AUTHENTICATION`, `TRUST_PROXY`, `NODE_ENV`, `PUBLIC_APP_URL`,
`GITHUB_CALLBACK_URL`, `JWT_SECRET`, `SCM_DO_BUILD_DURING_DEPLOYMENT=false` and
`WEBSITE_RUN_FROM_PACKAGE=1` are configured. `TRUST_PROXY=1` trusts the immediate
App Service frontend hop; redirects and Origin checks use the fixed configured
HTTPS origin rather than a forwarded host. JWT cookie settings remain Secure,
HttpOnly, SameSite Lax, path `/`, with the existing expiry. No login bypass exists.

## Verification evidence

- Local build succeeded on Node 24.19.0. The unchanged implementation's baseline
  checks are 34 backend tests, 58 frontend tests, lint and build passing at 9bba166.
  This deployment update changes documentation only; those tests were not rerun.
- The allowlisted ZIP contained production dependencies, server runtime files and
  built frontend, without project environment files, certificates, SQLite data or
  application test files. Both initial deployment and redeployment reported status 4.
- Actual Azure startup logs report Node v24.22.3 and the application listening;
  no application startup failure was logged. Startup awaits the SQL schema check,
  establishing that the deployed managed identity connected successfully.
- Public `/` and `/login`, and the built JavaScript asset, returned HTTPS 200 with
  certificate validation enabled. Initial first-deployment requests timed out during
  warm-up; subsequent checks and restart/redeployment recovery succeeded.
- Actual cURL results: `GET /api/health` returned 200 and `{"status":"ok"}`;
  `GET /api/not-a-route` returned 404 JSON; `GET /api/capsules` without a cookie,
  and with `Cookie: token=fake-token-123`, each returned 401 JSON.
- The OAuth callback route currently returns 503 naming the two missing client
  configuration variables. This is expected until production credentials are set.
- Real Azure SQL adapter checks, using the Entra migration identity, verified all
  fields, defaults, Unicode/quotes, CRUD, owner isolation, managed metadata and a
  repeated schema migration without data loss. The runtime user has only CONNECT
  and capsule-table CRUD grants; impersonation checks showed ALTER denied and no
  db_owner membership. These are real SQL checks, not real OAuth/API browser checks.
- One clearly fictional record, **Verify production persistence**, was created for
  verified RLirri owner `76832192`. It survived both an App Service restart and a
  second deployment, checked through owner-scoped SQL storage with the original
  ID/timestamp and saved v2 version. No local records were uploaded. The separate
  temporary deletion-check record was removed.

Pending after credentials are configured: real GitHub login, browser create/read/
update/delete with refresh persistence, logout, and authenticated production API
ownership checks. No real OAuth success is claimed. The existing fictional record
is available for the verified owner to inspect after login.

F1 has 60 CPU minutes/day, 3 CPU minutes per five-minute interval, 1 GB storage,
1,024 MB memory and 165 MB bandwidth under Microsoft's documented quotas. It has
no Always On or availability guarantee. SQL free allowance is 100,000 vCore seconds,
32 GB data and 32 GB backup per month, with idle auto-pause and unavailability until
the next month when the free limit is exhausted. Do not promise uninterrupted access
throughout the marking period. Verify current quotas and resource configuration
when changing deployment settings. The final README, deployed MP4 demonstration and
source ZIP remain outstanding.

References:

- https://tediousjs.github.io/node-mssql/
- https://learn.microsoft.com/en-us/azure/azure-sql/database/azure-sql-javascript-mssql-quickstart
- https://learn.microsoft.com/en-us/azure/azure-sql/database/free-tier
- https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits
