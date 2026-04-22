# Sheet setup

How to create and maintain the "Email Forwarding Addresses" Google Sheet so
the LCR Helper import flow works. Do this once, as a sheet owner, before
deploying the Apps Script web app.

## Overview

The sheet has three *kinds* of tab:

1. **`_config`** — one row per ward.
2. **`_position_overrides`** — one row per sheet position that doesn't map
   cleanly to an LCR calling id.
3. **Per-ward tabs** — one tab per ward, named exactly by `ward_code`.

Tabs starting with `_` are treated as configuration and are never written to
by the import flow.

A `SHEET_ID` **script property** is required in the Apps Script project
(not a sheet tab). See
[`apps-script-deploy.md`](./apps-script-deploy.md).

## `_config` tab

Row 1 is the header. Columns:

| Column | Field | Description |
|--------|-------|-------------|
| A | `ward_code` | Two-letter prefix used as the tab name for this ward AND as the prefix on every `Position` value in that tab (e.g., `CO Bishop`). Must be unique. |
| B | `ward_name` | Exactly what LCR displays, e.g., `Colorado Springs North Ward`. The extension passes this from `extractUnitName()`. Must be unique. |
| C | `internal_domain` | Bare domain for forwarding aliases to preserve during import, e.g., `csnorth.org`. No `@` prefix. |

Example:

| ward_code | ward_name                     | internal_domain |
|-----------|-------------------------------|-----------------|
| CO        | Colorado Springs North Ward   | csnorth.org     |
| HI        | Hawaii Sample Ward            | hisample.org    |

Notes:

- Rows may be blank — blanks are skipped.
- Leading/trailing whitespace in any column is trimmed.
- **Changes take effect within five minutes** (the Apps Script config cache
  TTL) or immediately after the sheet is edited (the cache is keyed by the
  sheet's last-modified time).

## `_position_overrides` tab

Row 1 is the header. Two columns:

| Column | Field | Description |
|--------|-------|-------------|
| A | `sheet_position` | The Position cell value **with the `<ward_code> ` prefix stripped** — e.g., `Young Women Advisors`, not `CO Young Women Advisors`. |
| B | `lcr_id` | The calling id the override points to. Form: `Organization:Calling-With-Dashes`. |

One mapping applies to every ward. The server strips the active ward's
`ward_code ` prefix from the row's Position value and looks the
remainder up in this flat table.

Use an override any time the `Position` string on the sheet does not
correspond to the natural derivation rule (see
[`position-mapping.md`](./position-mapping.md)). Examples:

| sheet_position                             | lcr_id                                            |
|--------------------------------------------|---------------------------------------------------|
| Young Women Advisors                       | Young Women:Young-Women-Class-Adviser             |
| Aaronic Priesthood Specialists             | Aaronic Priesthood:Aaronic-Priesthood-Specialist  |
| Email Communication Specialist / Bulletin  | Technology:Email-Communication-Specialist         |

There is no override for a "custom" row (one with no LCR counterpart).
Leave those rows without an override; the extension will classify them as
`CUSTOM_OR_UNMATCHED` and leave them alone.

## Per-ward tabs

Named exactly after `ward_code` (e.g., `CO`). Row 1 is the header:

| Column | Header            | Written by user | Written by import |
|--------|-------------------|-----------------|-------------------|
| A      | Organization      | ✅               | ❌                 |
| B      | Forwarding Email  | ✅               | ❌                 |
| C      | Position          | ✅               | ❌                 |
| D      | (personal email)  | ✅ (initially)   | ✅                 |
| E      | (personal email)  | ✅ (initially)   | ✅                 |
| F…     | (personal email)  | ✅ (initially)   | ✅                 |

Rules for columns D onward:

- Cells hold email addresses, one per cell, growing rightward.
- Addresses ending in `@<internal_domain>` (for this ward) are **internal
  forwarding aliases** and are preserved verbatim by the import. After
  every import, all internal aliases trail all personal emails on the
  row (see
  [`email-merge-algorithm.md`](./email-merge-algorithm.md)'s
  *Properties* list).
- All other addresses are treated as personal emails. The import replaces
  them with whatever LCR currently reports for that calling.
- A cell may include a manual annotation of the form
  `user@example.com [GoogleAccount: user.gmail@gmail.com]`. The annotation
  is preserved when the canonical email still matches LCR. If LCR stops
  reporting that email, the cell is dropped and a warning is surfaced in the
  review modal. See [`email-merge-algorithm.md`](./email-merge-algorithm.md)
  for the precise rules.

Adding a new tracked calling: add a new row by hand, set columns A–C, and
run an import. The next import will populate column D onward.

Removing a tracked calling: delete the row by hand. The extension never
deletes rows.

## First-time checklist

1. Create (or designate) the spreadsheet.
2. Create the `_config` tab with the header + one row per ward.
3. Create the `_position_overrides` tab with the header (body may start
   empty; add overrides as you discover them).
4. Create one tab per `ward_code` with the four-column header in row 1.
5. For each ward tab, add rows for the callings you want to track. Column A
   is Organization, B is Forwarding Email, C is `<ward_code> Calling Name`.
6. Deploy the Apps Script web app as described in
   [`apps-script-deploy.md`](./apps-script-deploy.md).
7. Configure the extension per [`extension-config.md`](./extension-config.md).
8. Run a first import against a **copy** of the sheet until the diff looks
   right, then point the extension at the real sheet.

## Maintenance

- Adding a new ward: add a row to `_config`, create a tab with that
  `ward_code`, add the four-column header, start adding tracked callings.
- Renaming a ward in LCR: update `ward_name` in `_config` to the new value
  exactly. The `ward_code` and the tab name do not change.
- Changing an internal domain: update `internal_domain` in `_config`.
  Existing cells still ending in the old domain will be treated as personal
  emails on the next import and may be dropped — audit the ward tab first.

## See also

- [`architecture.md`](./architecture.md) — where this fits.
- [`position-mapping.md`](./position-mapping.md) — the natural match rule
  and overrides.
- [`email-merge-algorithm.md`](./email-merge-algorithm.md) — exactly what
  the import does to column D onward.
