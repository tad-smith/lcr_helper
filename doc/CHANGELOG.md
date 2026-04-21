# Changelog

The **single** changelog for the entire repository. Every commit adds or
extends an entry here — no per-subsystem changelogs live anywhere else.

Entries are grouped by date; newest first. Each bullet names the
subsystem touched (`extension/`, `calling_sheet/`, `doc/`, or root) and
describes the change in one line.

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
