# Architecture

End-to-end data flow across the Chrome extension, the Apps Script web app,
and the Google Sheet that backs the "Email Forwarding Addresses" workflow.
Read this first; subsystem docs assume the vocabulary defined here.

## Subsystems

```
┌─────────────────────────┐        GET snapshot         ┌──────────────────────┐
│ Chrome extension        │ ──────────────────────────▶ │ Apps Script web app  │
│ (extension/)            │ ◀────────────────────────── │ (calling_sheet/)     │
│                         │        snapshot JSON        │                      │
│  1. Scrape LCR          │                             │  - Reads _config     │
│  2. Fetch snapshot      │        POST apply           │  - Reads _position_  │
│  3. Diff client-side    │ ──────────────────────────▶ │    overrides         │
│  4. Review modal        │ ◀────────────────────────── │  - Reads ward tab    │
│  5. Apply changes       │        apply result         │  - Validates merge   │
└─────────────────────────┘                             └──────────────────────┘
                                                                   │
                                                                   ▼
                                                          ┌──────────────────────┐
                                                          │ "Email Forwarding    │
                                                          │  Addresses" Sheet    │
                                                          └──────────────────────┘
```

## Responsibilities

| Concern | Owner | Notes |
|---------|-------|-------|
| Which callings exist on LCR | LCR | Scraped by the extension's existing interceptor. |
| Which callings are *tracked* in the sheet | Sheet | One row per tracked calling in each ward tab. Adding a row = starting to track; deleting a row = stopping. |
| Who holds each calling | LCR (authoritative) | The import overwrites personal emails in tracked rows. |
| Non-personal metadata (organization name, forwarding alias, position label) | Sheet | Columns A–C are **never** touched by the import. |
| Internal forwarding aliases (`@<internal_domain>`) inside email columns | Sheet | Preserved verbatim by the merge algorithm. |
| Custom rows without an LCR equivalent | Sheet | Detected by the extension as `CUSTOM_OR_UNMATCHED` and left alone. |
| Diff classification + apply selection | Extension | The server applies whatever list the user approved. |
| Merge arithmetic | **Both** | Canonical algorithm in the extension; the server re-runs the same logic in `Apply.gs` as a sanity check so a misbehaving extension can't nuke internal aliases. |

## Vocabulary

- **Ward tab** — a tab named exactly by its two-letter `ward_code`
  (e.g. `CO`). Rows 2+ are tracked callings. Columns A–C are user-maintained;
  D onward hold emails, one per cell, growing rightward.
- **`_config` tab** — maps `ward_code ↔ ward_name ↔ internal_domain`. The
  ward name is what LCR's UI displays and what
  `extension/content-script.js::extractUnitName` returns.
- **`_position_overrides` tab** — explicit `sheet_position → lcr_id`
  mappings (un-prefixed position, global across all wards) for rows
  where the natural derivation doesn't fit.
- **`lcr_id`** — string of the form `Organization:Calling-With-Dashes`, as
  produced by `extension/common.js::mergeCallings`. Example:
  `Bishopric:Ward-Executive-Secretary`. Both the extension and the server
  use this id as the bridge between sheet rows and LCR callings.
- **Snapshot** — point-in-time JSON image of a ward tab plus its config.
  Includes `generated_at` for staleness checking on apply.
- **Operation** — one `{row_index, new_emails}` entry posted during apply.
  The extension sends one operation per row the user checked.

## Data flow

1. **Scrape.** User opens LCR → `interceptor.js` captures the `api/orgs`
   response → `content-script.js` flattens it and (on click) fetches
   per-member emails. No change from the pre-import design.
2. **Open callings table.** Background service worker opens
   `callings-table.html?ward=…&callings=…` in a new tab.
3. **Import (new).** User clicks *Import into Calling Sheet* on that table.
   The extension:
   a. Reads web-app URL + shared secret from `chrome.storage.local`. If
      missing, opens the settings modal and aborts.
   b. `GET /exec?action=snapshot&ward=<ward_name>&secret=<secret>` →
      snapshot JSON.
   c. Builds a diff by joining `snapshot.rows[].lcr_id` against the
      already-merged `collapsedCallings` from the page. Runs the merge
      algorithm per row to compute the target email list. Categorizes each
      row as `UPDATE`, `VACATE`, `UNCHANGED`, or `CUSTOM_OR_UNMATCHED`.
      Rows in LCR with no sheet presence become `MISSING_IN_SHEET`
      (informational).
   d. Shows a review modal. User unchecks any rows they want to skip.
   e. `POST /exec?action=apply` with
      `{secret, ward_name, operations, generated_at}`. Content type is
      `text/plain` to avoid a CORS preflight.
   f. Apps Script verifies the secret, confirms the snapshot isn't stale
      (`getLastUpdated()` on the sheet file), re-runs the merge as a sanity
      check (refuses operations that would drop an internal alias), and
      writes `new_emails` to column D onward on each row with one
      `setValues()` call. Returns a summary.
   g. Extension shows a toast with applied/skipped/error counts and closes
      the modal.

## Invariants

- **Columns A–C are immutable from this system.** Code uses
  `FIRST_EMAIL_COLUMN = 4` as the lower bound for any write.
- **Sheet row count is immutable from this system.** The extension never
  inserts or deletes rows; adding a tracked calling is a manual sheet edit.
- **Internal-domain addresses (`@<internal_domain>`) in any email column
  survive every import** as long as the sheet has them before the import
  starts. Both the extension's merge and the server-side re-check enforce
  this.
- **`CUSTOM_OR_UNMATCHED` rows are never modified.** They appear in the
  review modal as informational only.
- **Shared secret never leaves `chrome.storage.local` and the Apps Script
  properties store.** Not logged, not rendered into the DOM.

## Failure modes

| Failure | Detected by | Response |
|---------|-------------|----------|
| Extension missing settings | Extension | Open settings modal with "Configure before first use" banner. |
| Bad secret | Server | `401 {ok:false, error:"unauthorized"}`. Extension shows toast. |
| Ward not in `_config` | Server | `404 {ok:false, error:"ward_not_configured", ward_name}`. |
| Ward tab missing | Server | `404 {ok:false, error:"ward_tab_missing", ward_code}`. |
| Stale snapshot on apply | Server | `409 {ok:false, error:"stale_snapshot"}`. Extension re-fetches snapshot and re-renders. |
| Internal alias would be dropped | Server (sanity check) | Operation rejected with error; other operations still apply. |
| Network failure | Extension | Toast with error and retry button. |

## See also

- [`sheet-setup.md`](./sheet-setup.md) — concrete schema for the sheet tabs.
- [`email-merge-algorithm.md`](./email-merge-algorithm.md) — the merge rules.
- [`position-mapping.md`](./position-mapping.md) — how sheet positions map to
  LCR calling IDs.
- [`apps-script-deploy.md`](./apps-script-deploy.md) — deploying the web app.
- [`extension-config.md`](./extension-config.md) — wiring the extension.
