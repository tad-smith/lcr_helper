# calling_sheet — Apps Script web app

Google Apps Script project that backs the extension's *Import into Calling
Sheet* feature. Managed with [`clasp`](https://github.com/google/clasp) so
the code lives in git rather than only in the Apps Script editor.

**Deployment model:** standalone — the script is not container-bound to
the target sheet. It reads/writes the sheet via
`SpreadsheetApp.openById(SHEET_ID)` where `SHEET_ID` is a script
property. See [`../doc/apps-script-deploy.md`](../doc/apps-script-deploy.md)
for the full rationale and walkthrough.

## File layout

```
calling_sheet/
├── .clasp.json.example      # Template; copy to .clasp.json after clasp create
├── .claspignore             # Files clasp should not push
├── appsscript.json          # V8 runtime + web app config
├── Code.gs                  # doGet / doPost routing
├── Auth.gs                  # Shared-secret verification
├── Sheet.gs                 # getTargetSpreadsheet via SHEET_ID
├── Config.gs                # Reads _config and _position_overrides, with cache
├── Logging.gs               # Writes to the _log tab and console
├── Snapshot.gs              # Snapshot endpoint
├── Apply.gs                 # Apply endpoint
├── EmailMerge.gs            # Merge algorithm sanity check
└── README.md                # this file
```

## Quick start

Prerequisites: Node 18+; a consumer Google account with edit access to
the sheet.

```bash
npm install -g @google/clasp
clasp login                                # as the consumer account

cd calling_sheet
clasp create --type standalone --title "LCR Helper - Calling Sheet"
clasp push
```

### Set the script properties

In the Apps Script editor (`clasp open`):

1. *Project Settings* → *Script Properties* → *Add script property*.
2. `SHARED_SECRET` = a long random string.
3. `SHEET_ID` = the id from the sheet URL
   (`https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`).

Use the same secret in the Chrome extension's settings modal.

### First-run OAuth consent

From the editor, pick any function (e.g., `handleSnapshot`) and click
*Run*. Accept the scopes: SpreadsheetApp, DriveApp, PropertiesService,
CacheService.

### Deploy

```bash
clasp deploy --description "v1.0.0 - initial"
```

Note the web app URL. Then:

1. *Deploy* → *Manage deployments* → pencil ✏️ → *Who has access*:
   **Anyone**.
2. Verify: paste the URL into a browser tab — you should see
   `{"ok":false,"error":"unknown_action","action":""}`.

## Update in place (keeps URL stable)

The extension stores the web app URL. Always update in place — a new
deployment gets a new URL and breaks every extension install:

```bash
clasp push
clasp deployments                     # list, find the Deployment ID
clasp deploy -i <deploymentId> --description "v1.1.0 - foo"
```

## Rotating the shared secret

1. Update `SHARED_SECRET` in Script Properties.
2. Update every extension user's settings modal with the new secret.

No cache flush needed — the CacheService keys aren't tied to the
secret.

## Notes on Apps Script web apps

- `ContentService` responses are always HTTP 200. Error conditions are
  signaled in the response body as `{ ok: false, error: "…" }`. Callers
  check the body, not the status.
- `webapp.executeAs = "USER_DEPLOYING"` means the script runs as the
  deployer — the deployer must have edit access to the target sheet.
- Apps Script does not handle CORS preflight. POST bodies must use
  `Content-Type: text/plain`. See `../doc/architecture.md`.
- `clasp push` is destructive on the remote side — it deletes remote
  files not present locally. Keep all desired code in this directory.

## See also

- `../doc/apps-script-deploy.md` — the complete deploy walkthrough +
  troubleshooting table.
- `../doc/architecture.md` — where this fits in the overall design.
