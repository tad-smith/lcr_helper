# Documentation

This directory holds all cross-subsystem documentation for LCR Helper. Each
document starts with a two-sentence purpose blurb and ends with a *See also*
footer.

## Index

### Design and architecture

- [`architecture.md`](./architecture.md) — end-to-end data flow and
  subsystem responsibilities.
- [`email-merge-algorithm.md`](./email-merge-algorithm.md) — the canonical
  algorithm for reconciling LCR email lists with sheet cells, including the
  `[GoogleAccount: …]` annotation rules and worked examples.
- [`position-mapping.md`](./position-mapping.md) — how the sheet's
  `Position` column maps to LCR calling IDs, and how overrides work.

### Setup and operations

- [`sheet-setup.md`](./sheet-setup.md) — how to create and maintain the
  `_config` and `_position_overrides` tabs plus per-ward tabs.
- [`apps-script-deploy.md`](./apps-script-deploy.md) — `clasp` setup,
  first deploy, updating the deployment in place, rotating the shared secret.
- [`extension-config.md`](./extension-config.md) — entering the web app URL
  and shared secret into the extension.

### User-facing

- [`import-flow.md`](./import-flow.md) — the step-by-step import flow a
  user sees, including review-modal semantics.

### History and open items

- [`CHANGELOG.md`](./CHANGELOG.md) — **single** repo-wide changelog. Every
  commit adds or extends an entry here.
- [`open-questions.md`](./open-questions.md) — ambiguities surfaced during
  implementation that still need resolution. Created lazily; may not exist.

## Conventions

- Markdown only. No generators, no static site. Any renderer that speaks
  GitHub-flavored Markdown must render these correctly.
- Each document is kept under 400 lines. Split if longer.
- No marketing language. Assume the reader can read code.
- Links between docs use relative paths.
