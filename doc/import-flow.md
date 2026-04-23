# Import flow

The user-facing walkthrough for pulling the active ward's callings from
LCR into the "Email Forwarding Addresses" Google Sheet. Assumes the sheet
is already set up (see [`sheet-setup.md`](./sheet-setup.md)) and the Apps
Script web app is deployed (see [`apps-script-deploy.md`](./apps-script-deploy.md)).

Screenshots intentionally omitted from this initial version — drop PNGs
into `doc/images/` and reference them from the captioned slots below.

## Prerequisites checklist

Before your first import:

- [ ] Sheet has `_config`, `_position_overrides`, and a tab per ward.
- [ ] Apps Script web app is deployed; you have its URL.
- [ ] Apps Script `SHARED_SECRET` property is set.
- [ ] Chrome extension is loaded unpacked from `extension/`.
- [ ] You are signed into LCR with a role that can view callings.

## 1. Configure the extension (first time)

1. Sign into LCR and navigate to *Callings by Organization* for your
   ward. The extension injects an *Extract Callings* button near the
   role picker.
2. Click *Extract Callings*. The generated callings table opens in a
   new tab.
3. In the new tab, click the gear icon (⚙) next to *Import into Calling
   Sheet*. The settings modal opens.
4. Paste the **Web App URL** (e.g., `https://script.google.com/macros/s/…/exec`)
   and the **Shared Secret** that matches `SHARED_SECRET` in the Apps
   Script project settings.
5. Click *Save*.

> Screenshot slot: settings modal with both fields filled in.

The settings persist in `chrome.storage.local` under
`callingSheetSettings`. They are never logged to console or displayed in
the DOM after saving.

## 2. Run an import

1. From the generated callings table, click *Import into Calling Sheet*.
2. The extension:
   - Fetches a snapshot of the ward tab from the Apps Script web app.
   - Runs the email-merge algorithm per row (see
     [`email-merge-algorithm.md`](./email-merge-algorithm.md)).
   - Classifies rows as *Updates*, *Vacating*, *Unchanged*,
     *Custom / Unmatched*, or *In LCR but not in sheet*.
3. The review modal opens.

> Screenshot slot: review modal opened with sections expanded.

### Reading the review modal

The modal looks roughly like this:

```
╔══════════════════════════════════════════════════════════════╗
║ Import into CO — Colorado Springs North Ward                 ║
╠══════════════════════════════════════════════════════════════╣
║ ⚠  2 GoogleAccount annotations will be dropped. Re-annotate  ║
║    after import if you want to keep them.                    ║
║                                                              ║
║ ▼ Updates (7)                                                ║
║   ☑ Bishopric:Bishop                                         ║
║      - haleco99@gmail.com                                    ║
║      + haleco99@gmail.com, newperson@gmail.com               ║
║   ☑ ⚠ Elders Quorum Presidency:Elders-Quorum-President       ║
║      - old@x.com [GoogleAccount: foo@gmail.com]              ║
║      + new@x.com                                             ║
║      ⚠ GoogleAccount annotation (foo@gmail.com) will be lost ║
║ ▼ Vacating (1)                                               ║
║   ☑ Primary Presidency:Primary-Secretary                     ║
║      - brittanylee.herman@gmail.com                          ║
║      + (empty — person released)                             ║
║ ▶ Unchanged (23)             — informational, read-only      ║
║ ▶ Custom or Unmatched (3)    — informational, read-only      ║
║ ▶ In LCR but not in sheet (12) — informational, read-only    ║
╠══════════════════════════════════════════════════════════════╣
║ [Cancel]                                 [Apply 8 changes]   ║
╚══════════════════════════════════════════════════════════════╝
```

Section meanings:

| Section | What it means | Writable? |
|---------|---------------|-----------|
| **Updates** | Row's email list will change, but the calling still has someone in LCR. | ✅ |
| **Vacating** | LCR no longer has any holder for this calling. All personal emails on the row will be dropped (internal-domain aliases are preserved). | ✅ |
| **Unchanged** | Sheet already matches LCR for this calling. Shown for auditability; not modified. | ❌ |
| **Custom or Unmatched** | Row's `Position` value didn't match any known LCR calling. Always left alone. | ❌ |
| **In LCR but not in sheet** | LCR has this calling but no sheet row tracks it. If you want it tracked, add a row by hand (see [`sheet-setup.md`](./sheet-setup.md)). | ❌ |

Row styling:

- **Strikethrough** on `-` line: email will be removed.
- **Bold / green** on `+` line: email is newly added.
- **`⚠` prefix**: a `[GoogleAccount: …]` annotation will be dropped
  because the canonical LCR email for that cell is no longer there. The
  apply is not blocked; re-annotate after import if you want.

### Picking which rows to apply

Every row in *Updates* and *Vacating* has a checkbox. Checked rows will
be included when you click Apply. Uncheck any you want to skip this
round — it will come back in the next import.

The Apply button shows the count and is disabled at zero.

## 3. Apply

Click *Apply N changes*.

The extension POSTs the selected operations to the Apps Script web app.
The server:

1. Verifies the shared secret.
2. Confirms the snapshot isn't stale (the sheet hasn't been edited since
   the snapshot was generated).
3. For each operation, re-verifies that no internal-domain alias would
   be dropped.
4. Writes the new Name to column D (when the operation carries
   `new_name`; single-person callings, merged multi-person callings,
   and vacates all do) and the new email list to column E onward.
5. Returns a summary `{applied, skipped, errors}`.

A toast at the bottom of the window shows the result:

- ✅ Green: everything applied cleanly.
- ❌ Red: some operations failed — details printed in DevTools console.

> Screenshot slot: success toast and error toast.

## 4. Common situations

### "Stale snapshot" while applying

If someone (or you, in another tab) edits the sheet between snapshot and
apply, the server rejects with `stale_snapshot`. The extension:

1. Shows a toast: *Sheet changed since snapshot — refreshing…*
2. Closes the modal.
3. Re-fetches the snapshot.
4. Re-computes the diff and re-opens the modal.

Review the new diff and apply again.

### "Import failed" toast with Retry button

Network issues or unexpected server errors land here. The toast sticks
until dismissed and offers a *Retry* button that re-runs the whole
import from the snapshot fetch.

### Row appears in "Custom or Unmatched" unexpectedly

The sheet's `Position` value doesn't derive to a known LCR calling id.
Two options:

1. Add an override row in `_position_overrides` mapping
   `(ward_code, sheet_position) → lcr_id`. See
   [`position-mapping.md`](./position-mapping.md).
2. If the row genuinely has no LCR equivalent, leave it. The import
   will always skip it.

### Row appears in "In LCR but not in sheet"

LCR has the calling, the sheet doesn't track it. If you want to start
tracking:

1. Add a row to the ward tab with Organization / Forwarding Email /
   Position filled in (Position must be `<ward_code> Calling Name` or
   have an override).
2. Run the import again.

## 5. Data you will never lose

The import is deliberately conservative. It **never**:

- Writes to columns A, B, or C.
- Adds or deletes rows.
- Drops an email address ending in `@<internal_domain>`.
- Modifies a row in the *Custom or Unmatched* section.

Both the extension and the server enforce the internal-alias rule; a
misbehaving client cannot get past it.

## See also

- [`architecture.md`](./architecture.md) — the full data flow.
- [`email-merge-algorithm.md`](./email-merge-algorithm.md) — exact
  per-cell rules with worked examples.
- [`position-mapping.md`](./position-mapping.md) — how sheet positions
  map to LCR calling ids.
- [`extension-config.md`](./extension-config.md) — the settings flow in
  more detail.
- [`sheet-setup.md`](./sheet-setup.md) — initial sheet configuration.
