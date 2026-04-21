# Changelog

The **single** changelog for the entire repository. Every commit adds or
extends an entry here — no per-subsystem changelogs live anywhere else.

Entries are grouped by date; newest first. Each bullet names the
subsystem touched (`extension/`, `calling_sheet/`, `doc/`, or root) and
describes the change in one line.

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
