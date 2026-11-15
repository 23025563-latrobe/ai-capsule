# AI Capsule

**A private library for AI prompts and response notes**<br>
Cloud-Based Web Application — academic project<br>
**Ruixin Huang · La Trobe University Student ID: 23025563**

AI Capsule is a full-stack application for saving, viewing, editing and deleting prompt records. Each capsule keeps a project name, prompt version, original prompt, response summary and reflection notes together. Users can rate a response and independently record whether they reviewed it and improved the output.

The application stores material entered by the user. It does not call an AI model or generate responses.

## Live application

[**Open AI Capsule**](https://app-ai-capsule-23025563.azurewebsites.net)

Sign in with GitHub to open your capsule workspace. Each account sees only its own records; a new account starts with an empty workspace. The public overview remains available without signing in.

React and Express run together on Azure App Service, with Azure SQL Database for production storage. Free hosting can take time to start, and the database can pause. If an initial request fails, allow the service to start and retry. The free configuration does not guarantee uninterrupted availability.

## Video demonstration

The assignment requires a **3–5 minute MP4 with working audio**, uploaded directly to the LMS alongside the source ZIP. No recorded video or video link has been supplied for this repository yet. An external link would be supplementary and would not replace the MP4 upload.

The recording sequence and outstanding evidence are in the [submission checklist](docs/submission-checklist.md).

## Application screenshots

Application screenshots have not yet been added to the repository. Browser capture was unavailable during documentation preparation, so no generated mockups or broken image references are included.

The [screenshot checklist](docs/submission-checklist.md#application-screenshots) lists four deployed views to capture: login, dashboard, form and capsule details. Use fictional records and add the actual images before submission.

## Features

- Create, read, edit and delete your own capsules through the protected Express API.
- Save project, title, version, prompt text, response summary, category, usefulness, review flags, screenshot URL and notes; display the server-generated creation date.
- Search titles, projects, prompts, summaries, categories and notes without changing stored records.
- Combine category, usefulness and Reviewed filters while retaining most-recent-first ordering. Improved remains an independent visible status.
- Choose category suggestions, reuse saved categories or enter a custom category.
- Select Good, Needs improvement or Not rated; preserve legacy ratings when editing.
- Copy the original prompt, including whitespace and Unicode, with accessible success or failure feedback.
- Retain form input after failed saves, show field-specific validation, confirm deletion and handle loading, empty, no-match and retry states.
- Check the backend session before showing protected content, and clear protected client state when authentication is rejected.

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite 8, JavaScript/JSX, CSS |
| Backend | Node.js 24, Express 5 using ES modules |
| Authentication | GitHub OAuth, PKCE, Express-issued JWT via `jsonwebtoken`, `cookie-parser` |
| Local database | SQLite through Node's built-in `node:sqlite` |
| Production database | Azure SQL Database through `mssql` and its Tedious driver; managed identity |
| Hosting | Linux Azure App Service Free F1; one HTTPS origin |
| Automated checks | Node test runner and native fetch; Vitest, React Testing Library, jsdom; ESLint and Vite build |

The application uses pathname-based page handling and native links; React Router is not a dependency.

## Install and run locally

The [GitHub repository](https://github.com/23025563-latrobe/ai-capsule) is private. GitHub access is required to clone it. The submitted source ZIP can be extracted and run without Git.

Prerequisites are Node.js **24.19.0**, npm and OpenSSL with `-addext` support. Checks were run on Node 24.19.0; `.nvmrc` selects major version 24. The deployed Azure runtime was observed as Node 24.22.3. The commands below use Bash-compatible shell syntax.

1. Clone the repository, or open the extracted `ai-capsule` directory:

   ```bash
   git clone https://github.com/23025563-latrobe/ai-capsule.git
   cd ai-capsule
   ```

   If using nvm, select the checked version:

   ```bash
   nvm install 24.19.0
   nvm use 24.19.0
   node --version
   ```

2. Install the backend and frontend dependencies from the repository root:

   ```bash
   npm ci
   npm --prefix client ci
   ```

3. Create a local environment file without overwriting an existing one:

   ```bash
   [ -f .env ] || cp .env.example .env
   chmod 600 .env
   ```

   Edit the ignored `.env` locally. Keep SQLite selected for normal local development. The example uses backend port **3001** and public frontend **https://localhost:5173**. If port 3001 is occupied, choose an available backend port, such as 3002, in `.env`; both Express and the Vite proxy read that setting. Do not terminate an unrelated service.

4. Register a separate local GitHub OAuth App at [GitHub's registration page](https://github.com/settings/applications/new):

   - Homepage: `https://localhost:5173`
   - Callback: `https://localhost:5173/api/auth/github/callback`

   Enter its client ID and secret directly into `.env`. Keep the public URL and callback consistent with the registered URLs. Generate a local JWT secret without printing it:

   ```bash
   node --input-type=module <<'JS'
   import { readFileSync, writeFileSync } from 'node:fs';
   import { randomBytes } from 'node:crypto';
   const env = readFileSync('.env', 'utf8');
   const updated = env.replace(/^JWT_SECRET=[ \t]*$/m,
     `JWT_SECRET=${randomBytes(32).toString('hex')}`);
   writeFileSync('.env', updated);
   JS
   ```

   This fills the blank example entry and preserves an existing secret. Keep secrets out of terminal recordings, Git and frontend variables.

5. Create the local HTTPS certificate:

   ```bash
   npm run dev:cert
   ```

   The script creates `.certs/localhost.pem` and its private key, valid for 30 days. Trust the certificate locally or accept its localhost browser warning. Existing files are preserved; regenerate them explicitly when expired. The certificate and key are ignored by Git. Secure cookies remain enabled during local development.

6. Start Express in terminal 1, from the repository root:

   ```bash
   npm run dev
   ```

   This loads `.env` and starts the backend with watch mode. The internal health URL is `http://localhost:3001/api/health`, or the backend port selected in `.env`.

7. Start Vite in terminal 2, also from the repository root:

   ```bash
   npm --prefix client run dev
   ```

   Open **https://localhost:5173**. Vite forwards all `/api` requests, including OAuth initiation and callback, to Express. Both services must run. Its strict frontend port prevents an unnoticed URL change. If changing the frontend port, update the public URL, callback and GitHub OAuth registration together.

Use the HTTPS frontend for login, not the internal HTTP backend. Without OAuth configuration, health remains public, authentication endpoints explain the missing configuration and capsule access remains rejected; there is no temporary login bypass.

### Run checks

From the repository root:

```bash
npm test
npm --prefix client test
npm --prefix client run lint
npm run build
```

The final deployment review passed **38 backend tests and 58 frontend tests**, lint, build and diff checks. Tests use temporary/in-memory databases and fictional fixtures, preserving the working database. SQL driver unit tests and provider exchanges use mocks. Separate integration checks exercised the real Azure SQL database; mocked tests are not evidence of a real GitHub login.

### Production build and startup

```bash
npm ci
npm --prefix client ci
npm run build
npm start
```

`npm start` runs `node server/index.js` without watch mode and does not load `.env`. In production, Azure provides the environment settings and `PORT`; Express binds to `0.0.0.0`. `npm run build` creates `client/dist`, which Express serves with the API from one origin. Unknown `/api` routes return JSON errors rather than frontend HTML.

For a local non-watch backend using `.env`, run `node --env-file=.env server/index.js` instead of `npm run dev`; keep using Vite HTTPS for the local OAuth flow.

## Configuration

Names and purposes are listed here; no real secret values are included. The [example environment file](.env.example) contains non-secret examples.

| Variable | Purpose | Use |
| --- | --- | --- |
| `PORT` | Express listening port; Azure supplies it | Local and production |
| `DATABASE_BACKEND` | Explicitly select SQLite or Azure SQL | Local and production |
| `DATABASE_PATH` | SQLite path, resolved from the repository root if relative | Local SQLite |
| `PUBLIC_APP_URL` | Public HTTPS origin used for OAuth, JWT issuer and Origin checks | Both |
| `GITHUB_CALLBACK_URL` | Exact public origin plus `/api/auth/github/callback` | Both |
| `GITHUB_CLIENT_ID` | Client ID of the appropriate OAuth App | Both |
| `GITHUB_CLIENT_SECRET` | Server-side OAuth secret | Both; secret |
| `JWT_SECRET` | Random application JWT signing secret, at least 32 bytes | Both; secret |
| `AZURE_SQL_SERVER` | SQL logical server hostname | Azure SQL |
| `AZURE_SQL_DATABASE` | SQL database name | Azure SQL |
| `AZURE_SQL_AUTHENTICATION` | Managed identity at runtime or default Azure credential chain for an authorized migration identity | Azure SQL |
| `TRUST_PROXY` | Explicitly trust the immediate Azure frontend proxy hop; leave unset for direct local development | Production proxy |
| `NODE_ENV` | Production runtime mode | Production |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | Disable remote builds when deploying the prepared artifact | Azure deployment |
| `WEBSITE_RUN_FROM_PACKAGE` | Run the deployed ZIP package | Azure deployment |

Separate local and production OAuth Apps keep local login usable. Production registration uses:

- Homepage: `https://app-ai-capsule-23025563.azurewebsites.net`
- Callback: `https://app-ai-capsule-23025563.azurewebsites.net/api/auth/github/callback`

Production secrets are configured directly in Azure App Settings. Never copy them into this README, source files, the source ZIP or a video. Only `VITE_`-prefixed environment variables are exposed to frontend code; secrets must never use that prefix.

## Database creation and storage

### Local SQLite

Startup opens `data/ai-capsule.sqlite` by default, creates its directory if needed and initializes the capsule table and owner/date index without deleting records. Relative paths resolve from the repository root regardless of the launch directory. Existing records persist across ordinary local restarts. No separate database server or SQL import is needed.

### Production Azure SQL

The production database is `ai-capsule` on `sql-ai-capsule-23025563.database.windows.net`. It stores every required capsule field, including the trusted owner, original prompt, optional reflection fields, independent review flags and automatically generated ID and UTC creation timestamp.

[Schema setup](sql/001-capsules.sql) runs separately from application startup. It uses a transaction and schema lock, creates the table/index only when missing, and does not drop existing records. With an authorized Entra migration identity and SQL configuration already supplied, run:

```bash
DATABASE_BACKEND=azure-sql AZURE_SQL_AUTHENTICATION=default npm run db:migrate
```

Supply `AZURE_SQL_SERVER` and `AZURE_SQL_DATABASE` in the command environment first;
this command does not load the local `.env` automatically. Use the default Azure credential chain for this migration identity, with database schema permissions and approved network access. Production runtime instead uses the web app's managed identity, with only database connection access and `SELECT`, `INSERT`, `UPDATE`, `DELETE` on `dbo.capsules`. It has no schema-altering permission or `db_owner` membership. See [deployment notes](docs/azure-deployment.md) for setup and grants.

Connections are encrypted and validate the server certificate. Azure SQL selection fails clearly if configuration, connectivity or schema is unavailable; it never silently switches to SQLite. Startup checks the schema without attempting DDL. Both database backends close connections on shutdown.

CRUD ownership comes only from the verified JWT's stable GitHub user ID. Browser-supplied owner, ID and timestamp fields are rejected. List queries filter by owner; updates and deletes match both ID and owner. Foreign and missing records receive the same 404. Supplied SQL values are parameterized.

A fictional verification record survived an App Service restart and redeployment, confirmed through owner-scoped Azure SQL read-back. This verifies database persistence independently of the user's browser checks. Azure storage is separate from the application package; local SQLite files were not deployed.

### Fictional demonstration data

Ten demonstration capsules were explicitly added to one verified test account. Their projects begin with Demo, notes identify fictional data and screenshot URLs are empty. They are examples for interface testing and presentation, not evidence of actual AI interactions. They are not global starter data and are not inserted on startup.

The optional [manual seed tool](scripts/seed-demo-capsules.js) validates its production target, resolves a supplied GitHub login through GitHub's official API, and skips existing owner/project/title matches. Its first production run inserted 10 records; a second inserted 0 and skipped 10 without overwriting records. Normal installation and deployment do not run this script.

## Routes and authentication

| Method and path | Access and behavior |
| --- | --- |
| `GET /` | Public overview with session-aware navigation |
| `GET /login` | Public GitHub sign-in page |
| `GET /dashboard` | Verified session required; otherwise redirects to login |
| `GET /api/health` | Public; 200 with `{"status":"ok"}` |
| `GET /api/auth/github` | Start GitHub OAuth |
| `GET /api/auth/github/callback` | Validate state, exchange authorization code and establish session |
| `GET /api/auth/session` | 200 with minimal user information; 401 without a valid session |
| `POST /api/auth/logout` | Same-origin logout; clear cookie; 204 |
| `GET /api/capsules` | JWT required; 200 with `{ capsules: [...] }` for the owner |
| `POST /api/capsules` | JWT and same Origin required; 201 with `{ capsule: ... }` |
| `PUT /api/capsules/:id` | JWT and same Origin required; 200 with replacement writable values |
| `DELETE /api/capsules/:id` | JWT and same Origin required; 204 without a response body |

React makes relative `/api` requests with same-origin credentials. The development proxy handles those requests locally; Express handles them directly in production.

OAuth starts with a cryptographically random, single-use state value that expires after ten minutes, plus PKCE S256. Express validates the callback and retrieves the identity from GitHub's authenticated API. The provider access token stays server-side and is not used as the application session token.

Express issues its own one-hour JWT in a cookie named `token`, with Secure, HttpOnly, SameSite=Lax and path `/`. JavaScript does not read that cookie or store a JWT in localStorage. Middleware verifies the HS256 signature, expiry, issuer, audience and required identity claims on every capsule route. Missing, forged or expired JWTs receive 401 before database access. Logout requires the configured Origin and clears the cookie with matching attributes.

POST and PUT independently validate the body on the server. Project name, prompt title and prompt text must be nonblank. Prompt version is a short free-text label; new forms start at v1 and omitted API versions use the database-compatible default 1. PUT is replacement, so omitted optional values reset; the frontend sends all writable fields to preserve them. Booleans must be actual JSON booleans. Screenshot links accept HTTP/HTTPS without credentials; no file-upload feature is implemented.

Invalid input or malformed JSON returns 400, missing/foreign records 404, failed mutation Origin checks 403, and unexpected failures a generic 500. DELETE rejects a request body. User text is rendered as text, without raw HTML injection.

## Deployment and verification

The application runs in East Asia in `rg-ai-capsule-student`, on Linux Free F1 plan `plan-ai-capsule-free`, web app `app-ai-capsule-23025563`. The deployment artifact contains the built frontend, server runtime and production dependencies. Environment files, certificates, local databases and test files are excluded. This deployment artifact is separate from the source ZIP required for assessment.

Azure settings enable HTTPS-only access, Node 24 LTS and `npm start`. The SQL database uses General Purpose serverless Gen5, maximum 2 vCores, minimum 0.5, 32 GB and local backups. Its actual properties were verified as `useFreeLimit=true` and `freeLimitExhaustionBehavior=AutoPause`; subscription spending limit remains On. No paid overages or optional paid monitoring/networking resources were enabled.

### Required public cURL checks

Run these against the deployed service without a real session cookie. The filter removes any platform `Set-Cookie` headers from the display; status lines and bodies remain visible.

```bash
curl -i https://app-ai-capsule-23025563.azurewebsites.net/api/capsules \
  | sed '/^[Ss]et-[Cc]ookie:/d'

curl -i -H "Cookie: token=fake-token-123" \
  https://app-ai-capsule-23025563.azurewebsites.net/api/capsules \
  | sed '/^[Ss]et-[Cc]ookie:/d'
```

Both checks returned **401 Unauthorized** with:

```json
{"error":"Authentication required."}
```

The public health check returned 200 with the required JSON:

```bash
curl -sS -w '\nHTTP %{http_code}\n' \
  https://app-ai-capsule-23025563.azurewebsites.net/api/health
```

```text
{"status":"ok"}
HTTP 200
```

These live requests were repeated during final deployment review. The HTTPS frontend and JavaScript asset returned 200, and all 19 deployed runtime/build file hashes matched reviewed source and the fresh build. No restart was needed for that final comparison.

Automated checks cover authentication failures on every CRUD route, ownership isolation, validation, asynchronous failures and storage behavior. Previous Azure integration checks exercised the actual database through the authorized migration identity. OAuth initiation/state/PKCE, signed-out session 401, callback error handling and logout response attributes were checked against the public service without extracting a real JWT.

The student reported that deployed browser checks and demonstration records worked correctly using RLirri. That is user-reported manual evidence. Browser automation was unavailable, so it is not described as direct automated observation of real OAuth or browser CRUD. The final recorded MP4 remains required submission evidence.

## AI assistance and individual contribution

I used ChatGPT and Codex extensively for planning, implementation, interface refinement, SQL queries, OAuth/JWT integration, Azure configuration, debugging, tests and documentation. AI assistance also helped draft the clearly labelled fictional demonstration records.

I set the project scope, reviewed implementation choices and changes, configured the OAuth Apps, and manually checked the deployed application and demonstration records. I am responsible for understanding and explaining the submitted code and verifying the final submission. This disclosure does not claim that I independently wrote every line of code.

### Problem found and corrected

During AI-assisted deployment, the SQL firewall was narrowed to the app's 13 currently advertised outbound addresses. SQL startup failures and Azure 503 responses were later observed after an application-settings restart. Restoring single-IP rules for all 31 Azure-advertised possible outbound addresses was followed by successful startup and a fresh restart check. No all-public or all-Azure firewall rule was opened.

The original logs did not retain enough diagnostic information to prove the precise earlier network cause. Startup reporting was improved to include approved driver codes and numeric SQL errors while withholding raw messages and credentials. Backend tests cover that redaction.

### Implementation decision

I chose local SQLite for straightforward development and a separate relational Azure SQL database for cloud persistence. This keeps data outside the deployed App Service package and avoids relying on SQLite locking over a network file share. I can explain how both adapters preserve the same owner-scoped API contract and why migration privileges are separate from runtime permissions.

JWT verification and protected API behavior were checked through automated HTTP tests and the deployed no-cookie/fake-token requests. CRUD and ownership were covered by temporary-database HTTP tests and real SQL integration; the deployed browser checks are separately recorded as my manual verification.

## Limitations and academic use

- F1 has documented limits including 60 CPU minutes/day, 3 CPU minutes per five-minute interval, 1 GB storage, 1,024 MB memory and a 165 MB bandwidth quota. It has no Always On or availability guarantee and can stop serving when limits are reached.
- Azure SQL's free allowance is 100,000 vCore-seconds, 32 GB data and 32 GB backup per month. Free-limit AutoPause can make it unavailable until the next month. The deployed resource reports an idle pause setting of 60 minutes; an attempt to change it to 15 was rejected because this free configuration permits only the provider default. Idle suspension has not been timed directly.
- OAuth state is held in process memory. A restart during login can invalidate the in-progress flow; start a fresh login. The current free plan uses one instance.
- There are no AI-generation calls, screenshot uploads, collaborative sharing or automatic ratings. Screenshot evidence is an optional URL field.

Keep the deployment available until marking is complete and monitor free allowances without enabling paid overages. The application is an academic demonstration, not a promise of uninterrupted service or a production security certification.

© 2026 Ruixin Huang · La Trobe University Student ID: 23025563. Developed for the Cloud-Based Web Application assessment. Submitted work and any use of AI assistance remain the student's responsibility.
