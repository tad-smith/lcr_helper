/**
 * Import flow: snapshot fetch → client-side diff → review modal → apply
 * POST → toast. See doc/architecture.md for the data flow and
 * doc/email-merge-algorithm.md for the canonical merge rules. This file
 * must stay in sync with calling_sheet/EmailMerge.gs.
 */

/* eslint-disable no-console */

const ANNOTATION_RE = /^(.+?)\s*\[GoogleAccount:\s*([^\]]+?)\s*\]\s*$/i;

/* ───────── Email algorithm ───────── */

function parseEmailCell(raw) {
  const s = raw == null ? '' : String(raw);
  const m = s.match(ANNOTATION_RE);
  if (m) return { canonical: m[1].trim(), annotation: m[2].trim(), raw: s };
  return { canonical: s.trim(), annotation: null, raw: s };
}

function isInternalAddr(addr, internalDomain) {
  if (!addr || !internalDomain) return false;
  return String(addr).toLowerCase().endsWith('@' + String(internalDomain).toLowerCase());
}

function mergeEmails({ existing, lcrEmails, internalDomain }) {
  const lcrLower = new Set(lcrEmails.map((e) => String(e).toLowerCase()));
  const personal = [];
  const internals = [];
  const consumed = new Set();
  const warnings = [];

  for (const raw of existing) {
    const parsed = parseEmailCell(raw);
    const lower = parsed.canonical.toLowerCase();

    if (isInternalAddr(parsed.canonical, internalDomain)) {
      internals.push(raw);
    } else if (lcrLower.has(lower)) {
      personal.push(raw);
      consumed.add(lower);
    } else if (parsed.annotation) {
      warnings.push({
        kind: 'annotation_lost',
        dropped_canonical: parsed.canonical,
        google_account: parsed.annotation,
        raw,
      });
    }
  }

  for (const addr of lcrEmails) {
    if (!consumed.has(String(addr).toLowerCase())) personal.push(addr);
  }

  // Internal aliases always trail all personal emails.
  return { emails: [...personal, ...internals], warnings };
}

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

/* ───────── Network ───────── */

const REQUEST_TIMEOUT_MS = 30000;

/**
 * fetch wrapper that aborts after REQUEST_TIMEOUT_MS so a hung Apps Script
 * worker can't leave the UI stuck on "Loading…".
 */
async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(`request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POSTs the snapshot request with the secret in the body, not the URL.
 * Keeping the secret out of the query string avoids leaking it into
 * Google's access logs and the browser's Referer header.
 * text/plain avoids a CORS preflight — Apps Script doesn't handle OPTIONS.
 */
async function fetchSnapshot(webAppUrl, secret, ward) {
  const body = { secret, ward };
  const resp = await fetchWithTimeout(webAppUrl + '?action=snapshot', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return resp.json();
}

async function postApply(webAppUrl, secret, wardName, operations, generatedAt) {
  const body = {
    secret,
    ward_name: wardName,
    operations,
    generated_at: generatedAt,
  };
  const resp = await fetchWithTimeout(webAppUrl + '?action=apply', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return resp.json();
}

/* ───────── Tiny DOM helper ───────── */

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k of Object.keys(attrs)) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'checked' || k === 'disabled' || k === 'open') el[k] = !!v;
      else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'dataset') {
        for (const dk of Object.keys(v)) el.dataset[dk] = v[dk];
      } else el.setAttribute(k, v);
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.appendChild(
      typeof child === 'string' || typeof child === 'number'
        ? document.createTextNode(String(child))
        : child,
    );
  }
  return el;
}

/* ───────── Toast ───────── */

let toastHideTimer = null;

function showToast(message, kind = 'info', options = {}) {
  const el = document.getElementById('sheet-toast');
  if (!el) return;
  el.innerHTML = '';
  el.className = 'toast';
  if (kind === 'error') el.classList.add('toast-error');
  if (kind === 'success') el.classList.add('toast-success');
  el.appendChild(h('span', null, message));
  if (options.retry) {
    el.appendChild(
      h('button', { class: 'toast-retry', onClick: () => { hideToast(); options.retry(); } }, 'Retry'),
    );
  }
  el.classList.remove('hidden');
  clearTimeout(toastHideTimer);
  if (!options.retry) {
    toastHideTimer = setTimeout(hideToast, options.timeout || 5000);
  }
}

function hideToast() {
  const el = document.getElementById('sheet-toast');
  if (el) el.classList.add('hidden');
}

/* ───────── Review modal ───────── */

function emailListBefore(before, after) {
  const afterSet = new Set(after);
  const parts = [];
  before.forEach((raw, i) => {
    if (i > 0) parts.push(', ');
    const cls = afterSet.has(raw) ? '' : 'removed';
    parts.push(h('span', cls ? { class: cls } : null, raw));
  });
  if (before.length === 0) parts.push(h('i', null, '(empty)'));
  return parts;
}

function emailListAfter(before, after) {
  const beforeSet = new Set(before);
  const parts = [];
  after.forEach((raw, i) => {
    if (i > 0) parts.push(', ');
    const cls = beforeSet.has(raw) ? '' : 'added';
    parts.push(h('span', cls ? { class: cls } : null, raw));
  });
  if (after.length === 0) parts.push(h('i', null, '(empty — person released)'));
  return parts;
}

function rowTitle(entry) {
  if (entry.row && entry.row.override_applied) {
    return entry.calling.id + ' (' + entry.row.position + ')';
  }
  return entry.calling.id;
}

function renderDiffRow(entry, writable) {
  const hasWarning = entry.warnings && entry.warnings.length > 0;
  const title = rowTitle(entry);

  const header = writable
    ? h(
        'label',
        null,
        h('input', {
          type: 'checkbox',
          class: 'review-check',
          checked: true,
          dataset: { rowIndex: String(entry.row.row_index) },
        }),
        ' ',
        h('span', { class: 'row-title' }, title),
      )
    : h('span', { class: 'row-title' }, title);

  const children = [
    header,
    h('div', { class: 'row-before' }, '- ', ...emailListBefore(entry.before, entry.after)),
    h('div', { class: 'row-after' }, '+ ', ...emailListAfter(entry.before, entry.after)),
  ];

  if (hasWarning) {
    for (const w of entry.warnings) {
      if (w.kind === 'annotation_lost') {
        children.push(
          h(
            'div',
            { class: 'row-warning' },
            `⚠ GoogleAccount annotation (${w.google_account}) will be lost.`,
          ),
        );
      }
    }
  }

  const row = h(
    'div',
    { class: 'review-row' + (hasWarning ? ' has-warning' : '') },
    ...children,
  );
  row._entry = entry;
  return row;
}

function renderCustomRow(entry) {
  return h(
    'div',
    { class: 'review-row' },
    h('span', { class: 'row-title' }, entry.row.position || '(no position)'),
    h('div', { class: 'row-before' }, entry.row.emails.join(', ') || h('i', null, '(empty)')),
  );
}

function renderUnchangedRow(entry) {
  return h(
    'div',
    { class: 'review-row' },
    h('span', { class: 'row-title' }, rowTitle(entry)),
    h('div', { class: 'row-before' }, entry.row.emails.join(', ') || h('i', null, '(empty)')),
  );
}

function renderMissingRow(entry) {
  const c = entry.calling;
  const label = c.id + (c.isVacant ? ' (vacant)' : '');
  const emails = c.isVacant ? '' : c.email || '';
  return h(
    'div',
    { class: 'review-row' },
    h('span', { class: 'row-title' }, label),
    h('div', { class: 'row-before' }, emails || h('i', null, '(no emails)')),
  );
}

function countAnnotationLostWarnings(diff) {
  let n = 0;
  for (const e of [...diff.updates, ...diff.vacates]) {
    if (e.warnings) n += e.warnings.filter((w) => w.kind === 'annotation_lost').length;
  }
  return n;
}

function openReviewModal({ snapshot, diff, settings, ctx }) {
  const modal = document.getElementById('sheet-review-modal');
  if (!modal) return;
  modal.innerHTML = '';

  const dialog = h('div', { class: 'modal-dialog', role: 'dialog' });
  modal.appendChild(h('div', { class: 'modal-backdrop', onClick: closeReviewModal }));
  modal.appendChild(dialog);

  dialog.appendChild(
    h(
      'div',
      { class: 'modal-header' },
      h('h2', null, `Import into ${snapshot.ward_code} — ${snapshot.ward_name}`),
      h('button', { type: 'button', class: 'modal-close', onClick: closeReviewModal }, '×'),
    ),
  );

  const body = h('div', { class: 'modal-body' });
  dialog.appendChild(body);

  const lostCount = countAnnotationLostWarnings(diff);
  if (lostCount > 0) {
    body.appendChild(
      h(
        'div',
        { class: 'modal-banner' },
        `${lostCount} GoogleAccount annotation(s) will be dropped. Re-annotate ` +
          `after import if you want to keep them.`,
      ),
    );
  }

  const updatesSection = h(
    'details',
    { class: 'review-section', open: true },
    h('summary', null, `Updates (${diff.updates.length})`),
  );
  for (const e of diff.updates) updatesSection.appendChild(renderDiffRow(e, true));
  if (diff.updates.length > 0) body.appendChild(updatesSection);

  const vacatesSection = h(
    'details',
    { class: 'review-section', open: true },
    h('summary', null, `Vacating (${diff.vacates.length})`),
  );
  for (const e of diff.vacates) vacatesSection.appendChild(renderDiffRow(e, true));
  if (diff.vacates.length > 0) body.appendChild(vacatesSection);

  if (diff.unchanged.length > 0) {
    const section = h(
      'details',
      { class: 'review-section' },
      h('summary', null, `Unchanged (${diff.unchanged.length}) — informational`),
    );
    for (const e of diff.unchanged) section.appendChild(renderUnchangedRow(e));
    body.appendChild(section);
  }

  if (diff.customOrUnmatched.length > 0) {
    const section = h(
      'details',
      { class: 'review-section' },
      h('summary', null, `Custom or Unmatched (${diff.customOrUnmatched.length}) — informational`),
    );
    for (const e of diff.customOrUnmatched) section.appendChild(renderCustomRow(e));
    body.appendChild(section);
  }

  if (diff.missingInSheet.length > 0) {
    const section = h(
      'details',
      { class: 'review-section' },
      h('summary', null, `In LCR but not in sheet (${diff.missingInSheet.length}) — informational`),
    );
    for (const e of diff.missingInSheet) section.appendChild(renderMissingRow(e));
    body.appendChild(section);
  }

  if (diff.updates.length === 0 && diff.vacates.length === 0) {
    body.appendChild(h('p', null, 'Nothing to apply — sheet is already in sync.'));
  }

  const applyBtn = h('button', { type: 'button', class: 'action-button', id: 'review-apply' });
  const cancelBtn = h(
    'button',
    { type: 'button', class: 'secondary-button', onClick: closeReviewModal },
    'Cancel',
  );
  dialog.appendChild(h('div', { class: 'modal-footer' }, cancelBtn, applyBtn));

  // Sync the Apply button label with the checkbox count.
  function refreshApplyButton() {
    const checked = modal.querySelectorAll('input.review-check:checked').length;
    applyBtn.disabled = checked === 0;
    applyBtn.textContent = `Apply ${checked} change${checked === 1 ? '' : 's'}`;
  }
  modal.addEventListener('change', (ev) => {
    if (ev.target && ev.target.classList && ev.target.classList.contains('review-check')) {
      refreshApplyButton();
    }
  });
  refreshApplyButton();

  applyBtn.addEventListener('click', async () => {
    const ops = [];
    const writableEntries = [...diff.updates, ...diff.vacates];
    const entriesByRow = Object.create(null);
    for (const e of writableEntries) entriesByRow[e.row.row_index] = e;

    const checkedInputs = modal.querySelectorAll('input.review-check:checked');
    checkedInputs.forEach((input) => {
      const idx = parseInt(input.dataset.rowIndex, 10);
      const entry = entriesByRow[idx];
      if (entry) ops.push({ row_index: idx, new_emails: entry.after });
    });

    if (ops.length === 0) return;

    applyBtn.disabled = true;
    cancelBtn.disabled = true;
    applyBtn.textContent = 'Applying…';

    try {
      const result = await postApply(
        settings.webAppUrl,
        settings.sharedSecret,
        snapshot.ward_name,
        ops,
        snapshot.generated_at,
      );
      if (result && result.ok) {
        const errCount = (result.errors || []).length;
        const kind = errCount > 0 ? 'error' : 'success';
        let msg = `Applied ${result.applied}, skipped ${result.skipped}`;
        if (errCount > 0) msg += `, ${errCount} error${errCount === 1 ? '' : 's'}`;
        msg += '.';
        if (errCount > 0) console.error('[LCR Helper] apply errors', result.errors);
        showToast(msg, kind);
        closeReviewModal();
      } else if (result && result.error === 'stale_snapshot') {
        showToast(
          'Sheet changed since snapshot — refreshing…',
          'error',
          { timeout: 3000 },
        );
        closeReviewModal();
        // Re-fetch snapshot and re-render.
        const newSnap = await fetchSnapshot(
          settings.webAppUrl,
          settings.sharedSecret,
          ctx.ward,
        );
        if (!newSnap || newSnap.ok === false) {
          showToast('Re-fetch failed: ' + (newSnap && newSnap.error), 'error');
          return;
        }
        const newDiff = computeDiff(newSnap, ctx.collapsedCallings);
        openReviewModal({ snapshot: newSnap, diff: newDiff, settings, ctx });
      } else {
        const err = (result && result.error) || 'unknown_error';
        showToast('Apply failed: ' + err, 'error');
        applyBtn.disabled = false;
        cancelBtn.disabled = false;
        refreshApplyButton();
      }
    } catch (err) {
      console.error('[LCR Helper] apply failed', err);
      showToast('Apply failed: ' + (err && err.message ? err.message : err), 'error');
      applyBtn.disabled = false;
      cancelBtn.disabled = false;
      refreshApplyButton();
    }
  });

  modal.classList.remove('hidden');
}

function closeReviewModal() {
  const modal = document.getElementById('sheet-review-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.innerHTML = '';
}

/* ───────── Entry point ───────── */

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
      throw new Error((snapshot && snapshot.error) || 'snapshot_error');
    }
    const diff = computeDiff(snapshot, ctx.collapsedCallings);
    openReviewModal({ snapshot, diff, settings, ctx });
  } catch (err) {
    console.error('[LCR Helper] Import failed', err);
    showToast('Import failed: ' + (err && err.message ? err.message : err), 'error', {
      retry: handleImportClick,
    });
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

window.LCRHelperImport = {
  parseEmailCell,
  isInternalAddr,
  mergeEmails,
  splitEmails,
  computeDiff,
  fetchSnapshot,
  postApply,
  openReviewModal,
  closeReviewModal,
  showToast,
  hideToast,
};

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-import-sheet');
  if (btn) btn.addEventListener('click', handleImportClick);
});
