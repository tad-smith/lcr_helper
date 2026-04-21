# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this project is

A Chrome extension (Manifest V3) that augments LCR (Leader and Clerk
Resources) for The Church of Jesus Christ of Latter-day Saints. It adds an
"Extract Callings" button to the LCR Callings by Organization page that opens
a filterable, exportable table of all callings + member emails for the current
ward.

There is no build step. The extension is loaded unpacked in Chrome directly
from the `extension/` directory. There are no tests.

## Architecture

All source lives in `extension/`. The extension runs in four separate JS
contexts — understanding the boundaries between them is the key to this
codebase:

1. **Page context** (`interceptor.js`) — injected via
   `web_accessible_resources` so it can monkey-patch `window.fetch`. Whenever
   a request matches `api/orgs`, it clones the response and dispatches a
   `LCR_API_DATA_RECEIVED` CustomEvent on `window`. This is the ONLY way to
   get at LCR's org data without re-requesting it; content scripts cannot
   patch `window.fetch` because they run in an isolated world.

2. **Content script** (`content-script.js`, with `utils.js` + `common.js`) —
   matches `https://lcr.churchofjesuschrist.org/mlt/orgs*`. Listens for the
   `LCR_API_DATA_RECEIVED` event, flattens the org tree into a list of
   calling objects, injects the *Extract Callings* button next to
   `#role-picker-container`, and — on click — fetches per-member emails from
   `https://lcr.churchofjesuschrist.org/mlt/api/member-card?uuid=...`, then
   sends `{action: 'openCallingsTable', callings, ward}` to the service
   worker.

3. **Service worker** (`background.js`) — receives the `openCallingsTable`
   message, JSON-encodes the callings into a URL query param, and opens
   `callings-table.html` in a new tab immediately after the current tab.

4. **Generated table page** (`callings-table.html` +
   `generated-table-script.js`, with `common.js`) — a standalone
   extension-origin page. Reads callings from its own URL parameters,
   renders the table, and manages filtering, saved filters, and
   copy-to-clipboard. Persists user state to `chrome.storage.local` under
   the `settings` key.

### Data flow (happy path)

```
LCR page fetch(api/orgs)
    ↓ (interceptor.js clones response)
CustomEvent 'LCR_API_DATA_RECEIVED'
    ↓ (content-script.js listens)
extractCallingsFromData()  →  unitOrgDataCallings
    ↓ (user clicks Extract Callings button)
fetchMemberEmails()  →  per-UUID fetch to api/member-card
    ↓
chrome.runtime.sendMessage({action: 'openCallingsTable', ...})
    ↓ (background.js)
chrome.tabs.create(callings-table.html?ward=...&callings=...)
    ↓ (generated-table-script.js)
decodeUrlParameter() → mergeCallings() → appendCallingsTable()
```

## File roles

| File | Runs in | Purpose |
|------|---------|---------|
| `manifest.json` | — | Manifest V3 config. Content script matches are narrow (`mlt/orgs*`). `interceptor.js` is exposed as a `web_accessible_resources` entry. |
| `background.js` | Service worker | Listens for `openCallingsTable`; opens the generated table in a new tab next to the current one. |
| `interceptor.js` | Page world | Wraps `window.fetch` to capture `api/orgs` responses. Dispatches `LCR_API_DATA_RECEIVED`. |
| `content-script.js` | Isolated content world | Button injection (via `MutationObserver` on `#role-picker-container`), email fetching, unit-name scraping, message send to background. |
| `common.js` | Content script + table page | `fixCallingName`, `fixOrganizationName`, `mergeCallings`. See **Normalization rules** below. |
| `utils.js` | Content script | `addInlineStyles` / `addExtensionStyles` — injects CSS for the *Extract Callings* button styled to match LCR's native look. |
| `callings-table.html` | Extension-origin page | Table scaffold, header, filter controls. |
| `callings-table.css` | Extension-origin page | Table-page styles. |
| `generated-table-script.js` | Extension-origin page | Table rendering, filter logic, saved-filter CRUD, `chrome.storage.local` persistence, TSV clipboard copy. |

## Conventions and gotchas

- **Two contexts run `common.js`** — the content script and the generated
  table page. Anything added there must make sense in both. It must not
  depend on `chrome.*` APIs, the DOM of a specific page, or anything beyond
  plain data transformation.
- **Calling identity.** A calling's `id` is
  `${organization}:${calling.replaceAll(' ', '-')}`. This ID is used as the
  `<tr>` id, as the key in `mergeCallings`'s `Map`, and in saved
  `selectedCallings` filter arrays. If you change how IDs are formed you
  will invalidate users' saved filters AND the hardcoded
  `SYSTEM_FILTERS["Email Alias Filter"].selectedCallings` list in
  `generated-table-script.js`.
- **Normalization rules (`common.js`).** Certain calling/organization
  names are rewritten before the ID is computed so that duplicates can
  merge:
  - "Young Single Adult Leader" → "Young Single Adult Adviser"
  - "{Priests,Teachers,Deacons} Quorum Adviser" → "Aaronic Priesthood Advisors"
  - "{Priests,Teachers,Deacons} Quorum Specialist" + "Young Men Specialist" → "Aaronic Priesthood Specialist"
  - Aaronic Priesthood callings roll up to org "Aaronic Priesthood"
  - Young Women Class Adviser / Young Women Specialist roll up to org "Young Women"
  These rules define the "collapsed" view. Add new rules here rather than
  at the call sites.
- **Merging callings.** `mergeCallings` keeps the first non-vacant person
  seen; if all are vacant it keeps the first. Additional people cause the
  row to be marked `multiplePeople: true` with a `numberOfPeople` count and
  emails concatenated with commas — the table then shows "Multiple
  Individuals Called (N)" instead of a single person link.
- **Button injection is MutationObserver-driven.** LCR is a SPA; the
  role-picker element can appear/disappear. The observer in
  `content-script.js` re-adds the button whenever it sees
  `#role-picker-container` reappear without `#extract-callings-button-id`.
- **Unit name extraction** (`extractUnitName` in `content-script.js`) is a
  DOM-shape traversal rooted at the *Filter Results* input. It is fragile
  by nature — if LCR's DOM changes, this returns `"Unknown Unit"` and the
  new tab title / H1 will be empty. If you see that regression, this is
  the first place to look.
- **SYSTEM_FILTERS are re-synced from code on load.** If the loaded
  filter's name matches a system filter, its selections/flags are
  overwritten from the hardcoded definition in
  `generated-table-script.js`. This is intentional — editing the code
  array updates users' state on next load. User filters are never
  overwritten this way.
- **`button.disabled = false` in `extractCallingsHandler`** — note that the
  "disable while loading" line in `content-script.js` actually sets
  `disabled = false`. This appears to be a bug (should be `true`), but the
  loading text still updates. Leave it unless explicitly fixing.
- **Emails are fetched serially per UUID but deduped.** `fetchMemberEmails`
  uses a `Map<uuid, Promise<email>>` so each UUID is fetched at most once;
  all fetches run concurrently. Do not batch/throttle without a reason —
  LCR tolerates this fine for a single ward.

## Making changes

- **No build, no bundler, no TypeScript.** Plain scripts loaded via
  `<script>` or `content_scripts`. Keep it that way unless there's a strong
  reason.
- **To test a change,** open `chrome://extensions`, click the reload icon
  on *LCR Helper*, then reload the LCR tab. For the generated table page,
  just reload that tab.
- **When the LCR DOM or API changes,** the fragile integration points are:
  - The URL match pattern in `manifest.json` (`mlt/orgs*`).
  - The fetch URL substring match in `interceptor.js` (`api/orgs`).
  - The member-card URL in `content-script.js::getEmail`.
  - `extractUnitName`'s DOM walk.
  - The anchor element id `role-picker-container` used for button
    placement.
- **Don't widen `host_permissions` or content script matches** casually —
  users install this expecting the extension only runs on the LCR orgs
  page.

## Things NOT in this repo

- No package manager, no `package.json`, no `node_modules`.
- No tests.
- No CI.
- No license file.
- No store listing / publishing pipeline — distribution is manual
  "Load unpacked".
