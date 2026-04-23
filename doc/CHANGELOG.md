# Changelog

The **single** changelog for the entire repository. Every commit adds or
extends an entry here — no per-subsystem changelogs live anywhere else.

Entries are grouped by date; newest first. Each bullet names the
subsystem touched (`extension/`, `calling_sheet/`, `doc/`, or root) and
describes the change in one line.

## 2026-04-22 — extension version 1.3.0.3

- `extension/utils.js`: restyle `.extract-callings-button` to match
  the quarterly-report button — solid `rgb(178, 0, 0)` background,
  white text, `rgb(153, 0, 0)` hover, plus a `:disabled` rule.
  Drops the prior teal outline + faint diagonal-gradient look.
  Visual consistency only; no behavioral change.
- `extension/manifest.json`: bump to `1.3.0.3`.

## 2026-04-22 — extension version 1.3.0.2

- `extension/manifest.json`: bump to `1.3.0.2` for the quarterly
  report extractor. Adds a second content-script entry matching
  `https://lcr.churchofjesuschrist.org/report/quarterly-report*`
  that loads `quarterly-report.js`. Independent from the
  `mlt/orgs*` calling-sheet pipeline — no shared modules.

## 2026-04-22 — quarterly report Salvation-and-Exaltation extractor

New self-contained feature for stake-tracker maintainers. On LCR's
Ward Quarterly Report page, a red "Copy Salvation and Exaltation
Metrics" button appears next to the page's Print button. Clicking
it extracts ten Work-of-Salvation metrics (sacrament attendance,
temple-recommend %, youth temple recommends, recent-convert temple
names / priesthood, EQ & RS ministering interviews, convert
baptisms, YSA missionaries, temple-name submissions) plus a bold
"{year} Q{quarter}" header, laid out as a single column so pasting
into the first data cell of a quarter column fills the right rows
— including intentionally blank rows for section headers and
spacers.

- `extension/quarterly-report.js` (new): MutationObserver-driven
  button injection; anchors after the page's Print button, falling
  back to the `<h1>` if Print hasn't rendered yet. Waits for
  `[role="grid"] tbody tr` before injecting so the button never
  appears ahead of the data. `QR_MAPPING` is the single source of
  truth for which LCR line number + column flows to which sheet
  row; edit it there if the sheet layout changes. Uses the modern
  `ClipboardItem` API so the header cell pastes bold into Sheets /
  Excel; falls back to `writeText` for the plain-text payload.
  "---" in LCR renders as "-" by default, or "0" for cells flagged
  `dashToZero` (the baptism count).
- No new permissions required — the existing `activeTab` /
  `scripting` surface + an additional `content_scripts` matcher
  are all this feature needs. Clipboard write uses the page's
  user-gesture context, so `clipboardWrite` is not necessary.

## 2026-04-22 — email_forwarding_sync: verify ward-tab headers

- `email_forwarding_sync/email_forwarding_sync.gs`: new
  `EXPECTED_WARD_HEADERS = ['Organization', 'Forwarding Email',
  'Position', 'Name']` (mirrors the `calling_sheet/Snapshot.gs`
  schema — both scripts share the spreadsheet). `extractGroups(sheet)`
  now verifies row 1 via a new `verifyWardTabHeaders` helper before
  iterating rows; on mismatch it calls `logAndEmailError` (so the
  failure lands in the ERRORS tab *and* emails the stake email
  admin) and then throws, aborting the sync. This prevents the
  script from silently adding the wrong people to the wrong groups
  if someone rearranges columns or deploys the script against a sheet
  that hasn't been migrated to the new Name-at-D layout.

## 2026-04-22 — extension version 1.2.3.0

- `extension/manifest.json`: bump to `1.2.3.0` for name-column sync.

## 2026-04-22 — sync the Name column (D) on import

The import flow now keeps column D (Name) in step with LCR. Single-
person callings populate D with the assigned person's name; merged
rows (e.g., Aaronic Priesthood Advisors) populate D with a
comma-joined list of all assignees; vacated callings clear D. Column
D is still never read by the app's logic — it's purely a
human-readable identifier — but users no longer have to maintain it
by hand.

- `extension/content-script.js`: new `formatPersonName()` helper
  converts LCR's `"LastName, First Middle"` into `"First LastName"`
  (middle names dropped) at the point LCR data enters the pipeline.
  Applied in `extractCallingsFromData` before anything downstream
  sees the name. Without this, the comma embedded in LCR-style
  names would collide with the `", "` separator used to join names
  for merged callings — a 3-person row would turn into 6 ambiguous
  tokens in the sheet's Name column. Splits on the first comma
  only, so `"Smith Jr., John"` → `"John Smith Jr."` (suffix stays
  with the surname); names without a comma pass through unchanged.
- `extension/common.js`: `mergeCallings` now accumulates person names
  into a lazily-initialized `_nameList` on merge and joins them with
  `", "` into `person` at finalize. Singletons keep their original
  `person` untouched (matching the email-sentinel preservation
  pattern). Names have already been normalized to `"First LastName"`
  form by `formatPersonName()` upstream, so the `", "` join is
  unambiguous.
- `extension/callings-sheet-import.js`: `computeDiff` now captures
  `beforeName` / `afterName` on every diff entry and treats a
  name-only change as an update (previously would have been
  classified as unchanged). Review-modal rows render a
  `Name: old → new` line only when the name actually changed, so
  unchanged-name rows stay visually compact. Apply operations now
  include an optional `new_name` field.
- `extension/callings-sheet-import.css`: styling for the new
  `.row-name` line (same removed/added colors as the email diff).
- `calling_sheet/Snapshot.gs`: each row now includes `name` (the
  current value of column D, trimmed). Previously unread.
- `calling_sheet/Apply.gs`: validates optional `new_name` on every
  operation (must be a string when present) and writes it to column D
  before clearing and rewriting the email columns. Absent `new_name`
  leaves column D untouched so older clients remain compatible.

## 2026-04-22 — extension version 1.2.2.0

- `extension/manifest.json`: bump to `1.2.2.0` for the ward-tab header
  verification surface.

## 2026-04-22 — ward-tab header verification

New defense-in-depth check on every snapshot and every apply: if row 1
of the ward tab doesn't match the expected schema
(`Organization | Forwarding Email | Position | Name`), the server
rejects the request outright with a new `header_mismatch` error and
the extension surfaces an actionable toast naming the expected layout.
This is what catches the "new server deployed against an old sheet"
(and vice versa) foot-gun that the column-shift refactor opened up.

- `calling_sheet/Snapshot.gs`: new `EXPECTED_WARD_HEADERS` constant and
  `verifyWardTabHeaders(headerRow)` helper. `handleSnapshot` calls it
  after reading the tab's data range and returns
  `{ok: false, error: 'header_mismatch', expected, got}` on mismatch.
  Comparison is case-insensitive and whitespace-tolerant.
- `calling_sheet/Apply.gs`: same `verifyWardTabHeaders` call before
  any write, guarded by the already-present staleness check. Writes
  only occur if both checks pass.
- `extension/callings-sheet-import.js`: new `formatServerError` helper
  that expands `header_mismatch` into an actionable message ("row 1
  should be: Organization | Forwarding Email | Position | Name"). Used
  by the snapshot, apply, and stale-snapshot re-fetch error paths. The
  review modal closes on header mismatch during apply (the error is
  not retryable in place — the sheet must be fixed first).

## 2026-04-22 — sheet format: reserved Name column at D

Behavior change. Sheet schema change.

Every per-ward tab now has a reserved `Name` column at D (a
human-readable identifier for the person). Personal emails shift one
column right, starting at column E. Neither `calling_sheet/` nor
`email_forwarding_sync/` reads or writes column D — both skip it —
but both now know it exists.

- `calling_sheet/Snapshot.gs`: new `NAME_COLUMN = 4` constant;
  `FIRST_EMAIL_COLUMN` moved from `4` to `5`. Snapshot reads of
  existing emails start at column E.
- `calling_sheet/Apply.gs`: comment and file-level JSDoc updated to
  note that column D is now also never written to. No code change —
  the clear/write math already derives from `FIRST_EMAIL_COLUMN`.
- `email_forwarding_sync/email_forwarding_sync.gs`: new `NAME_COL = 3`
  (0-indexed); `PERSONAL_EMAILS_COL` moved from `3` to `4`. Name
  column intentionally not read.
- `CLAUDE.md`, `doc/architecture.md`, `doc/sheet-setup.md`,
  `doc/import-flow.md`, `doc/email-merge-algorithm.md`: column
  references updated to match the new layout.

Migration: on every per-ward tab, insert a new column D with header
`Name`. Existing data in columns D onward shifts one column right;
Google Sheets does this cleanly via right-click → *Insert 1 column
left* while column D is selected. Coordinate the sheet edit with a
`clasp push` of `calling_sheet/` so the old server doesn't run
against the new sheet (which would treat Name as an email and drop
it) or the new server against the old sheet (which would skip the
last email column).

## 2026-04-21 — extension version 1.2.1.1

- `extension/manifest.json`: bump to `1.2.1.1` for the singleton
  email-sentinel preservation fix in `common.js`.

## 2026-04-21 — review fixes (bugs 1–10, 12–27)

Batch of correctness, security, and code-hygiene fixes identified by a
code review. Each entry names the file it touches.

- `extension/generated-table-script.js`: `handleCollapseCallings` now
  writes `settings.currentState.collapseCallings` and saves to storage —
  prior versions dropped the toggle on reload. `applySettingsToUI` also
  restores the `hide-vacant-callings` checkbox state, which was
  previously only half-wired (the setting was obeyed but the checkbox
  wasn't synced). Split `decodeUrlParameter` into `readUrlString` and
  `readUrlJson`. Replaced `alert`/`confirm` with toasts and a custom
  `confirmDialog` that renders into `#sheet-confirm-modal`. Rebuilt the
  person column without `innerHTML` to close a latent XSS vector.
  `updateCurrentFilter` now refreshes the dropdown and emits a success
  toast. Removed stray `console.log` calls; tightened JSDoc.
- `extension/content-script.js`: fixed a null-pointer crash in
  `extractUnitName` when walking past `<html>`. Set
  `button.disabled = true` during extraction (was `false`). Added a
  "data not ready" guard for the race where the button fires before the
  interceptor has captured an `api/orgs` response. Added a concurrency
  cap (`EMAIL_FETCH_CONCURRENCY = 8`) around member-card fetches.
- `extension/callings-table.html`: `<tbody />` self-close replaced with
  a proper closing tag — HTML5 does not allow self-closing for non-void
  elements, and the malformed tag was silently making the Count `<div>`
  a descendant of `<tbody>`. Added a `<script>` for `constants.js` and a
  `#sheet-confirm-modal` scaffold.
- `extension/background.js`: dropped the double `encodeURIComponent` on
  query-string params — `URLSearchParams.set` already percent-encodes.
  Renamed `openNewTabWithHTML` → `openCallingsTableTab` for honesty.
- `extension/common.js`: merged groups now accumulate real emails into
  a list and `join(',')` at the end, filtering `''`, `'N/A'`, and
  `'Error'` sentinels — eliminates leading-comma / `"N/A,foo@bar"`
  output in the rendered table and clipboard export. Singletons (ids
  that never merged) keep their original `.email` untouched so the
  `'N/A'` / `'Error'` diagnostic strings still surface in the table
  for assigned-but-unresolved callings. `.match()` checks converted
  to `.test()`.
- `extension/utils.js`: removed the IE `styleSheet.cssText` branch;
  `addExtensionStyles` is now guarded by a sentinel id so SPA remounts
  don't stack duplicate `<style>` nodes.
- `extension/callings-sheet-import.js`: snapshot is now POST with the
  secret in the body — the prior GET leaked it into Google's access
  logs and any Referer header. Introduced `fetchWithTimeout` (30 s)
  around both snapshot and apply so a hung Apps Script worker no longer
  leaves the UI stuck on "Loading…".
- `extension/constants.js`: new. Centralizes `LCR_API_DATA_EVENT`,
  `MSG_OPEN_CALLINGS_TABLE`, `SETTINGS_STORAGE_KEY`, etc. Loaded via
  manifest `content_scripts`, `importScripts` in the service worker,
  and a `<script>` tag in `callings-table.html`. Interceptor keeps its
  own local constant (page-world context can't see extension globals).
- `extension/interceptor.js`: named the event constant locally to
  document the sync-with-constants.js requirement; trimmed the chatter.
- `extension/callings-sheet-settings.js`: drops its local
  `SETTINGS_STORAGE_KEY` declaration — now sourced from
  `constants.js`.
- `extension/manifest.json`: `constants.js` added to content_scripts.
  Version → `1.2.1.0`.
- `calling_sheet/Code.gs`: `doPost` now routes `action=snapshot` too,
  reading ward from the body; `parseJsonBody` returns a discriminated
  result so the specific `invalid_json_body` error reaches the caller
  instead of collapsing to `internal_error`.
- `calling_sheet/Apply.gs`: staleness check now uses `>=` to catch
  exact-ms-match edits that the strict `>` would admit. A first pass at
  this change tried to floor the snapshot timestamp to whole seconds;
  that over-rejected legitimate applies whenever a pre-snapshot edit or
  an internal `_log` write landed in the same wall-clock second as the
  snapshot, and was reverted.
- `calling_sheet/Snapshot.gs`: added a comment documenting that emails
  on fully-blank-header rows are invisible to the diff.
- `calling_sheet/Sheet.gs`: comment clarifying that the cached
  spreadsheet reference is per-execution, not cross-request.

## 2026-04-21 — extension version 1.2.0.2

- `extension/manifest.json`: bump to `1.2.0.2` for the override row
  annotation change.

## 2026-04-21 — review modal: annotate override-applied rows

- `extension/callings-sheet-import.js`: when a diff entry's row was
  mapped via `_position_overrides` (snapshot's `override_applied:
  true`), the row title now renders as `{lcr_id} ({sheet position})`
  instead of just `{lcr_id}`. Applies in both the Updates/Vacating
  rows and the new Unchanged section.

## 2026-04-21 — extension version 1.2.0.1

- `extension/manifest.json`: bump to `1.2.0.1` for the Unchanged
  section addition.

## 2026-04-21 — review modal: add Unchanged section

- `extension/callings-sheet-import.js`: review modal now renders a
  fourth informational section, "Unchanged (N)", between *Vacating*
  and *Custom or Unmatched*. Collapsed by default; read-only;
  shows `calling.id` and the row's current email list per row.
- `doc/import-flow.md`: section table and ASCII rendering updated.

## 2026-04-21 — _position_overrides is global (drop ward_code column)

Behavior change. Sheet schema change.

- `_position_overrides` now has two columns: `sheet_position`,
  `lcr_id`. The `ward_code` column is dropped. `sheet_position` is the
  calling name **with the ward_code prefix stripped** (e.g.,
  `Young Women Advisors`, not `CO Young Women Advisors`). One mapping
  applies across every ward.
- `calling_sheet/Config.gs`: `config.overrides` is now a flat
  `{sheet_position: lcr_id}` dictionary; no per-ward sub-map.
- `calling_sheet/Snapshot.gs::deriveLcrId`: strip `<ward_code> ` first,
  then look the remainder up in the flat overrides map, then fall
  through to natural derivation.
- `doc/sheet-setup.md`, `doc/position-mapping.md`,
  `doc/architecture.md`: updated to match.

Migration: on the `_position_overrides` tab, delete the leftmost
column and strip the `<ward_code> ` prefix from each entry in what is
now column A.

## 2026-04-21 — add Debug.gs with debugConfig / debugSnapshot

- `calling_sheet/Debug.gs`: editor-run helpers for isolating code
  correctness from deployment staleness when an import fails.
  `debugConfig()` prints the ward names/codes visible to `getConfig()`;
  `debugSnapshot()` prints the snapshot JSON for Cordera Ward.

## 2026-04-21 — standalone deployment only; SHEET_ID script property

Simplified the deployment model to standalone-only. The Workspace that
owns the sheet blocks anonymous web app deploys, so the web app must
be owned by a consumer Gmail account that has edit access to the
sheet and is therefore not container-bound.

- `calling_sheet/Sheet.gs`: new. `getTargetSpreadsheet()` resolves the
  target sheet via the `SHEET_ID` script property. Throws with a clear
  message if unset. No fallback — container-bound mode is not
  supported.
- `calling_sheet/Config.gs`, `Snapshot.gs`, `Apply.gs`, `Logging.gs`:
  switch from `SpreadsheetApp.getActiveSpreadsheet()` to
  `getTargetSpreadsheet()`.
- `calling_sheet/Triggers.gs`: removed. The container-bound `onOpen`
  toast on the Workspace-owned sheet stays where it is; we don't
  manage it.
- `calling_sheet/.claspignore`: drop the now-unneeded `Triggers.gs`
  exclusion.
- `doc/apps-script-deploy.md`: rewritten end-to-end for standalone-
  only. Removed the dual-mode section and the *Adopting a pre-existing
  script* section. New troubleshooting row for `SHEET_ID` errors.
- `calling_sheet/README.md`: trimmed to match.
- `doc/sheet-setup.md`: mentions `SHEET_ID` script property as a
  required project-level setting.
- `CLAUDE.md`: `Triggers.gs` dropped from the file table; new
  `Sheet.gs` entry; standalone-only gotcha note.

## 2026-04-21 — extension version 1.2.0.0

- `extension/manifest.json`: bump `version` from `1.1.4.2` to
  `1.2.0.0` for the calling-sheet import feature release.

## 2026-04-21 — fix: gear icon size

- `extension/callings-sheet-import.css`: bump `.icon-button` font-size
  from 18 to 26 px; add `display: inline-flex` + centering so the glyph
  sits correctly in the button. The `⚙` glyph's bounding box is small
  relative to its font-size, so the original 18 px read as tiny.

## 2026-04-21 — fix: UTF-8 charset on the callings-table page

- `extension/callings-table.html`: add `<meta charset="utf-8">`. Without
  it, Chrome fell back to a legacy encoding for this extension-origin
  page, so the inline ⚙ gear in the settings button (plus 👁 and ⚠
  elsewhere in the modals) rendered as mojibake (`âš™` for the gear).

## 2026-04-21 — merge rule: internal aliases always trail personal emails

- Behavior change. Previously, internal-domain aliases were preserved
  in their original column; new LCR emails were appended at the end,
  which could leave an alias sandwiched between personal emails. New
  rule: after merging, all internal aliases appear at the tail of the
  cell list; personal emails keep their relative order.
- `extension/callings-sheet-import.js`: `mergeEmails` reshuffled to
  collect into two lists (`personal`, `internals`) and concatenate at
  the end. The server-side sanity check already only verified
  presence (not position), so no change was needed there.
- `calling_sheet/EmailMerge.gs`: same change, V8-compatible syntax.
- `doc/email-merge-algorithm.md`: pseudocode updated; *Properties*
  list rewritten; worked example 4 (interleaved) now shows the
  internal alias moving to the tail; new *one-time rearrangement*
  property warns that sheets with interleaved aliases will see a
  cell reorder on the first import after this change.
- `doc/sheet-setup.md`: short note pointing at the new rule.

## 2026-04-21 — preserve the sheet's existing onOpen trigger

- `calling_sheet/Triggers.gs`: new file holding the pre-existing
  `onOpen` toast ("Any email forwarding changes made in this
  spreadsheet will become active within 24 hours."). Added to the repo
  so `clasp push` doesn't delete it on the remote side.
- `calling_sheet/README.md`: new *Adopting an existing Apps Script
  project* section covering the backup-first workflow.
- `doc/apps-script-deploy.md`: new *Adopting a pre-existing script*
  section at the top; two new troubleshooting rows for "function
  disappeared" and "timezone changed".
- `CLAUDE.md`: `calling_sheet/` file table now lists `Triggers.gs`; new
  gotcha about `clasp push` being destructive on the remote side.

## 2026-04-21 — docs pass + CLAUDE.md refresh

- `doc/position-mapping.md`: new. The natural derivation rule, override
  behavior, when to use an override vs. leave a row custom, debugging a
  mismatch.
- `doc/extension-config.md`: new. `chrome.storage.local` key layout,
  first-time setup, URL validation, secret rotation, clearing settings,
  troubleshooting table.
- `CLAUDE.md`: rewritten to span all three subsystems. Adds a
  repository-shape summary, the CHANGELOG-is-load-bearing rule, a
  `calling_sheet/` section with gotchas (200-status-only, FIRST_EMAIL_
  COLUMN=4, same-name-in-two-files-is-a-load-error, clasp.json is
  gitignored), a `doc/` workflow section, and the cross-subsystem
  three-places-to-edit list for the email-merge algorithm.
- `doc/README.md`: all linked docs now exist.

## 2026-04-21 — user-facing import flow doc

- `doc/import-flow.md`: prerequisites checklist, first-time setup,
  running an import, reading the review modal (sections, row styling,
  checkboxes), applying, and common situations (stale snapshot,
  retryable errors, custom/unmatched rows, missing-in-sheet rows).
  Includes a text rendering of the modal and screenshot slot markers.
- Real end-to-end verification against a live deployment remains the
  user's responsibility — captured as a prerequisite, not executed
  here.

## 2026-04-21 — extension: review modal + apply

- `extension/callings-sheet-import.js`: full review modal — four
  collapsible sections (Updates, Vacating, Custom-or-Unmatched, In LCR
  but not in sheet). Updates and Vacating have per-row checkboxes
  (checked by default); informational sections are read-only. Rows
  show before/after with strikethrough on removed items and highlight
  on added items; annotation-lost warnings render with a leading ⚠ and
  an inline note. Banner at the top if any `annotation_lost` warning
  would fire. Apply button label syncs with checkbox count.
- Apply flow: POST `?action=apply` with `Content-Type: text/plain`
  (avoids CORS preflight). Handles `stale_snapshot` by re-fetching the
  snapshot, recomputing the diff, and re-opening the modal. Other
  errors shown as a toast with a Retry button. Result toast shows
  applied / skipped / errors counts.
- `showToast` / `hideToast` helpers using the `#sheet-toast` container
  added in step 5.

## 2026-04-21 — extension: snapshot fetch + diff (no review UI)

- `extension/callings-sheet-import.js`: port of `parseEmailCell`,
  `mergeEmails`, and `splitEmails`; new `computeDiff(snapshot, collapsed)`
  categorizing rows as UPDATE / VACATE / UNCHANGED / CUSTOM_OR_UNMATCHED
  / MISSING_IN_SHEET; `fetchSnapshot(url, secret, ward)` GET + JSON
  parse. Click handler logs the snapshot and diff to console and shows
  a brief alert with counts (the review modal replaces the alert in the
  next commit).
- `extension/generated-table-script.js`: expose `{callings,
  collapsedCallings, ward}` on `window.LCRHelper` so sibling scripts can
  read them (top-level `const` doesn't auto-attach to `window`).

## 2026-04-21 — extension: settings modal

- `extension/manifest.json`: add `host_permissions` for
  `script.google.com` and `script.googleusercontent.com` so the import
  flow can reach the Apps Script web app.
- `extension/callings-table.html`: add *Import into Calling Sheet*
  action button + gear icon button; hidden modal + toast containers;
  `<link>` to new CSS and `<script>` tags for settings and import.
- `extension/callings-sheet-settings.js`: load/save to
  `chrome.storage.local['callingSheetSettings']`, render settings modal
  with password-toggle secret field and URL validation, expose
  `window.LCRHelperSettings`.
- `extension/callings-sheet-import.css`: modal, form, review, toast, and
  icon-button styles used by the import flow.
- `extension/callings-sheet-import.js`: stub handler — opens settings
  modal on first-use with "Configure before first use" banner. Full
  import flow lands in subsequent commits.
- `extension/images/gear_icon.svg`: fallback gear glyph (button still
  uses the inline `⚙` unicode).

## 2026-04-21 — apply endpoint + EmailMerge sanity check

- `calling_sheet/EmailMerge.gs`: server-side port of `parseEmailCell`,
  `mergeEmails`, and `verifyInternalAliasesPreserved`. The sanity check
  refuses operations that would drop an internal-domain alias.
- `calling_sheet/Apply.gs`: `handleApply(body)` — validates payload,
  checks snapshot freshness via `DriveApp.getFileById(...).getLastUpdated()`,
  per operation runs the sanity check then clears+writes column D onward
  with a single `setValues()`, calls `SpreadsheetApp.flush()` at the end.
- `calling_sheet/Code.gs`: drop apply stub; Apply.gs owns the symbol.

## 2026-04-21 — snapshot endpoint

- `calling_sheet/Snapshot.gs`: implements `handleSnapshot(wardName)`.
  Reads the ward tab, collects non-empty cells from column D onward as
  `emails`, derives `lcr_id` via override or natural `<Org>:<Position-
  with-dashes>` rule, returns JSON with `generated_at` timestamp. Errors
  for missing ward / missing tab per spec.
- `calling_sheet/Code.gs`: removed snapshot stub; Snapshot.gs owns the
  implementation.
- Note: `is_custom` is deliberately not on the server response — the
  extension classifies rows as custom when their `lcr_id` doesn't appear
  in its merged callings map.

## 2026-04-21 — scaffold for calling-sheet import feature

- root: new `README.md` orienting the reader across the three subsystems
  (`extension/`, `calling_sheet/`, `doc/`).
- `doc/`: initial documentation set — `README.md` index,
  `architecture.md`, `sheet-setup.md`, `email-merge-algorithm.md`, and
  this changelog.
- `calling_sheet/`: initial Apps Script skeleton — `appsscript.json` (V8
  + web app config), `Code.gs` with `doGet`/`doPost` routing (snapshot
  and apply handlers stubbed), `Auth.gs` with length-aware constant-time
  shared-secret compare, `Config.gs` reading `_config` and
  `_position_overrides` with 5-minute CacheService-backed cache keyed on
  spreadsheet last-modified time, `Logging.gs` writing to the auto-
  created `_log` tab plus Stackdriver, and `README.md` covering deploy.
  `.clasp.json.example` committed; `.clasp.json` gitignored.
- `doc/apps-script-deploy.md`: full clasp deploy walkthrough,
  update-in-place guidance, and troubleshooting table.
- `.gitignore`: ignore `calling_sheet/.clasp.json`.
- Spec: prompt v1 (import-into-calling-sheet feature).
