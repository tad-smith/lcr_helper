# CLAUDE.md

Guidance for Claude Code working in this repository.

## Repository shape

Three sibling subsystems plus a shared documentation tree:

| Path | What it is | Runs where |
|------|-----------|-----------|
| `extension/` | Chrome extension (Manifest V3), vanilla JS, no build step. Injects an *Extract Callings* button on LCR and hosts the callings-table page + *Import into Calling Sheet* flow. | Chrome |
| `calling_sheet/` | Google Apps Script web app, managed with `clasp`. Exposes `doGet` / `doPost` endpoints consumed by the extension. | Apps Script runtime |
| `doc/` | All documentation + the **single** repo-wide `CHANGELOG.md`. | — |

There is no build, no tests, no CI, no package.json, no TypeScript.
Deployment of `calling_sheet/` is manual via `clasp`; deployment of the
extension is manual via *Load unpacked*.

## The CHANGELOG is load-bearing

`doc/CHANGELOG.md` is the **only** changelog in the repo. Every commit
appends or extends the most recent dated entry. No per-subsystem
changelogs may be created — if you find one, delete it and move its
content to `doc/CHANGELOG.md`. Each entry prefixes the subsystem
(`extension/`, `calling_sheet/`, `doc/`, or root) and stays terse.

## `extension/`

A Manifest V3 extension that runs in four JS contexts — understanding
the isolation between them is the key to the codebase:

1. **Page context** (`interceptor.js`) — injected via
   `web_accessible_resources` so it can monkey-patch `window.fetch`.
   When a request matches `api/orgs`, it clones the response and
   dispatches a `LCR_API_DATA_RECEIVED` CustomEvent. Content scripts
   cannot patch `window.fetch` because they live in an isolated world.
2. **Content script** (`content-script.js`, with `utils.js` +
   `common.js`) — matches
   `https://lcr.churchofjesuschrist.org/mlt/orgs*`. Listens for the
   CustomEvent, flattens the org tree, injects the *Extract Callings*
   button, fetches per-member emails, sends a message to the background
   worker to open the callings-table tab.
3. **Service worker** (`background.js`) — opens
   `callings-table.html?ward=…&callings=…` in a new tab.
4. **Generated table page** (`callings-table.html` +
   `generated-table-script.js` + `common.js` + the import scripts) —
   standalone extension-origin page. Manages filtering, saved filters,
   copy-to-clipboard, and the import flow.

### File roles (extension)

| File | Purpose |
|------|---------|
| `manifest.json` | MV3 manifest. Content script matches `mlt/orgs*`; `interceptor.js` is in `web_accessible_resources`; `host_permissions` include `script.google.com/*` and `script.googleusercontent.com/*` for the import. |
| `background.js` | Service worker — listens for `openCallingsTable`, opens the callings-table tab. |
| `interceptor.js` | Page-world fetch wrapper. |
| `content-script.js` | Button injection via `MutationObserver` on `#role-picker-container`; email fetching; ward-name scraping. |
| `common.js` | Shared between content script and callings-table page. `fixCallingName`, `fixOrganizationName`, `mergeCallings`. **Cannot depend on `chrome.*` or any specific DOM.** |
| `utils.js` | Style injection helpers. |
| `callings-table.html` | Scaffold for the generated page: header, filter controls, table, modal containers, toast container. |
| `callings-table.css` | Existing table styles. |
| `callings-sheet-import.css` | Styles for Import button, settings/review modals, and toast. |
| `generated-table-script.js` | Filter logic, saved-filter CRUD, copy-to-clipboard. Exposes `{callings, collapsedCallings, ward}` on `window.LCRHelper` for sibling scripts. |
| `callings-sheet-settings.js` | Settings modal — loads/saves `chrome.storage.local['callingSheetSettings']`; exposes `window.LCRHelperSettings`. |
| `callings-sheet-import.js` | Import flow — snapshot fetch, client-side diff, review modal, apply POST, toast. Mirrors the email-merge algorithm in `calling_sheet/EmailMerge.gs`. |
| `images/` | Extension icons + gear icon (the settings button uses the inline `⚙`; the SVG is a fallback). |

### Conventions and gotchas (extension)

- **`common.js` runs in two contexts.** Content script and the
  callings-table page. It must not touch `chrome.*` or DOM.
- **Calling identity.** A calling's id is
  `${organization}:${calling.replaceAll(' ', '-')}`. Used as the `<tr>`
  id, the merge map key in `mergeCallings`, saved-filter selection
  values, and the bridge between the sheet's Position column and LCR
  callings. Don't change the format — it would invalidate users'
  saved filters AND the `SYSTEM_FILTERS["Email Alias Filter"]` list AND
  every `_position_overrides` row in the sheet.
- **Normalization rules (`common.js`).** Several rewrites happen
  *before* the id is computed so duplicates can merge:
  - "Young Single Adult Leader" → "Young Single Adult Adviser"
  - "{Priests,Teachers,Deacons} Quorum Adviser" → "Aaronic Priesthood Advisors"
  - "{Priests,Teachers,Deacons} Quorum Specialist" + "Young Men Specialist" → "Aaronic Priesthood Specialist"
  - Aaronic Priesthood callings roll up to org "Aaronic Priesthood"
  - Young Women Class Adviser / Young Women Specialist roll up to org "Young Women"
  Add new rules here rather than at call sites.
- **Button injection is MutationObserver-driven.** LCR is a SPA; the
  role-picker element can appear/disappear.
- **`extractUnitName` is fragile.** It's a DOM-shape traversal rooted
  at the *Filter Results* input. If LCR's DOM changes, this returns
  `"Unknown Unit"` and the new tab title is empty. First place to look
  for that regression.
- **`SYSTEM_FILTERS` are re-synced from code on load.** Editing the
  array in `generated-table-script.js` propagates to users on their
  next load. User filters are never overwritten.
- **Known bug — `button.disabled = false` in
  `extractCallingsHandler`.** Looks like it should be `= true`. Leave
  unless explicitly fixing.
- **Import module must stay in sync with Apps Script.** The parsing +
  merge code in `callings-sheet-import.js` is the canonical
  implementation. `calling_sheet/EmailMerge.gs` mirrors it for the
  server-side sanity check. If you change one, change the other, and
  update `doc/email-merge-algorithm.md` with any semantic changes.
- **Settings never log / render.** Never add a code path that prints
  `sharedSecret` to console or into the DOM outside its password input.

## `calling_sheet/`

Apps Script V8 runtime, no external libraries. Each `.gs` file shares a
single global namespace — declaring the same function name in two files
is a loading error. Because of this, router handlers in `Code.gs` are
stubbed until the real impl is ready, and the stub is deleted when the
real file lands.

### File roles

| File | Purpose |
|------|---------|
| `appsscript.json` | V8 + web app config (`executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`). |
| `Code.gs` | `doGet` / `doPost` routing. `jsonResponse(obj)` + `parseJsonBody(e)` helpers. |
| `Auth.gs` | `verifySecret(provided)` reading `SHARED_SECRET` from Script Properties; length-aware constant-time compare. |
| `Config.gs` | `getConfig()` reads `_config` + `_position_overrides` with a 5-minute CacheService cache keyed on the spreadsheet's `getLastUpdated()`. |
| `Logging.gs` | `logEvent(level, message, data)` — writes to the auto-created `_log` tab and to `console.log`. |
| `Triggers.gs` | Container-event triggers. Currently hosts the sheet's `onOpen` toast about 24-hour forwarding propagation. |
| `Snapshot.gs` | `handleSnapshot(wardName)` — reads the ward tab, derives `lcr_id` per row (override or natural), returns JSON with `generated_at`. Owns the `FIRST_EMAIL_COLUMN` / `ORG_COLUMN` / `POS_COLUMN` constants. |
| `Apply.gs` | `handleApply(body)` — validates payload, runs the Drive `getLastUpdated` staleness check, runs `verifyInternalAliasesPreserved` per operation, clears + writes column D onward with a single `setValues()` per row, one `SpreadsheetApp.flush()` at the end. |
| `EmailMerge.gs` | `parseEmailCell`, `mergeEmails`, `verifyInternalAliasesPreserved` — the server-side mirror of the extension's merge logic. |

### Conventions and gotchas (calling_sheet)

- **HTTP status codes are always 200.** Apps Script's ContentService
  can't set 4xx/5xx. All errors are surfaced in the JSON body as
  `{ ok: false, error: "..." }`. Callers check the body.
- **`FIRST_EMAIL_COLUMN = 4` is the lower bound for writes.** Columns
  A, B, C are never touched by any code path. There is no
  column-clearing path that doesn't start at D.
- **Sanity check on internal aliases.** `Apply.gs` runs
  `verifyInternalAliasesPreserved` per operation and rejects that
  operation (`would_drop_internal_alias`) if any existing
  `@<internal_domain>` cell is absent from `new_emails`. This is a
  defense against a misbehaving extension; don't remove it.
- **Same-name-in-two-files is a load error.** When adding a file that
  owns a previously-stubbed function, delete the stub from `Code.gs`.
- **`.clasp.json` is gitignored.** Committed template:
  `.clasp.json.example`. The scriptId is per-environment.
- **`clasp push` is destructive on the remote side.** It uploads the
  local tree and deletes any remote files not present locally. When
  adopting a pre-existing Apps Script project, `clasp clone` it to a
  scratch dir first, diff, and bring every necessary file into this
  repo before the first push. See `doc/apps-script-deploy.md` →
  *Adopting a pre-existing script*.
- **Single changelog rule applies here too.** Don't add a
  `calling_sheet/CHANGELOG.md`.

## `doc/`

All documentation is plain Markdown with a relative-path link structure
and a `See also` footer on each file. The index is `doc/README.md`.
Entries are kept under ~400 lines.

- `doc/CHANGELOG.md` — **the** changelog.
- `doc/open-questions.md` — lazily created when ambiguities surface
  during implementation. May or may not exist at any given moment.

## Development workflow

- **To test the extension:** load unpacked from `extension/`, reload
  after edits.
- **To test the Apps Script:** `clasp push` from `calling_sheet/`, then
  either run functions in the editor or hit the web app URL with curl.
- **To ship a change:** commit and include a `doc/CHANGELOG.md` entry.
  Non-negotiable.

## Making cross-subsystem changes

The email-merge algorithm exists in three places:

1. `doc/email-merge-algorithm.md` — canonical description + worked
   examples.
2. `extension/callings-sheet-import.js` — client-side implementation
   (authoritative; the extension computes the list the server writes).
3. `calling_sheet/EmailMerge.gs` — server-side port for the sanity
   check.

Change them as a single commit. Start with the doc, then the extension,
then the server.

## Things that are NOT here

- No package manager, no `package.json`, no `node_modules`.
- No tests. (The EmailMerge worked examples in the doc are the closest
  thing.)
- No CI. No publishing pipeline.
- No license file.
- The shared secret and script id never belong in git.

## See also

- [`README.md`](./README.md) — top-level orientation.
- [`doc/README.md`](./doc/README.md) — doc index.
- [`doc/architecture.md`](./doc/architecture.md) — data flow.
