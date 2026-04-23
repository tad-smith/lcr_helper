/**
 * Applies user-approved email operations to a ward tab. Columns A, B,
 * C, and D are never touched — writes always start at column E
 * (FIRST_EMAIL_COLUMN defined in Snapshot.gs). Column D holds the
 * human-readable Name and is intentionally skipped.
 *
 * See doc/architecture.md for the wire format and doc/email-merge-
 * algorithm.md for the sanity check semantics.
 */

/**
 * Public entry — called by Code.gs doPost router for action=apply.
 *
 * @param {Object} body  {secret, ward_name, operations, generated_at}
 *   operations is an array of {row_index, new_emails, new_name?}.
 *   new_name is optional; when present (including empty string), it
 *   is written to column D. Absent leaves column D untouched.
 */
function handleApply(body) {
  if (!body || typeof body !== 'object') {
    return jsonResponse({ ok: false, error: 'invalid_body' });
  }
  var wardName = trim(body.ward_name);
  if (!wardName) {
    return jsonResponse({ ok: false, error: 'missing_ward_name' });
  }
  if (!Array.isArray(body.operations)) {
    return jsonResponse({ ok: false, error: 'missing_operations' });
  }
  if (!body.generated_at) {
    return jsonResponse({ ok: false, error: 'missing_generated_at' });
  }
  var snapshotTime = Date.parse(body.generated_at);
  if (isNaN(snapshotTime)) {
    return jsonResponse({ ok: false, error: 'invalid_generated_at' });
  }

  var config;
  try {
    config = getConfig();
  } catch (e) {
    logEvent('ERROR', 'Config read failed in apply', { err: String(e) });
    return jsonResponse({ ok: false, error: 'config_unreadable', message: String(e) });
  }

  var wardMeta = config.wards[wardName];
  if (!wardMeta) {
    return jsonResponse({ ok: false, error: 'ward_not_configured', ward_name: wardName });
  }

  var ss = getTargetSpreadsheet();

  // Staleness check: reject if the sheet was modified at or after the
  // snapshot. `>=` (not `>`) so a write that lands on the exact same
  // millisecond as the snapshot still rejects.
  var lastModified = DriveApp.getFileById(ss.getId()).getLastUpdated().getTime();
  if (lastModified >= snapshotTime) {
    logEvent('INFO', 'stale_snapshot rejected', {
      ward: wardMeta.ward_code,
      snapshot: body.generated_at,
      sheet_last_modified: new Date(lastModified).toISOString(),
    });
    return jsonResponse({ ok: false, error: 'stale_snapshot' });
  }

  var tab = ss.getSheetByName(wardMeta.ward_code);
  if (!tab) {
    return jsonResponse({ ok: false, error: 'ward_tab_missing', ward_code: wardMeta.ward_code });
  }

  var allValues = tab.getDataRange().getValues();

  // Verify the sheet still has the expected column layout before any
  // write lands. `verifyWardTabHeaders` is defined in Snapshot.gs.
  var headerCheck = verifyWardTabHeaders(allValues[0]);
  if (!headerCheck.ok) {
    logEvent('ERROR', 'Apply rejected: ward tab header mismatch', {
      ward_code: wardMeta.ward_code,
      expected: headerCheck.expected,
      got: headerCheck.got,
    });
    return jsonResponse({
      ok: false,
      error: 'header_mismatch',
      ward_code: wardMeta.ward_code,
      expected: headerCheck.expected,
      got: headerCheck.got,
    });
  }

  var applied = 0;
  var skipped = 0;
  var errors = [];

  for (var i = 0; i < body.operations.length; i++) {
    var op = body.operations[i];
    var result = applyOneOperation(tab, allValues, op, wardMeta);
    if (result.applied) {
      applied++;
    } else {
      skipped++;
      if (result.error) errors.push(result.error);
    }
  }

  SpreadsheetApp.flush();
  logEvent('INFO', 'apply completed', {
    ward: wardMeta.ward_code,
    applied: applied,
    skipped: skipped,
    errors: errors.length,
  });
  return jsonResponse({ ok: true, applied: applied, skipped: skipped, errors: errors });
}

/**
 * Apply a single operation. Returns {applied: bool, error: Object?}.
 */
function applyOneOperation(tab, allValues, op, wardMeta) {
  if (!op || typeof op !== 'object') {
    return { applied: false, error: { ward: wardMeta.ward_code, error: 'invalid_operation' } };
  }
  var rowIdx = op.row_index;
  if (typeof rowIdx !== 'number' || rowIdx < 2) {
    return { applied: false, error: { ward: wardMeta.ward_code, row_index: rowIdx, error: 'invalid_row_index' } };
  }
  if (!Array.isArray(op.new_emails)) {
    return { applied: false, error: { ward: wardMeta.ward_code, row_index: rowIdx, error: 'invalid_new_emails' } };
  }
  // new_name is optional; if present it must be a string (empty string
  // clears the cell). Absent means "don't touch column D at all".
  if (op.new_name !== undefined && typeof op.new_name !== 'string') {
    return { applied: false, error: { ward: wardMeta.ward_code, row_index: rowIdx, error: 'invalid_new_name' } };
  }

  var rowVals = allValues[rowIdx - 1];
  if (!rowVals) {
    return { applied: false, error: { ward: wardMeta.ward_code, row_index: rowIdx, error: 'row_out_of_bounds' } };
  }

  // Collect non-empty existing cells from column E onward (column D
  // is the reserved Name column; see Snapshot.gs).
  var existing = [];
  var lastUsedCol1Indexed = FIRST_EMAIL_COLUMN - 1;
  for (var c = FIRST_EMAIL_COLUMN - 1; c < rowVals.length; c++) {
    var v = trim(rowVals[c]);
    if (v) {
      existing.push(v);
      lastUsedCol1Indexed = c + 1;
    }
  }

  // Refuse operations that would drop an internal forwarding alias.
  var check = verifyInternalAliasesPreserved(existing, op.new_emails, wardMeta.internal_domain);
  if (!check.ok) {
    return {
      applied: false,
      error: {
        ward: wardMeta.ward_code,
        row_index: rowIdx,
        error: 'would_drop_internal_alias',
        missing: check.missing,
      },
    };
  }

  try {
    // Write the Name cell (column D) if the client asked us to.
    if (typeof op.new_name === 'string') {
      tab.getRange(rowIdx, NAME_COLUMN).setValue(op.new_name);
    }
    // Clear the existing email range, if any.
    if (lastUsedCol1Indexed >= FIRST_EMAIL_COLUMN) {
      var clearWidth = lastUsedCol1Indexed - FIRST_EMAIL_COLUMN + 1;
      tab.getRange(rowIdx, FIRST_EMAIL_COLUMN, 1, clearWidth).clearContent();
    }
    // Write the new email list.
    if (op.new_emails.length > 0) {
      tab.getRange(rowIdx, FIRST_EMAIL_COLUMN, 1, op.new_emails.length)
         .setValues([op.new_emails.slice()]);
    }
    return { applied: true };
  } catch (writeErr) {
    return {
      applied: false,
      error: {
        ward: wardMeta.ward_code,
        row_index: rowIdx,
        error: 'write_failed',
        message: String(writeErr),
      },
    };
  }
}
