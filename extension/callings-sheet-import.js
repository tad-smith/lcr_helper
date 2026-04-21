/**
 * Import flow for syncing scraped callings into the "Email Forwarding
 * Addresses" Google Sheet. This commit wires up:
 *   - snapshot fetch from the Apps Script web app
 *   - client-side diff against the page's `collapsedCallings`
 * Results are logged to the console. The review modal and apply POST
 * arrive in the next commit.
 *
 * See doc/email-merge-algorithm.md for the merge rules (must stay in
 * sync with calling_sheet/EmailMerge.gs).
 */

/* eslint-disable no-console */

const ANNOTATION_RE = /^(.+?)\s*\[GoogleAccount:\s*([^\]]+?)\s*\]\s*$/i;

/**
 * Parse one cell value into canonical email + optional GoogleAccount
 * annotation.
 * @param {string} raw
 * @returns {{canonical: string, annotation: (string|null), raw: string}}
 */
function parseEmailCell(raw) {
  const s = raw == null ? '' : String(raw);
  const m = s.match(ANNOTATION_RE);
  if (m) return { canonical: m[1].trim(), annotation: m[2].trim(), raw: s };
  return { canonical: s.trim(), annotation: null, raw: s };
}

/** True if `addr` (a bare email) ends with `@<internalDomain>`. */
function isInternalAddr(addr, internalDomain) {
  if (!addr || !internalDomain) return false;
  return String(addr).toLowerCase().endsWith('@' + String(internalDomain).toLowerCase());
}

/**
 * Canonical merge algorithm. See doc/email-merge-algorithm.md.
 */
function mergeEmails({ existing, lcrEmails, internalDomain }) {
  const lcrLower = new Set(lcrEmails.map((e) => String(e).toLowerCase()));
  const kept = [];
  const consumed = new Set();
  const warnings = [];

  for (const raw of existing) {
    const parsed = parseEmailCell(raw);
    const lower = parsed.canonical.toLowerCase();

    if (isInternalAddr(parsed.canonical, internalDomain)) {
      kept.push(raw);
    } else if (lcrLower.has(lower)) {
      kept.push(raw);
      consumed.add(lower);
    } else if (parsed.annotation) {
      warnings.push({
        kind: 'annotation_lost',
        dropped_canonical: parsed.canonical,
        google_account: parsed.annotation,
        raw,
      });
    }
    // else: plain personal email no longer in LCR — drop silently.
  }

  for (const addr of lcrEmails) {
    if (!consumed.has(String(addr).toLowerCase())) {
      kept.push(addr);
    }
  }

  return { emails: kept, warnings };
}

/** Split comma-joined LCR email string, trim, drop sentinels and empties. */
function splitEmails(s) {
  if (!s) return [];
  return s
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x && x !== 'N/A' && x !== 'Error');
}

function deepEqualArr(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function buildCollapsedIndex(collapsedCallings) {
  const idx = Object.create(null);
  for (const c of collapsedCallings) idx[c.id] = c;
  return idx;
}

/**
 * Build the categorized diff. See doc/architecture.md.
 *
 * Categories:
 *   UPDATE              — sheet row needs a write
 *   VACATE              — LCR has no one, row had personal email(s)
 *   UNCHANGED           — merged result equals existing, no warnings
 *   CUSTOM_OR_UNMATCHED — sheet row's lcr_id is null or unknown
 *   MISSING_IN_SHEET    — LCR has a calling with no sheet row
 */
function computeDiff(snapshot, collapsedCallings) {
  const byId = buildCollapsedIndex(collapsedCallings);
  const seenIds = new Set();
  const updates = [];
  const vacates = [];
  const unchanged = [];
  const customOrUnmatched = [];

  for (const row of snapshot.rows) {
    if (!row.lcr_id || !byId[row.lcr_id]) {
      customOrUnmatched.push({ row });
      continue;
    }
    const calling = byId[row.lcr_id];
    seenIds.add(row.lcr_id);

    const lcrEmails = calling.isVacant ? [] : splitEmails(calling.email);
    const { emails: newEmails, warnings } = mergeEmails({
      existing: row.emails,
      lcrEmails,
      internalDomain: snapshot.internal_domain,
    });

    if (deepEqualArr(newEmails, row.emails) && warnings.length === 0) {
      unchanged.push({ row, calling });
      continue;
    }

    const hasNonInternal = row.emails.some(
      (r) => !isInternalAddr(parseEmailCell(r).canonical, snapshot.internal_domain),
    );
    if (lcrEmails.length === 0 && hasNonInternal) {
      vacates.push({ row, calling, before: row.emails, after: newEmails, warnings });
    } else {
      updates.push({ row, calling, before: row.emails, after: newEmails, warnings });
    }
  }

  const missingInSheet = [];
  for (const c of collapsedCallings) {
    if (!seenIds.has(c.id)) missingInSheet.push({ calling: c });
  }

  return { updates, vacates, unchanged, customOrUnmatched, missingInSheet };
}

/** GET the ward snapshot. Throws on network failure or non-JSON body. */
async function fetchSnapshot(webAppUrl, secret, ward) {
  const url =
    webAppUrl +
    '?action=snapshot&ward=' +
    encodeURIComponent(ward) +
    '&secret=' +
    encodeURIComponent(secret);
  const resp = await fetch(url, { method: 'GET', redirect: 'follow' });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return resp.json();
}

async function handleImportClick() {
  const settings = await window.LCRHelperSettings.load();
  if (!settings || !settings.webAppUrl || !settings.sharedSecret) {
    window.LCRHelperSettings.open({ requireConfig: true });
    return;
  }

  const btn = document.getElementById('btn-import-sheet');
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Loading…';

  try {
    const ctx = window.LCRHelper;
    if (!ctx || !ctx.ward || !Array.isArray(ctx.collapsedCallings)) {
      throw new Error('LCRHelper context not initialized');
    }

    const snapshot = await fetchSnapshot(
      settings.webAppUrl,
      settings.sharedSecret,
      ctx.ward,
    );
    if (!snapshot || snapshot.ok === false) {
      throw new Error('snapshot_error: ' + (snapshot && snapshot.error));
    }

    const diff = computeDiff(snapshot, ctx.collapsedCallings);

    console.log('[LCR Helper] snapshot', snapshot);
    console.log('[LCR Helper] diff', diff);
    // Brief confirmation for now; step 7 replaces this with the review modal.
    alert(
      `Diff computed — see the DevTools console.\n\n` +
        `Updates: ${diff.updates.length}\n` +
        `Vacates: ${diff.vacates.length}\n` +
        `Unchanged: ${diff.unchanged.length}\n` +
        `Custom / Unmatched: ${diff.customOrUnmatched.length}\n` +
        `In LCR but not in sheet: ${diff.missingInSheet.length}`,
    );
  } catch (err) {
    console.error('[LCR Helper] Import failed', err);
    alert('Import failed: ' + (err && err.message ? err.message : err));
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

// Exported so the future review modal (step 7) and tests can re-use them.
window.LCRHelperImport = {
  parseEmailCell,
  isInternalAddr,
  mergeEmails,
  splitEmails,
  computeDiff,
  fetchSnapshot,
};

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-import-sheet');
  if (btn) btn.addEventListener('click', handleImportClick);
});
