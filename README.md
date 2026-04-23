# LCR Helper

Tools for ward and stake leaders who use
[Leader and Clerk Resources](https://lcr.churchofjesuschrist.org/) (LCR),
the online system of The Church of Jesus Christ of Latter-day Saints.

The repository contains three subsystems that work together:

| Path | What it is |
|------|------------|
| [`extension/`](./extension/) | Chrome extension (Manifest V3). Injects an "Extract Callings" button on the LCR Callings by Organization page; opens a standalone filterable/exportable callings table in a new tab. Also hosts the "Import into Calling Sheet" flow, and a "Copy Salvation and Exaltation Metrics" button on the Ward Quarterly Report page. |
| [`calling_sheet/`](./calling_sheet/) | Google Apps Script web app (managed with `clasp`). Exposes `doGet` / `doPost` endpoints that the extension calls to read and write the "Email Forwarding Addresses" Google Sheet. |
| [`doc/`](./doc/) | All repo documentation: architecture, setup, algorithms, changelog. |

## Quick tour

- **End users** — see [`doc/import-flow.md`](./doc/import-flow.md) and
  [`doc/extension-config.md`](./doc/extension-config.md).
- **Sheet administrators** — see [`doc/sheet-setup.md`](./doc/sheet-setup.md).
- **Developers** — start with [`doc/architecture.md`](./doc/architecture.md),
  then subsystem-specific docs:
  [`extension/`](./extension/) has its own README-free tree; see
  [`CLAUDE.md`](./CLAUDE.md) for a code tour.
  [`calling_sheet/README.md`](./calling_sheet/README.md) covers deployment.
- **History** — every meaningful change lands in
  [`doc/CHANGELOG.md`](./doc/CHANGELOG.md).

## Features at a glance

- Extract the complete callings list for the active ward from LCR, with
  every member's email address, in one click.
- Filter, save filter presets, and copy TSV to the clipboard for ad-hoc use.
- **Import into Calling Sheet**: diff-review-apply flow that reconciles the
  extracted callings with a per-ward "Email Forwarding Addresses" sheet.
  Never overwrites user-maintained columns (Organization, Forwarding Email,
  Position) or custom rows that don't correspond to an LCR calling.
- **Ward Quarterly Report → stake tracker**: one-click copy of the ten
  Salvation-and-Exaltation metrics, shaped as a single column (blanks
  included for section headers / spacers) plus a bold "{year} Q{quarter}"
  header, for pasting directly into the stake's quarterly-tracker sheet.

## Install

There is no Chrome Web Store listing; the extension is loaded unpacked.

1. Clone this repo.
2. Open `chrome://extensions`, enable Developer mode.
3. Click *Load unpacked* and pick the `extension/` directory.

The calling-sheet import feature additionally requires the Apps Script web
app to be deployed and the extension to be configured with its URL and the
shared secret. See [`doc/apps-script-deploy.md`](./doc/apps-script-deploy.md)
and [`doc/extension-config.md`](./doc/extension-config.md).

## Layout

```
lcr_helper/
├── extension/          Chrome extension source (vanilla JS, no build step)
├── calling_sheet/      Apps Script project (managed via clasp)
├── doc/                Markdown documentation + CHANGELOG
├── CLAUDE.md           Agent-oriented codebase guide
└── README.md           This file
```

## License

No license specified.
