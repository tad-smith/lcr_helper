# calling_sheet — Apps Script web app

Google Apps Script project that backs the extension's *Import into Calling
Sheet* feature. Managed with [`clasp`](https://github.com/google/clasp) so
the code lives in git rather than only in the Apps Script editor.

## File layout

```
calling_sheet/
├── .clasp.json.example      # Template; copy to .clasp.json and fill in scriptId
├── .claspignore             # Files clasp should not push
├── appsscript.json          # V8 runtime + web app config
├── Code.gs                  # doGet / doPost routing
├── Auth.gs                  # Shared-secret verification
├── Config.gs                # Reads _config and _position_overrides, with cache
├── Logging.gs               # Writes to the _log tab and console
├── Snapshot.gs              # (snapshot endpoint — added later)
├── Apply.gs                 # (apply endpoint — added later)
├── EmailMerge.gs            # (merge algorithm sanity check — added later)
└── README.md                # this file
```

## First-time setup

Prerequisites: Node 18+ and a Google account that owns the target sheet.

```bash
npm install -g @google/clasp
clasp login
```

Then, from the repo root:

```bash
cd calling_sheet
# Option A: create a brand new script bound to the target spreadsheet.
#   clasp create --type sheets --title "LCR Helper - Calling Sheet"
# Option B: if the script already exists, clone it and pull the scriptId out.
#   clasp clone <scriptId>
cp .clasp.json.example .clasp.json
# Edit .clasp.json and replace REPLACE_WITH_YOUR_SCRIPT_ID with the real ID.
clasp push
```

`.clasp.json` is gitignored — the scriptId is a per-environment secret,
not version-controlled.

### Set the shared secret

In the Apps Script editor for the project:

1. Open *Project Settings*.
2. Scroll to *Script Properties* → *Edit script properties* → *Add script
   property*.
3. Property name: `SHARED_SECRET`. Value: a long random string. Save.

Use the same secret in the Chrome extension's settings modal.

## Deploy

```bash
clasp push
clasp deploy --description "v1.0.0 - initial"
```

Note the resulting web app URL — something like
`https://script.google.com/macros/s/AKfycbx.../exec`. The extension needs
this URL in its settings modal.

## Update in place (keeps URL stable)

**Important.** The extension stores the web app URL. If you re-deploy
without the `-i <deploymentId>` flag you will get a *new* URL and the
extension will break. Always update existing deployments in place:

```bash
clasp push
clasp deploy -i <deploymentId> --description "v1.1.0 - foo"
```

List deployments to find the ID:

```bash
clasp deployments
```

## Rotating the shared secret

1. Update `SHARED_SECRET` in Script Properties.
2. Tell every extension user to update their settings modal with the new
   secret.
3. Rotation invalidates the script's `CacheService` entries only indirectly
   (cache keys are based on sheet last-modified, not the secret). No cache
   flush is needed.

## Notes on Apps Script web apps

- `ContentService` responses are always HTTP 200. Error conditions are
  signaled in the response body as `{ ok: false, error: "…" }`. Callers
  must check the body, not the status.
- `web_app.access = "ANYONE_ANONYMOUS"` means the URL is unauthenticated;
  the shared secret is the only gate.
- `web_app.executeAs = "USER_DEPLOYING"` means the script runs as the
  deployer — so the deployer must have edit access to the target sheet.
- Apps Script web apps do not handle CORS preflight requests. POST bodies
  must use `Content-Type: text/plain` to avoid a preflight. See
  `../doc/architecture.md` for details.

## See also

- `../doc/apps-script-deploy.md` — the complete deploy walkthrough.
- `../doc/architecture.md` — where this fits in the overall design.
