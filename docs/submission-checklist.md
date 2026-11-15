# AI Capsule submission checklist

Student: Ruixin Huang, 23025563. Public application:
https://app-ai-capsule-23025563.azurewebsites.net

This checklist maps the implementation and evidence to the actual eight-page
`AI_Capsule_Assignment_3_Revised.pdf`, reviewed from the local Downloads folder.
The brief itself is not bundled in this repository. Requirements below come from
its revised text; this is not a guarantee of marks.

## Requirement and evidence map

| Brief section | Requirement | Implementation or evidence | Remaining action |
| --- | --- | --- | --- |
| 4 | React, Node/Express, relational storage | `client/`, `server/`, SQLite locally and Azure SQL in production | Include all source and setup files in ZIP |
| 5 | Public `/`, `/login`; protected `/dashboard` | `server/app.js`, `client/src/App.jsx` | Show deployed pages and login in MP4 |
| 5, 7 | Exact capsule CRUD routes and public health | `server/capsule-api.js`, `server/app.js`; live 200/401 checks passed | Demonstrate all four CRUD operations online |
| 6 | All capsule fields and server-managed metadata | `server/database.js`, `sql/001-capsules.sql`; field round-trip tests | Show meaningful form/detail fields in video |
| 6, 9 | Owner from verified provider identity/JWT | `server/session.js`, both storage adapters; owner-isolation HTTP/SQL tests | Explain the owner predicate; no owner input or JWT display |
| 8 | Public cloud frontend/API/database | Azure F1 and SQL at the URL above; deployed runtime/build hashes matched reviewed files | Show cloud runtime and setting names; keep app available through marking |
| 8 | Explain persistent or ephemeral storage | Real SQL record survived restart and redeployment; recorded in deployment notes | Explain SQL storage outside the app package |
| 9 | OAuth to Express-issued JWT; Secure/HttpOnly `token` | `server/github-auth.js`, `server/oauth-state.js`, `server/session.js`; automated auth tests and user-reported deployed browser checks | Record real GitHub login and successful deployed CRUD |
| 9, 13 | No-cookie and fake-token GET checks each return 401 | Both public requests passed during final review | Run both before login in the video |
| 10 | Complete source ZIP excluding generated dependencies/builds | Git tracks source, lockfiles, example config and database setup | Create ZIP after documentation review; inspect and test extraction |
| 10, 13 | 3–5 minute MP4 with working audio; upload directly to LMS | No MP4 supplied or verified yet | Record, inspect and upload the actual MP4 |
| 11 | README covers setup, routes, auth, config, storage, cURL and limitation | Root README includes each topic | Review README and add actual screenshots when supplied |
| 12 | AI tools, corrected problem, verification and explainable decision | README AI assistance section and deployment notes | Be ready to explain these accurately in your own words |
| 13 | Cloud settings without secrets; explain issue/limitation | Read-only commands below; README documents SQL startup recovery and limits | Film names/properties only; inspect video for leaks |

The user reported that deployed browser checks and the ten demonstration capsules
look correct using RLirri. This is user-reported evidence, not direct browser
observation by the agent. Automated HTTP and database checks are listed separately
in the README and deployment notes. A second-account browser ownership test has not
been independently recorded; do not imply it has.

## Video recording sequence

Record the deployed application, not localhost. Aim for roughly four minutes with
clear narration. Keep a fresh, clearly fictional recording record separate from
existing records; do not delete another record to simplify the demonstration.

1. **0:00–0:45: public cloud and protection.** Show the public HTTPS URL, overview and
   `/api/health` JSON. Before login, run both required cURL checks below and show
   each 401 status and JSON response.
2. **0:45–1:15: OAuth.** Continue with GitHub and enter the dashboard. Use the normal
   browser flow without showing an authorization code, session cookie or token.
   Briefly explain that Express issues its own JWT after GitHub identity lookup.
3. **1:15–2:50: complete CRUD.** Create a fictional capsule through the form, read its
   detail, edit it, refresh to confirm persistence, then delete that same record
   and refresh to show it is gone. Include a category, rating and independent review
   flags. Copy prompt or search/filter briefly only if time permits.
4. **2:50–3:40: cloud configuration and storage.** Show F1, Linux/Node 24 and relevant
   environment-variable names without values. Explain local SQLite versus production
   Azure SQL, restricted managed identity, free-limit AutoPause and recorded restart/
   redeployment persistence. Show the persistence behavior if you have safe recorded
   evidence; otherwise describe its recorded verification accurately.
5. **3:40–4:15: explanation and logout.** Briefly explain the SQL startup/firewall
   correction without asserting an unproven cause, disclose AI assistance, then sign
   out and show that the dashboard requires login again.

Use the README cURL commands, which remove platform cookie headers from output:

```bash
curl -i https://app-ai-capsule-23025563.azurewebsites.net/api/capsules \
  | sed '/^[Ss]et-[Cc]ookie:/d'

curl -i -H "Cookie: token=fake-token-123" \
  https://app-ai-capsule-23025563.azurewebsites.net/api/capsules \
  | sed '/^[Ss]et-[Cc]ookie:/d'
```

For cloud configuration evidence, these read-only queries show no setting values:

```bash
az appservice plan show -g rg-ai-capsule-student -n plan-ai-capsule-free \
  --query '{name:name,sku:sku.name,kind:kind,location:location}' -o json
az webapp config show -g rg-ai-capsule-student -n app-ai-capsule-23025563 \
  --query '{runtime:linuxFxVersion,startup:appCommandLine}' -o json
az webapp config appsettings list -g rg-ai-capsule-student \
  -n app-ai-capsule-23025563 --query '[].name' -o tsv
az sql db show -g rg-ai-capsule-student -s sql-ai-capsule-23025563 -n ai-capsule \
  --query '{name:name,useFreeLimit:useFreeLimit,freeLimitExhaustionBehavior:freeLimitExhaustionBehavior}' -o json
```

Never record an unfiltered App Settings response, `.env`, an OAuth callback with a
code, DevTools cookie values or real authorization headers. The fake token above is
intentional; no real JWT is needed. Close unrelated windows and notifications.
Watch the exported MP4 from start to finish, check audio, confirm 3–5 minutes, and
check the uploaded LMS copy. An external video link is not a substitute.

## Application screenshots

No application screenshot currently exists in this repository. Do not add Markdown
image links until the files are supplied and inspected. Browser tools failed before
tab interaction; no screenshot was captured or invented.

Capture these four actual deployed states and save under `docs/screenshots/`:

| Expected filename | Capture |
| --- | --- |
| `login.png` | Signed-out `/login`, GitHub action and brand visible; no callback query or secrets |
| `capsule-dashboard.png` | Dashboard with fictional Demo records, search and filter controls; exclude private records |
| `capsule-form.png` | New or edit form containing fictional text, category, rating and review controls |
| `capsule-details.png` | The fictional multiline record with readable prompt and Copy prompt control |

Use a dedicated application tab. In Chrome DevTools, open the command menu
(Ctrl/Cmd+Shift+P) and choose **Capture screenshot** for the page viewport, or
**Capture full size screenshot** if the form/detail needs it. Capture the application
page, not a desktop or unrelated browser window. Check the saved image before adding
it: no developer panels, private prompts, cookie values, Azure settings or other tabs.
Keep the actual displayed account identity; do not replace it for a screenshot.

The multiline demonstration capsule is suitable for detail/copying evidence. Search
for Demo if necessary, then inspect the visible records to ensure all are fictional.
Cancel an unsaved example form after capturing it. These will be deployed application
screenshots; they supplement the required MP4 and do not replace it.

## Source ZIP checklist

Include a single top-level `ai-capsule/` directory with:

- Root README, `.env.example`, `.nvmrc`, `.gitignore`, package files and lockfile.
- `client/` source, public assets, package/lock files and Vite/lint/test configuration.
- `server/` source and tests, `scripts/`, `sql/` migrations, and documentation.
- Actual sanitized screenshots after they have been reviewed and added.

Exclude:

- Real `.env` files, secrets, tokens, certificates/private keys and database credentials.
- `node_modules`, `client/node_modules`, `dist`/`client/dist`, coverage and logs.
- `data/`, all local SQLite/database files and any production database export.
- `.git`, editor metadata, Azure CLI caches, temporary diagnostic results and deployment
  ZIPs. Keep the final MP4 as its separate LMS upload.

After the documentation is approved, a clean tracked source archive can be prepared
from the reviewed commit without including ignored local files:

```bash
git status --short
git archive --format=zip --prefix=ai-capsule/ \
  --output=/tmp/ai-capsule-source.zip HEAD
unzip -l /tmp/ai-capsule-source.zip
```

Review tracked files first: Git tracking alone does not prove that a file is safe.
Extract the ZIP into a new temporary directory, follow the README, install both sets
of dependencies and run checks. Confirm database setup files are included and no
working database is needed. Do not delete or overwrite the development database.
Upload the ZIP itself directly to the LMS; RAR/7Z, document files or external source
links do not replace it. GitHub may remain private.

## Outstanding submission work

- [ ] Review and approve the separate documentation PR; leave it unmerged until review.
- [ ] Capture and inspect the four screenshots, then add real relative README image links.
- [ ] Record and review the 3–5 minute deployed MP4 with working audio and all required scenes.
- [ ] Create and inspect the source ZIP from the final reviewed source; test a fresh extraction.
- [ ] Upload both source ZIP and MP4 directly to the LMS and check both uploaded files.
- [ ] Confirm the deployment remains reachable and free allowances remain sufficient until marking ends.

No MP4, source ZIP or screenshots are claimed as completed by this checklist.
