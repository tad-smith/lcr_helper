# Apps Script deploy

Full walkthrough for deploying and maintaining the `calling_sheet/` Apps
Script web app using `clasp`. If you're looking for a quick-start, see
[`../calling_sheet/README.md`](../calling_sheet/README.md) instead; this
document covers edge cases and operations.

## Prerequisites

- Node 18 or newer.
- A Google account with edit access to the target "Email Forwarding
  Addresses" spreadsheet.
- `clasp` installed globally: `npm install -g @google/clasp`.
- `clasp login` completed (opens a browser, signs you in, stores
  credentials in `~/.clasprc.json`).

## Initial deploy

1. **Create or clone the Apps Script project.**
   - For a brand new, container-bound script on the target sheet:
     ```bash
     cd calling_sheet
     clasp create --type sheets --title "LCR Helper - Calling Sheet" --parentId <spreadsheetId>
     ```
     `--parentId` binds the script to the spreadsheet so it can read/write
     without needing additional OAuth scopes at deploy time.
   - To adopt an existing script:
     ```bash
     cd calling_sheet
     clasp clone <scriptId>
     ```
2. **Pin the scriptId.**
   ```bash
   cp .clasp.json.example .clasp.json
   # Edit .clasp.json and paste the scriptId from step 1.
   ```
   `.clasp.json` is gitignored — the scriptId is an environment
   identifier, not code.
3. **Push the source.**
   ```bash
   clasp push
   ```
4. **Set the shared secret.** Open the Apps Script editor (`clasp open`),
   navigate to *Project Settings* → *Script Properties* → *Add script
   property*. Use key `SHARED_SECRET` and a long random value.
5. **Deploy the web app.**
   ```bash
   clasp deploy --description "v1.0.0 - initial"
   ```
   Note the web app URL that clasp prints. It looks like
   `https://script.google.com/macros/s/AKfycb…/exec` and is what the
   extension's settings modal wants.

## Updating in place

The extension hard-stores the web app URL. Creating a new deployment
assigns a new URL and silently breaks every installation. Always update
the existing deployment:

```bash
clasp push
clasp deployments                     # list all, find the Deployment ID
clasp deploy -i <deploymentId> --description "v1.1.0 - notes"
```

The `-i` flag updates the deployment in place; the URL does not change.

## Rolling back

Apps Script keeps version history. To roll back:

```bash
clasp versions                        # see list of pushed versions
clasp deploy -i <deploymentId> -V <versionNumber> --description "rollback to vN"
```

If a bad push has not yet been deployed, simply push the fix. Only
deployed versions are served at the web app URL.

## Rotating the shared secret

1. Generate a new random secret.
2. In the Apps Script editor, edit the `SHARED_SECRET` script property.
3. Save.
4. Update every extension client's settings modal (in
   `chrome.storage.local`) with the new secret.

There is no CacheService key tied to the secret, so nothing special needs
flushing. In-flight requests with the old secret will return
`{ ok: false, error: "unauthorized" }` immediately after the change.

## Granting the right OAuth scopes

On first execution of `doGet` / `doPost` as the deployer, Apps Script will
prompt for consent. Accept all requested scopes:

- SpreadsheetApp (read/write sheet)
- DriveApp (for `getLastUpdated` on staleness checks)
- PropertiesService (to read `SHARED_SECRET`)
- CacheService (config cache)

If you deploy fresh and the first request returns `internal_error`, check
the Apps Script execution log — an unauthorized scope shows up as an
`AuthorizationException` and is fixed by running any function manually
from the editor once to trigger the consent screen.

## Permissioning the web app

In the web-app deploy dialog, set:

- *Execute as*: **Me** (the deployer). Automated by
  `appsscript.json`'s `webapp.executeAs: "USER_DEPLOYING"`.
- *Who has access*: **Anyone**. This makes the URL anonymously reachable.
  The shared secret is the only authentication. Automated by
  `webapp.access: "ANYONE_ANONYMOUS"`.

If your organization disallows anonymous web apps, you will need to:

1. Change `webapp.access` to `"MYSELF"` or `"DOMAIN"`.
2. Use an OAuth flow from the extension instead of a shared secret — out
   of scope for v1. Open a GitHub issue if you need this.

## Troubleshooting

| Symptom | Likely cause | Fix |
|--------|--------------|-----|
| Extension: `{ ok: false, error: "unauthorized" }` | Secret mismatch or unset | Re-check `SHARED_SECRET` script property and the extension settings. |
| Extension: `{ ok: false, error: "ward_not_configured" }` | `ward_name` absent from `_config` | Add the exact ward name to `_config`. |
| Extension: `{ ok: false, error: "ward_tab_missing" }` | Tab named after `ward_code` absent | Create the tab. |
| Extension: `{ ok: false, error: "stale_snapshot" }` | Sheet edited between snapshot and apply | Extension will re-fetch automatically. |
| `clasp push` fails with 403 | Apps Script API disabled on your Google account | `https://script.google.com/home/usersettings` → turn on. |
| Push succeeds but deploy serves old code | Deploy didn't pick up latest version | Use `clasp deploy -i <deploymentId>`; check `clasp versions` to see which version the deployment points at. |

## See also

- [`../calling_sheet/README.md`](../calling_sheet/README.md) — quick start
  variant of this document.
- [`architecture.md`](./architecture.md) — why the web app exists.
- [`extension-config.md`](./extension-config.md) — pairing this URL with
  the extension.
