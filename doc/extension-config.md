# Extension configuration

How to point the extension at the Apps Script web app and troubleshoot
when it can't connect.

## What gets stored

The extension persists two values to `chrome.storage.local` under a
single key, `callingSheetSettings`:

```jsonc
{
  "webAppUrl": "https://script.google.com/macros/s/.../exec",
  "sharedSecret": "<shared secret>"
}
```

- `webAppUrl` — the URL returned by `clasp deploy` (see
  [`apps-script-deploy.md`](./apps-script-deploy.md)).
- `sharedSecret` — matches `SHARED_SECRET` in the Apps Script project's
  Script Properties.

Both values stay local to the browser profile. They are never written
to DevTools console and never injected into the DOM outside the
settings modal input.

## First-time setup

1. Deploy the Apps Script web app; copy the URL.
2. Open the Apps Script editor → *Project Settings* → *Script
   Properties* → add `SHARED_SECRET` with a long random value.
3. Trigger a calling extraction in LCR so the generated-table tab
   opens.
4. Click the gear icon (⚙) next to *Import into Calling Sheet* on the
   generated table page, OR click *Import into Calling Sheet* directly
   — on first use it will auto-open settings with a *Configure before
   first use* banner.
5. Paste the URL and secret; click *Save*.

## Validation

- The URL must match `^https://script\.google\.com/`. If it starts with
  anything else (including `https://script.googleusercontent.com/`),
  the modal rejects it — Apps Script always serves the deploy URL from
  `script.google.com` and then 302-redirects to
  `script.googleusercontent.com`.
- The secret must be non-empty. No length or format check beyond that.

## Changing the URL later

Only update the URL if you redeploy to a **new** deployment. When you
update an existing deployment in place (`clasp deploy -i
<deploymentId>`), the URL does not change — you do not need to touch
the extension.

## Rotating the secret

1. Update `SHARED_SECRET` in the Apps Script project.
2. On every browser that uses the extension, open the gear modal,
   paste the new secret, Save.

Until step 2 completes on a browser, its imports will fail with a toast
of `Import failed: unauthorized`.

## Clearing settings

There is no *Forget these settings* button in the UI. To clear:

1. Open the generated table tab.
2. Open DevTools → *Application* → *Storage* → *Local Storage* or
   *Extension Storage* → find `callingSheetSettings` → delete.

Then the next import click will re-open the settings modal with the
first-use banner.

Alternatively, from DevTools Console (on the extension-origin page):

```js
chrome.storage.local.remove('callingSheetSettings')
```

## Permissions

The extension's [`manifest.json`](../extension/manifest.json) grants:

- `host_permissions: [https://script.google.com/*,
  https://script.googleusercontent.com/*]` — needed so `fetch()` calls
  follow the Apps Script 302 redirect without CORS errors.
- `storage` — to persist settings.
- `tabs`, `scripting`, `activeTab` — pre-existing, used by the scraper
  and the tab-opener.

The extension does **not** request permission for the LCR site for
import purposes — all import-related fetches go to Google.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Gear button does nothing | JS load error; open DevTools → *Console* | Look for `callings-sheet-settings.js` 404 or syntax error; reload the extension. |
| *Save* rejects URL | Not starting with `https://script.google.com/` | Paste the URL clasp printed. |
| Import: *unauthorized* | Secret mismatch | Re-check `SHARED_SECRET` in Apps Script vs. extension. |
| Import: *ward_not_configured* | Ward name mismatch between LCR and `_config` | Edit `_config` so `ward_name` exactly matches LCR. |
| Import: *ward_tab_missing* | No tab named after the ward's `ward_code` | Create the tab. |
| Import: *stale_snapshot* | Sheet was edited between snapshot and apply | Nothing to fix — extension re-fetches automatically. |
| Import: network error / CORS | `host_permissions` incorrect in manifest | Reload the extension after updating the manifest. |
| Toast shows raw error string | Network failure or Apps Script exception | Open DevTools → *Network* tab, re-run import, inspect the `/exec` requests. |

## See also

- [`apps-script-deploy.md`](./apps-script-deploy.md) — where the URL
  and secret come from.
- [`import-flow.md`](./import-flow.md) — the end-to-end flow once
  configured.
- [`sheet-setup.md`](./sheet-setup.md) — the ward-name / ward-code
  contract.
