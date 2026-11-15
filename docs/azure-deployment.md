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
Production OAuth client credentials are configured. Their presence and the exact
production origin/callback were verified without displaying values. The user now
reports that deployed browser checks work well under RLirri; this is user-reported
evidence, not direct browser observation by the agent.

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
services. The deployed firewall has 31 individual Azure-advertised possible web-app
outbound IPv4 rules. Using only the 13 current addresses was followed by SQL startup
failures after the OAuth settings restart. Coverage of all 31 possible addresses
was restored; startup recovered and a fresh restart passed. The original logs
lacked driver codes, so the exact earlier network failure is not proven. A single-IP
rule for the migration machine was removed after verification.
Recheck outbound addresses if the plan or networking changes. Migration access
must be permitted temporarily if another local schema migration is needed.
Runtime application code creates neither firewall rules nor database users.

## OAuth and remaining live checks

Register a separate **AI Capsule Production** OAuth App at
https://github.com/settings/applications/new using:

- Homepage: `https://app-ai-capsule-23025563.azurewebsites.net`
- Callback: `https://app-ai-capsule-23025563.azurewebsites.net/api/auth/github/callback`

These URLs are already configured as `PUBLIC_APP_URL` and `GITHUB_CALLBACK_URL`.
The user registered this separate app and entered `GITHUB_CLIENT_ID` and
`GITHUB_CLIENT_SECRET` directly in Azure App Settings. Both are now present and
nonblank; no secret value was printed. Use App Services > app-ai-capsule-23025563 >
Settings > Environment variables > App settings for future secure updates. Do not
share secrets in chat or change the
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
  Those baseline checks remain applicable to unchanged frontend code. SQL diagnostics
  were subsequently tested with the 35-test backend suite described below.
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
- With credentials configured, `/api/auth/session` without a cookie or with a fake
  token returns 401 JSON, which is the correct signed-out result. The previous
  session-check-unavailable message corresponded to real Azure 503/startup failures,
  not a normal unauthenticated session. Health/session recovered after the firewall
  repair; another fresh app restart returned health 200 and session 401.
- Live OAuth initiation returns 302 to GitHub's genuine authorization endpoint,
  with the configured client ID/callback, random state and PKCE S256. The state
  cookie has Secure, HttpOnly, SameSite=Lax, path `/api/auth/github`, Max-Age 600.
  Callback without state redirects to invalid_state; a simulated denial with valid
  state redirects to access_denied. Neither check performs a provider token exchange.
- Live same-origin logout without an authenticated session returns 204 and a token
  clearing cookie with Secure, HttpOnly, SameSite=Lax, path `/` and an expiry in the
  past. Foreign-Origin logout returns 403. This checks the response, not real browser
  cookie removal. Issued token cookie attributes and one-hour expiry are covered by
  existing mocked-provider tests and still need real-login browser inspection.
- Added redacted startup diagnostic codes for SQL connection/schema failures. Only
  approved driver codes and numeric SQL errors are exposed, never raw error text.
  All 35 backend tests passed under Node 24.19.0; frontend code/assets are unchanged.
  The updated runtime artifact was deployed successfully and health rechecked.
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

Browser automation was attempted through a dedicated Chrome tab and the existing
AI Capsule tab; both failed internally with a `timeoutMs` error before interaction.
No real OAuth browser success or protected CRUD was observed in this verification.

The user subsequently reported that the deployed application works well in manual
browser checks using RLirri. Record this as user-reported verification; no individual
browser interaction or cookie inspection was directly observed by the agent.

## Fictional demonstration capsules

Ten fictional capsules were inserted into the production database `ai-capsule` on
`sql-ai-capsule-23025563.database.windows.net` for RLirri. GitHub's official public
users API independently returned stable numeric ID `76832192`; the repository
owner and display name were not used as the storage owner identity.

The browser tool still failed internally, so insertion used a one-off app-container
execution of the local seed script, through Azure CLI `webapp exec`, with the existing
restricted managed identity and parameterized storage adapter. Normal capsule body
validation ran before insertion. No application JWT was read or manufactured. This
verifies SQL insertion/read-back, not an authenticated HTTP API create operation.
No schema, authentication, permissions, firewall, pricing or startup behavior changed.

- First actual run: **10 inserted, 0 skipped**.
- Actual rerun: **0 inserted, 10 skipped**; all ten read-back owners matched.
- Every newly inserted field was checked through owner-scoped storage, including
  booleans, optional empty strings and the original multiline Unicode prompt.
- Existing matches are identified by exact project name and prompt title for this
  owner and skipped without overwriting. Run this manual tool one instance at a time.
- Every project begins with Demo, every note identifies fictional demonstration data,
  and all screenshot URLs are empty. No fabricated evidence or local records were used.
- Health remained 200 after insertion. Authenticated API listing and rendered display
  of these new records remain for the user's dashboard refresh.

| Title | Category | Usefulness | Reviewed | Improved |
| --- | --- | --- | --- | --- |
| Explain an Express route | Coding | Good | Yes | Yes |
| Fix a stale state update | Debugging | Needs improvement | Yes | No |
| Plan capsule API tests | Testing | Good | No | No |
| Revise a project introduction | Writing | Needs improvement | No | Yes |
| Compare relational databases | Research | Not rated | No | No |
| Prepare a deployment checklist | Planning | Good | Yes | No |
| Explain OAuth and JWT sessions | Study | Not rated | Yes | Yes |
| Review a data-cleaning approach | Data analysis | Good | Yes | Yes |
| Review keyboard navigation | Accessibility | Needs improvement | No | No |
| Preserve multiline prompt text | Coding | Good | Yes | No |

Reusable files: `scripts/demo-capsules.js` and `scripts/seed-demo-capsules.js`.
Manual invocation is `node scripts/seed-demo-capsules.js <GitHub-login>` with explicit
production database configuration and an authorized database identity. Target guards
reject SQLite or another database. It is not part of startup or deployment. The CLI
looks up the stable GitHub ID from the provider before opening the database.
All 38 backend tests passed on Node 24.19.0, including temporary-database checks for
validation, all four review combinations, preserved existing/foreign records, exact
multiline text round trips, duplicate skipping and target rejection. No frontend
or API code changed; the established frontend checks remain applicable.

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
