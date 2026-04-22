# Apps Script deploy

How to deploy the `calling_sheet/` web app. The deployment model is
**standalone** only — the Apps Script project is not container-bound
to the target sheet. It reads/writes the sheet via
`SpreadsheetApp.openById(SHEET_ID)` where `SHEET_ID` is a script
property.

Why standalone: the target sheet is owned by a Workspace user, but the
web app must be callable anonymously from the browser extension.
Workspace policies commonly block anonymous deployments on
Workspace-owned scripts. Deploying a standalone script from a
**consumer Google account** (any regular `@gmail.com`) that has edit
access to the sheet sidesteps the policy. The sheet's original
container-bound script (with its `onOpen` toast) stays untouched.

## Prerequisites

- Node 18 or newer.
- `clasp` installed globally: `npm install -g @google/clasp`.
- A consumer Google account with edit access to the target sheet.
- `clasp login` run as that consumer account (if you were previously
  logged in as a Workspace user, `clasp logout` first).

## First-time deploy

1. **Grab the sheet id** from the sheet URL:
   `https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`.
2. **Create the standalone script.**
   ```bash
   cd calling_sheet
   clasp create --type standalone --title "LCR Helper - Calling Sheet"
   ```
   This creates a new Apps Script project (not bound to any sheet)
   and writes `.clasp.json` with its id. `.clasp.json` is gitignored.
3. **Push the source.**
   ```bash
   clasp push
   ```
4. **Set script properties.** `clasp open`, then *Project Settings* →
   *Script Properties* → *Add script property* (twice):
   - `SHARED_SECRET` — a long random string (see
     [`extension-config.md`](./extension-config.md)).
   - `SHEET_ID` — the id from step 1.
5. **Trigger the OAuth consent screen.** In the editor, pick any
   function (e.g., `handleSnapshot`) and click *Run*. A dialog asks
   you to authorize. Accept all requested scopes:
   SpreadsheetApp, DriveApp, PropertiesService, CacheService.
6. **Deploy the web app.**
   ```bash
   clasp deploy --description "v1.0.0 - initial"
   ```
   Clasp prints the web app URL
   (`https://script.google.com/macros/s/.../exec`).
7. **Set deployment access.** *Deploy* → *Manage deployments* →
   pencil ✏️ → *Who has access*: **Anyone**. Click *Deploy*. The URL
   does not change.
8. **Verify.** Paste the web app URL into a browser tab. You should
   see:
   ```json
   {"ok":false,"error":"unknown_action","action":""}
   ```
   If you see a Google sign-in page, step 7 didn't stick.
9. **Configure the extension** with the URL + shared secret; see
   [`extension-config.md`](./extension-config.md).

## Updating in place

The extension hard-stores the web app URL, so do **not** create a new
deployment — update the existing one:

```bash
clasp push
clasp deployments                     # list, find the Deployment ID
clasp deploy -i <deploymentId> --description "v1.1.0 - notes"
```

The `-i` flag updates in place; URL unchanged.

## Rolling back

```bash
clasp versions                        # list of pushed versions
clasp deploy -i <deploymentId> -V <versionNumber> --description "rollback to vN"
```

If a bad push hasn't been deployed yet, just push the fix — only
deployed versions serve at the web app URL.

## Rotating the shared secret

1. Generate a new random secret.
2. Edit the `SHARED_SECRET` script property in the Apps Script editor.
3. Save.
4. Update every extension client's settings modal with the new secret.

In-flight requests with the old secret return
`{ ok: false, error: "unauthorized" }` immediately after the change.

## Renaming / moving the sheet

Safe. The code looks up the sheet by id. Renaming the tab titles is
also safe — the only names the code depends on are `ward_code` values
(per-ward tabs), `_config`, and `_position_overrides`. Replacing the
sheet with a new one (new id) requires updating `SHEET_ID`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `{ ok: false, error: "unauthorized" }` | Secret mismatch or unset | Re-check `SHARED_SECRET` vs. extension settings. |
| `{ ok: false, error: "ward_not_configured" }` | `ward_name` missing in `_config` | Add the exact ward name to `_config`. |
| `{ ok: false, error: "ward_tab_missing" }` | No tab named after the ward's `ward_code` | Create the tab. |
| `{ ok: false, error: "stale_snapshot" }` | Sheet edited between snapshot and apply | Extension re-fetches automatically. |
| `{ ok: false, error: "internal_error", message: "SHEET_ID ..." }` | `SHEET_ID` not set or wrong | Check *Project Settings* → *Script Properties*. |
| Browser-tab visit shows "You need access" | Deployment access isn't *Anyone* | *Deploy* → *Manage deployments* → pencil → *Who has access*: **Anyone**. |
| `clasp push` fails with 403 | Apps Script API disabled on your Google account | `https://script.google.com/home/usersettings` → turn on. |
| Push succeeds but deploy serves old code | Didn't update in place | Use `clasp deploy -i <deploymentId>`. |

## See also

- [`../calling_sheet/README.md`](../calling_sheet/README.md) — quick
  start variant of this document.
- [`architecture.md`](./architecture.md) — why the web app exists.
- [`extension-config.md`](./extension-config.md) — pairing the URL +
  secret with the extension.
