# email_forwarding_sync — Google Groups sync

Google Apps Script that runs daily, reads the same calling spreadsheet
the Chrome extension writes to (`calling_sheet/`), and mirrors every
per-ward tab's forwarding addresses into Google Groups in a Workspace
domain. The result: each "Forwarding Email" cell (column B) is a live
distribution list whose members are the personal emails in columns E+
of that row.

This subsystem is decoupled from the extension — the extension writes
personal emails into the sheet, and this script periodically mirrors
those into Google Groups. No direct communication between them.

## File layout

```
email_forwarding_sync/
├── email_forwarding_sync.gs   Single-file script (all logic, globals, helpers)
└── README.md                  this file
```

There's no `clasp` setup here; the script is maintained by pasting the
current contents of `email_forwarding_sync.gs` into the Apps Script
editor. Adding `clasp` is straightforward if that changes — see the
`calling_sheet/` pattern.

## How it runs

Two daily time-based triggers:

| Time (local) | Function | What it does |
|--------------|----------|--------------|
| 04:00 | `public_createGroups` | Creates any Group that's in the sheet but not yet in the domain. Does NOT add members — per Google's docs, a newly-created Group needs a few minutes before member inserts will stick. |
| 05:00 | `public_syncGroups` | For every Group in the sheet: updates its name + description and reconciles members (adds new, removes absent). Runs after the 1-hour buffer from `createGroups`. |

On-demand (manually-run) entry points:

- `public_deleteGroups` — removes any domain Group whose email is no
  longer defined in the sheet. Run this sparingly; there is no
  undo.
- `public_sendUpdateRequestEmails` — emails every personal address in
  every Group, asking the recipient to confirm their assignments.
  Throttled to `MAX_EMAILS_TO_SEND` (92) per invocation to stay under
  Gmail's daily quota; already-emailed addresses are tracked on the
  `Emails Sent` tab so re-running doesn't double-send.
- `public_updateAllGroupSettings` — (re)applies the hardcoded group
  settings (external members allowed, no moderation, archive off,
  etc.) to every Group. Use after changing defaults in
  `updateGroupSettings`.

## Setup

### 1. GCP project + Advanced Services

In the Apps Script editor for this project:

1. **Project Settings → Google Cloud Platform (GCP) Project → Change
   project** and paste the project number of a GCP project you own.
2. **Services → Add a service**, enabling:
   - Admin Directory API
   - Group Settings API
3. Follow the OAuth consent link when prompted; accept the scopes
   (AdminDirectory, GroupsSettings, SpreadsheetApp, GmailApp,
   PropertiesService).

The deploying Google account must be a domain admin for the target
Workspace domain (to manage Groups) and have edit access to the
calling spreadsheet.

### 2. Script properties

Set these under **Project Settings → Script Properties**. None may be
committed to git — they identify the specific deployment.

| Key | Purpose |
|-----|---------|
| `SPREADSHEET_ID` | Id of the calling spreadsheet (the value between `/d/` and `/edit` in the sheet URL). Must be the same sheet `calling_sheet/` writes to. |
| `STAKE_NAME` | Human-readable stake name, used in outgoing email subjects and bodies. |
| `DOMAIN` | Bare domain that owns the Google Groups (e.g., `example.org`). Used both to filter domain-owned aliases out of update-request emails and to list groups via `AdminDirectory.Groups.list({domain})`. |
| `EMAIL_ADMIN_ADDRESS` | Address the script notifies when manual admin action is needed (e.g., flipping a new member to *No email*, or a header-mismatch failure). |

The script fails fast at module load if any are unset — look for
`Script property "X" is not set` in the run log.

### 3. Triggers

**Triggers → Add Trigger**, twice:

- `public_createGroups` — Head → Time-driven → Day timer → 4am–5am.
- `public_syncGroups`   — Head → Time-driven → Day timer → 5am–6am.

## Sheet contract

This script is a read-only consumer of the same per-ward tabs that
`calling_sheet/` writes. The expected row-1 headers on each tab (case-
insensitive) are:

```
Organization | Forwarding Email | Position | Name | (emails E onward)
```

`extractGroups` verifies these headers on every run and **aborts the
whole sync** on mismatch via `logAndEmailError` (so the failure lands
on the ERRORS tab *and* emails `EMAIL_ADMIN_ADDRESS`). The check
exists because processing a column-shifted tab would treat the Name
column as an email and silently add the wrong members to the wrong
Groups — much worse than failing the cron. The Name column itself is
not *read* by this script; only its header is verified.

Tabs whose name starts with `_` (`_config`, `_position_overrides`,
`_log`) or that match other bookkeeping names (`HISTORY`, `ERRORS`,
`Indexers`, `Instructions`, `Emails Sent`) are skipped.

## Group settings

Every Group created or touched by the script ends up with the settings
hardcoded in `updateGroupSettings`:

- External members allowed.
- Anyone can post; no moderation.
- All domain members can join.
- Members cannot self-leave.
- Web posting and archive disabled.

If you change those defaults, run `public_updateAllGroupSettings` once
to backfill every existing Group.

## The `[GoogleAccount: …]` annotation

A cell of the form `member@example.com [GoogleAccount: other@gmail.com]`
tells this script that Google auth for the member runs under the
annotation address, which should be added to the Group as a "no email"
member (so they can post/receive permissions without actual delivery).
Apps Script can't toggle the *No email* delivery setting via API, so
`addGroupMember` emails `EMAIL_ADMIN_ADDRESS` with a direct link to the
Group's member list and asks the admin to flip the setting manually.
The canonical annotation parser lives in
`../calling_sheet/EmailMerge.gs` and `../extension/callings-sheet-import.js`.

## Operational state

Three auto-managed tabs on the spreadsheet:

- `HISTORY` — append-log of every change the script makes (member
  added / removed, Group name updated, etc.). Never cleared by the
  script.
- `ERRORS` — **cleared and rewritten every run**. Contains only the
  errors from the most recent invocation. For persistent history,
  check `_log`.
- `Emails Sent` — used by `public_sendUpdateRequestEmails` to skip
  already-contacted addresses across invocations.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Script fails at load with `Script property "X" is not set.` | Missing script property | Set it under Project Settings → Script Properties (see *Setup* above). |
| `Tab "XX" has unexpected column headers.` email from the script | Ward tab's row 1 doesn't match the expected layout | Fix row 1 to the four headers listed under *Sheet contract* above and re-run `public_syncGroups`. |
| Newly-created Group has no members after `public_createGroups` | Expected — member insert happens an hour later via `public_syncGroups` | Wait for the next 5am run, or invoke `public_syncGroups` manually. |
| `ACTION REQUIRED: Need to make X a NO EMAIL group member` email | A `[GoogleAccount: …]` annotation added someone who should receive no email | Follow the link in the email and toggle the member's *Email delivery* to *No email*. |
| `Error: Resource Not Found` in ERRORS tab for a user | Personal email no longer exists (account deleted) | Remove the stale email from the sheet row; the next run will re-sync. |
| Daily emails to admin about the same header mismatch | Header still wrong | Fix the tab; the emails stop once the next run passes the check. |

## See also

- [`../calling_sheet/README.md`](../calling_sheet/README.md) — the
  other Apps Script project against the same spreadsheet.
- [`../doc/sheet-setup.md`](../doc/sheet-setup.md) — authoritative
  schema for the per-ward tabs.
- [`../doc/CHANGELOG.md`](../doc/CHANGELOG.md) — when this subsystem
  last changed and why.
