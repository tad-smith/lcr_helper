/**
 * Content script for LCR's Ward Quarterly Report page.
 *
 * Reads the 10 Work-of-Salvation metrics the stake tracker spreadsheet
 * follows, and copies them to the clipboard as a single column-formatted
 * block. Paste the block into the first data cell of the quarter column
 * and the values (plus intentional blank lines for section headers and
 * spacers) land on the right rows.
 *
 * Expects the host page's table layout:
 *   <tr>
 *     <td>lineNum</td>       0
 *     <td>description</td>   1
 *     <td>Actual</td>        2
 *     <td>Potential</td>     3
 *     <td>2026</td>          4  (current-year quarter %)
 *     <td>2025</td>          5
 *     <td>2021</td>          6
 *   </tr>
 * Cells are always present even when empty ("---"). If LCR ever changes
 * this shape, extractTableRows will still find data rows (first cell
 * numeric), but column indices below will need updating.
 */

/** Column indices into the 7-cell data row above. */
const QR_COL_ACTUAL = 2;
const QR_COL_CURRENT_YEAR = 4;

/**
 * Spreadsheet column layout, top-down. Each entry is either:
 *   - null: a blank row in the sheet (section header or spacer)
 *   - { line, col, dashToZero? }: read that col from the webpage line
 *
 * `dashToZero: true` converts the webpage's "---" to "0" — used for the
 * baptism count where the sheet tracks integers and the user prefers a
 * literal zero over a dash.
 *
 * Non-dashToZero cells render a webpage "---" as "-" to match the
 * existing sheet convention (single dash, not the page's triple dash).
 */
const QR_MAPPING = [
  { line: 7, col: QR_COL_CURRENT_YEAR },                    // Sacrament meeting attendance (%)
  { line: 2, col: QR_COL_CURRENT_YEAR },                    // Endowed with a temple recommend (%)
  { line: 20, col: QR_COL_CURRENT_YEAR },                   // Youth with temple recommends (%)
  { line: 26, col: QR_COL_CURRENT_YEAR },                   // Recent converts - submitted temple names (%)
  { line: 25, col: QR_COL_CURRENT_YEAR },                   // Recent converts - appropriate priesthood office (%)
  null,                                                      // spacer
  null,                                                      // "Caring for those in need" section header
  { line: 12, col: QR_COL_CURRENT_YEAR },                   // EQ Ministering interviews (%)
  { line: 13, col: QR_COL_CURRENT_YEAR },                   // RS Ministering interviews (%)
  null,                                                      // "Living the Law of the Fast" (no data)
  null,                                                      // spacer
  null,                                                      // "Inviting all to receive the gospel" section header
  { line: 8, col: QR_COL_ACTUAL, dashToZero: true },        // Convert baptisms in last 12 months (#)
  { line: 3, col: QR_COL_ACTUAL },                          // YSA serving full time missions (#)
  null,                                                      // spacer
  null,                                                      // "Uniting families for eternity" section header
  { line: 9, col: QR_COL_CURRENT_YEAR },                    // Submitting names to the temple (%)
];

/**
 * Walks every tbody in the quarterly report table and collects rows whose
 * first cell is a bare integer (the line number). Returns a Map keyed by
 * that line number so the mapping above can look rows up by line.
 *
 * @returns {Map<number, string[]>} line number -> array of cell text.
 */
function extractTableRows() {
  const rows = new Map();
  const tbodies = document.querySelectorAll('[role="grid"] tbody');
  tbodies.forEach((tbody) => {
    tbody.querySelectorAll('tr').forEach((tr) => {
      const cells = Array.from(tr.children).map((c) => c.textContent.trim());
      if (cells.length && /^\d+$/.test(cells[0])) {
        rows.set(parseInt(cells[0], 10), cells);
      }
    });
  });
  return rows;
}

/**
 * Normalizes a raw cell value for the spreadsheet.
 *   "---"           -> "-"      (sheet's dash convention)
 *   "---" + dashToZero -> "0"   (count fields)
 *   everything else -> unchanged.
 */
function formatQRValue(raw, dashToZero) {
  if (raw === '---') return dashToZero ? '0' : '-';
  return raw;
}

/**
 * Reads the Year/Quarter <select>s from the report's form and returns
 * the "{year} Q{quarter}" header string the spreadsheet column uses.
 * Falls back to empty strings if the selects aren't rendered yet — the
 * caller should guard against the "-empty- Q" result.
 */
function readQuarterHeader() {
  const yearSel = document.querySelector('select[name="Year"]');
  const quarterSel = document.querySelector('select[name="Quarter"]');
  const year = yearSel ? yearSel.value : '';
  const quarter = quarterSel ? quarterSel.value : '';
  return `${year} Q${quarter}`;
}

/**
 * Builds the paste block as an ordered list of cell values. The first
 * entry is the bold header ("{year} Q{quarter}"); the second is a
 * blank row so the header lands two cells above the first data value.
 * Remaining entries come from QR_MAPPING.
 *
 * @param {Map<number, string[]>} rowsByLine output of extractTableRows
 * @param {string} header the "{year} Q{quarter}" label for the column
 * @returns {{values: string[], boldFirst: boolean}} paste cells in order,
 *          plus a flag so buildClipboardPayloads knows to bold value[0].
 */
function buildQRPasteCells(rowsByLine, header) {
  const cells = [header, ''];
  for (const m of QR_MAPPING) {
    if (!m) {
      cells.push('');
      continue;
    }
    const row = rowsByLine.get(m.line);
    cells.push(row ? formatQRValue(row[m.col] || '', m.dashToZero) : '');
  }
  return { values: cells, boldFirst: true };
}

/**
 * Escapes text for inclusion in HTML. Values from the table should not
 * contain markup but a user-supplied unit name shouldn't be able to
 * inject either.
 */
function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Produces the text/plain and text/html payloads for the clipboard.
 *
 * Google Sheets and Excel honor a pasted single-column <table>: each
 * <tr> becomes a row and each <td> a cell. Wrapping the header's text
 * in <strong> carries the bold into the first pasted cell.
 *
 * The plain text payload is a fallback for contexts that don't accept
 * HTML — it keeps the same row layout (one cell per line) but loses
 * the bold.
 */
function buildClipboardPayloads({ values, boldFirst }) {
  const plain = values.join('\n');
  const htmlRows = values
    .map((v, i) => {
      const esc = escapeHTML(v);
      const content = (boldFirst && i === 0 && v) ? `<strong>${esc}</strong>` : esc;
      return `<tr><td>${content}</td></tr>`;
    })
    .join('');
  const html = `<meta charset="utf-8"><table><tbody>${htmlRows}</tbody></table>`;
  return { plain, html };
}

/**
 * Injects the Copy button's CSS on first call. The button is styled in a
 * deep red that rotates the page's primary teal-blue (rgb(0, 97, 132),
 * hsl(196, 100%, 26%)) to a matching-tone red (hsl(0, 100%, 35%)). Solid
 * fill + white text so it stands out against the subtle outlined Print
 * button next to it.
 */
const QR_STYLE_ID = 'lcr-helper-qr-styles';
function addQRStyles() {
  if (document.getElementById(QR_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = QR_STYLE_ID;
  style.textContent = `
    .extract-qr-button {
      text-transform: none;
      overflow: visible;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin: 0 0 0 0.5rem;
      border-radius: 0.125rem;
      cursor: pointer;
      font-weight: 600;
      max-width: 22rem;
      vertical-align: top;
      text-decoration: none;
      font-family: "Ensign:Sans", Arial, "noto sans", sans-serif;
      line-height: 1.2;
      font-size: .85rem;
      padding: 0 15px;
      background: rgb(178, 0, 0);
      color: #fff;
      border: 1px solid rgb(178, 0, 0);
      height: 33px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
    }
    .extract-qr-button:hover { background: rgb(153, 0, 0); border-color: rgb(153, 0, 0); }
    .extract-qr-button:disabled { opacity: 0.6; cursor: default; }
  `;
  document.head.appendChild(style);
}

const QR_BUTTON_ID = 'extract-qr-button-id';

/**
 * Click handler for the Copy button. Extracts the current table, builds
 * the paste block, and writes it to the clipboard. Briefly flashes the
 * button label so the user knows the copy succeeded (or failed).
 */
async function onCopyQRClick(event) {
  const button = event.currentTarget;
  const original = button.textContent;
  try {
    const rows = extractTableRows();
    if (rows.size === 0) {
      button.textContent = 'No data found';
      setTimeout(() => (button.textContent = original), 2000);
      return;
    }
    const header = readQuarterHeader();
    const cells = buildQRPasteCells(rows, header);
    const { plain, html } = buildClipboardPayloads(cells);

    // Prefer the modern ClipboardItem API so Sheets gets the bold header.
    // Fall back to writeText for browsers/contexts that don't support it.
    if (window.ClipboardItem && navigator.clipboard.write) {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
    } else {
      await navigator.clipboard.writeText(plain);
    }

    button.textContent = 'Copied!';
    setTimeout(() => (button.textContent = original), 1500);
  } catch (err) {
    console.error('[LCR Helper] Quarterly report extract failed:', err);
    button.textContent = 'Error — see console';
    setTimeout(() => (button.textContent = original), 2500);
  }
}

/**
 * Creates and inserts the Copy button next to the page's Print button.
 * Idempotent — guarded by id so MutationObserver re-runs no-op.
 */
function createExtractQRButton() {
  if (document.getElementById(QR_BUTTON_ID)) return;

  // LCR renders the Print button inside the page heading area. Find it
  // by its accessible name; fall back to placing after the <h1> if the
  // button doesn't exist yet.
  const printButton = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent.trim() === 'Print'
  );
  const heading = document.querySelector('h1');
  const anchor = printButton || heading;
  if (!anchor) return;

  // Also need the table to be rendered; otherwise the button appears
  // before there's anything to extract.
  if (!document.querySelector('[role="grid"] tbody tr')) return;

  addQRStyles();
  const button = document.createElement('button');
  button.id = QR_BUTTON_ID;
  button.type = 'button';
  button.textContent = 'Copy Salvation and Exaltation Metrics';
  button.classList.add('extract-qr-button');
  button.addEventListener('click', onCopyQRClick);
  anchor.insertAdjacentElement('afterend', button);
}

/******************* Execute Content Script *******************/
const qrObserver = new MutationObserver(() => {
  createExtractQRButton();
});
qrObserver.observe(document.body, { childList: true, subtree: true });

// In case everything is already there when the script loads.
createExtractQRButton();
