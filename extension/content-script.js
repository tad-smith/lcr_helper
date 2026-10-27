/**
 * Runs in the extension's isolated world on LCR's orgs page. Listens for
 * the interceptor's CustomEvent to capture the api/orgs payload, and
 * injects the Extract Callings button when LCR's page-header button group
 * mounts.
 */

/**
 * unitNumber (string) → `unitOrgs` array from that unit's api/orgs
 * payload. LCR fires one request per unit ticked in its unit picker and
 * caches the results client-side (re-ticking a unit doesn't refetch), so
 * we keep every payload we see rather than just the latest.
 */
const unitOrgsByUnit = new Map();

/**
 * uuid → raw LCR name (`"Last, First Middle"`) for every person in the
 * unit currently being extracted. The member-lookup fallback in
 * `fetchOneEmail` searches by name and matches the result on uuid, so
 * we keep the unformatted name here rather than on the calling object
 * (which would leak it into the callings-table URL).
 */
let lcrNameByUuid = new Map();

window.addEventListener(LCR_API_DATA_EVENT, (event) => {
  const { unitNumber, data } = event.detail || {};
  if (!unitNumber || !data || !Array.isArray(data.unitOrgs)) return;
  unitOrgsByUnit.set(String(unitNumber), data.unitOrgs);
  refreshButtonState();
});

/**
 * Flattens the nested unitOrgs tree from LCR into a flat list of calling
 * objects. Each output row has the organization name, the calling title,
 * a derived id, a vacancy flag, and (if filled) the person's name + uuid.
 * Email is filled in later by fetchMemberEmails.
 *
 * @param {Array<Object>} unitOrgData The unitOrgs array from the LCR API.
 * @returns {Array<Object>} Flat list of calling objects.
 */
function extractCallingsFromData(unitOrgData) {
  const callings = [];

  function processOrg(org) {
    const orgName = org.name;

    if (org.positions) {
      org.positions.forEach((position) => {
        const calling = {};
        calling.organization = orgName;
        calling.calling = position.positionType.name;
        calling.id = calling.organization + ':' + calling.calling.replaceAll(' ', '-');
        calling.isVacant = position.positionStatus === 'VACANT_POSITION';

        if (!calling.isVacant && position.person) {
          calling.person = formatPersonName(position.person.name);
          calling.memberProfileNumber = position.person.uuid;
          if (position.person.uuid && position.person.name) {
            lcrNameByUuid.set(position.person.uuid, position.person.name);
          }
        }

        callings.push(calling);
      });
    }

    if (org.childUnitOrgs) {
      org.childUnitOrgs.forEach((childOrg) => processOrg(childOrg));
    }
  }

  if (unitOrgData) {
    unitOrgData.forEach((org) => processOrg(org));
  }

  return callings;
}

/**
 * Converts an LCR-style `"LastName, First Middle"` name into
 * `"First LastName"` — dropping the middle name(s). Applied at the
 * point LCR data enters our pipeline so nothing downstream sees the
 * comma-prefixed form.
 *
 * Why dropping the middle: merged callings (e.g., three Aaronic
 * Priesthood Advisors) join names with `", "` in
 * `common.js::mergeCallings` so the sheet's Name column can list
 * everyone. Keeping `"First Middle"` leaks more tokens per name than
 * we can fit legibly and adds no identifying value beyond `"First"`
 * for most rows.
 *
 * Rules:
 * - Split on the FIRST comma only, so `"Smith Jr., John"` becomes
 *   `"John Smith Jr."` (the suffix stays with the surname).
 * - Take only the first whitespace-separated token of the "First
 *   Middle" chunk as the first name; everything after it is dropped.
 * - Names without a comma pass through unchanged, so manual or
 *   malformed entries don't get mangled.
 *
 * Examples:
 *   "Smith, John"                 → "John Smith"
 *   "Smith, John David"           → "John Smith"
 *   "Smith, John David Michael"   → "John Smith"
 *   "Smith Jr., John David"       → "John Smith Jr."
 *   "O'Brien, Mary"               → "Mary O'Brien"
 *   "John Smith"                  → "John Smith"   (no comma — passthrough)
 *   ""  /  null                   → ""
 */
function formatPersonName(lcrName) {
  if (!lcrName) return '';
  const s = String(lcrName).trim();
  const comma = s.indexOf(',');
  if (comma === -1) return s;
  const lastName = s.substring(0, comma).trim();
  const firstMiddle = s.substring(comma + 1).trim();
  if (!lastName) return firstMiddle.split(/\s+/)[0] || '';
  if (!firstMiddle) return lastName;
  const firstName = firstMiddle.split(/\s+/)[0];
  return firstName + ' ' + lastName;
}

/** Max simultaneous member-card fetches. LCR rate-limits aggressive callers. */
const EMAIL_FETCH_CONCURRENCY = 8;

/**
 * Runs async workers over items with a concurrency cap. Order-preserving.
 */
async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = new Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Base URL for the member-card endpoint. LCR's orgs page was rebuilt on
 * Next.js and the card moved off the LCR origin entirely:
 *
 *   old: https://lcr.churchofjesuschrist.org/mlt/api/member-card?uuid=<uuid>   (now 404)
 *   new: https://mltp-api.churchofjesuschrist.org/api/member/<uuid>/card
 *
 * The uuid is unchanged — the same `position.person.uuid` from api/orgs
 * works against the new host — and so is the response shape
 * (`{ email: { address, privacy }, ... }`).
 *
 * Because this is now cross-origin, the fetch below MUST pass
 * `credentials: 'include'`; fetch's default of `same-origin` sends no
 * cookies to mltp-api and the request is rejected outright. No new
 * host permission is needed: mltp-api grants CORS to the LCR page
 * origin, which is the origin a content-script fetch carries.
 */
const MEMBER_CARD_API_BASE = 'https://mltp-api.churchofjesuschrist.org/api/member';

/**
 * Member-lookup endpoint (the one behind LCR's "Find members" search box).
 *
 *   GET https://mltp-api.churchofjesuschrist.org/api/v2/member-lookup?term=<name>&timestamp=<ms>
 *   → { memberResults: [ { uuid, emails: [{ email }], ... }, ... ] }
 *
 * Why it exists here: the member-card endpoint honours each member's
 * contact-visibility setting relative to the *viewer*. A stake-level
 * viewer gets `email: {}` (no address, no privacy tag) for anyone whose
 * email is set below "Stake Members", even though the address is still
 * on the record. The lookup endpoint returns the address regardless, so
 * `fetchOneEmail` falls back to it — but only when the card came back
 * successfully with no address. Card network errors still return
 * 'Error' without a lookup.
 *
 * Any name format works as the term ("Last, First", "First Last", or
 * just "Last"); we pass the raw LCR name and match on uuid because a
 * surname search can return several people.
 */
const MEMBER_LOOKUP_API = 'https://mltp-api.churchofjesuschrist.org/api/v2/member-lookup';

/** Minimum spacing between consecutive member-lookup requests. */
const MEMBER_LOOKUP_MIN_INTERVAL_MS = 300;

/**
 * Serialises member-lookup calls: at most one in flight at a time, and
 * at least MEMBER_LOOKUP_MIN_INTERVAL_MS between the start of one call
 * and the start of the next. The card fetches run 8-wide; this queue
 * is deliberately independent of that so a burst of privacy-restricted
 * members can't fan out into a burst of lookups.
 */
let lookupChain = Promise.resolve();
let lastLookupStartedAt = 0;

function enqueueLookup(task) {
  const run = lookupChain.then(async () => {
    const wait = lastLookupStartedAt + MEMBER_LOOKUP_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastLookupStartedAt = Date.now();
    return task();
  });
  // Keep the chain alive even if this task rejects.
  lookupChain = run.catch(() => {});
  return run;
}

/**
 * Looks a member up by name and returns the first email on the record
 * matching `uuid`, or '' if the lookup found no address for them.
 * Throws on network / non-2xx / unparsable responses.
 */
async function lookupEmailByUuid(uuid, name) {
  const url = `${MEMBER_LOOKUP_API}?term=${encodeURIComponent(name)}&timestamp=${Date.now()}`;
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  const results = (data && data.memberResults) || [];
  const match = results.find((p) => p && p.uuid === uuid);
  if (!match || !Array.isArray(match.emails)) return '';
  const entry = match.emails.find((e) => e && e.email);
  return entry ? entry.email : '';
}

/**
 * Fetches a member's preferred email from LCR's member-card endpoint,
 * falling back to a serialised member-lookup when the card returns no
 * address (see MEMBER_LOOKUP_API). Returns 'N/A' if neither source has
 * an email, 'Error' on network failure.
 */
async function fetchOneEmail(uuid) {
  if (!uuid) return 'N/A';
  let data;
  try {
    const response = await fetch(`${MEMBER_CARD_API_BASE}/${encodeURIComponent(uuid)}/card`, {
      credentials: 'include',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } catch (error) {
    console.error(`Error fetching email for UUID ${uuid}:`, error);
    return 'Error';
  }
  if (data && data.email && data.email.address) return data.email.address;

  const name = lcrNameByUuid.get(uuid);
  if (!name) return 'N/A';
  try {
    const email = await enqueueLookup(() => lookupEmailByUuid(uuid, name));
    return email || 'N/A';
  } catch (error) {
    console.error(`Error looking up email for UUID ${uuid}:`, error);
    return 'Error';
  }
}

/**
 * Fetches an email address for every calling with a memberProfileNumber
 * and writes it back to the object in place. A single email is fetched
 * per unique uuid regardless of how many rows share it. Requests are
 * bounded by EMAIL_FETCH_CONCURRENCY to avoid overwhelming LCR.
 *
 * @param {Array<Object>} callings Calling objects; mutated in place.
 * @returns {Promise<Array<Object>>} The same array, with `.email` filled.
 */
async function fetchMemberEmails(callings) {
  const uniqueUuids = [];
  const seen = new Set();
  for (const c of callings) {
    if (c.memberProfileNumber && !seen.has(c.memberProfileNumber)) {
      seen.add(c.memberProfileNumber);
      uniqueUuids.push(c.memberProfileNumber);
    }
  }

  const emailByUuid = new Map();
  const emails = await runWithConcurrency(uniqueUuids, EMAIL_FETCH_CONCURRENCY, fetchOneEmail);
  uniqueUuids.forEach((uuid, i) => emailByUuid.set(uuid, emails[i]));

  for (const calling of callings) {
    calling.email = calling.memberProfileNumber ? emailByUuid.get(calling.memberProfileNumber) : '';
  }
  return callings;
}

/**
 * Pulls the ward/branch name off the LCR orgs page by walking up from the
 * "Filter Results" input to an unclassed wrapper div, then reading a
 * button sibling. The LCR DOM shape this depends on is fragile — if LCR
 * restructures it, this returns "Unknown Unit" and the new tab's title
 * will be blank. That's the first thing to check when the title breaks.
 *
 * @returns {string} The ward name, or "Unknown Unit" if not found.
 */
function extractUnitName() {
  const filterInput = document.querySelector('div#partner-content input[placeholder="Filter Results"]');
  if (!filterInput) return 'Unknown Unit';

  let searchDiv = filterInput.parentElement;
  // Walk up until we find an unclassed <div>, stopping at #partner-content.
  while (searchDiv && (searchDiv.tagName !== 'DIV' || searchDiv.className !== '')) {
    const parent = searchDiv.parentElement;
    if (!parent) return 'Unknown Unit';
    if (parent.id === 'partner-content') return 'Unknown Unit';
    searchDiv = parent;
  }
  if (!searchDiv) return 'Unknown Unit';

  const unitDiv = searchDiv.nextElementSibling;
  if (!unitDiv || unitDiv.tagName !== 'DIV') return 'Unknown Unit';

  const button = unitDiv.querySelector('button');
  if (!button) return 'Unknown Unit';

  const divs = button.getElementsByTagName('div');
  for (let i = 0; i < divs.length; i++) {
    if (divs[i].className === '') return divs[i].textContent.trim();
  }
  return 'Unknown Unit';
}

/**
 * Sends the (email-augmented) calling list to the service worker so it
 * can open the callings-table page in a new tab. Resolves once the tab
 * is requested; rejects if the service worker doesn't confirm.
 */
function openCallingsTab(callings, ward) {
  const message = {
    action: MSG_OPEN_CALLINGS_TABLE,
    callings: callings,
    ward: ward,
  };
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (response && response.status === 'Tab creation requested.') {
        resolve();
      } else {
        reject(new Error('Failed to open tab or no response received.'));
      }
    });
  });
}

/******************* Unit selection + button state *******************/

/**
 * How long to wait for LCR's own api/orgs request after a unit is
 * selected before fetching it ourselves. LCR's request typically takes
 * ~1.5 s to land; the page never issues one for a unit it rendered
 * server-side (the stake on first load) or already has cached.
 */
const SELF_FETCH_DELAY_MS = 2500;

/** Units we've already self-fetched (or are fetching), so we try once. */
const selfFetchAttempted = new Set();
/** Units whose self-fetch hasn't settled yet. */
const selfFetchPending = new Set();
let selfFetchTimer = null;
let selfFetchTimerUnit = null;

/** True while an extraction (email fetch) is in flight. */
let extracting = false;
/** Last extraction error, cleared on the next click or selection change. */
let extractError = false;
let lastSelectionKey = null;

/**
 * Unit numbers currently ticked in LCR's unit picker — the first
 * multi-select in the Filter Results row (the second one is the
 * Organizations filter). Each unit checkbox's value is its unit
 * number; non-numeric values ("All Wards") are skipped.
 *
 * @returns {string[]|null} Selected unit numbers, or null if the picker
 *   isn't on the page.
 */
function getSelectedUnitNumbers() {
  const filterInput = document.querySelector('div#partner-content input[placeholder="Filter Results"]');
  const row = filterInput && filterInput.closest('.eden-row');
  const picker = row && row.querySelector('.multi-select__styled-stack');
  if (!picker) return null;
  return [...picker.querySelectorAll('input[type="checkbox"]')]
    .filter((box) => box.checked && /^\d+$/.test(box.value))
    .map((box) => box.value);
}

/**
 * Fetches a unit's api/orgs payload directly, for selections LCR serves
 * without a request of its own. Same GET the page makes; the content
 * script's fetch is same-origin, so the session cookie goes with it.
 */
async function selfFetchUnit(unitNumber) {
  selfFetchAttempted.add(unitNumber);
  selfFetchPending.add(unitNumber);
  refreshButtonState();
  try {
    const url = `${location.origin}/mlt/api/orgs?unitNumber=${encodeURIComponent(unitNumber)}`;
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.unitOrgs)) throw new Error('No unitOrgs in response');
    unitOrgsByUnit.set(unitNumber, data.unitOrgs);
  } catch (error) {
    console.error(`LCR Helper: could not load unit ${unitNumber}:`, error);
  }
  selfFetchPending.delete(unitNumber);
  refreshButtonState();
}

/** Starts (or keeps) the delayed self-fetch for `unitNumber`. */
function scheduleSelfFetch(unitNumber) {
  if (selfFetchAttempted.has(unitNumber)) return;
  if (selfFetchTimer && selfFetchTimerUnit === unitNumber) return;
  clearTimeout(selfFetchTimer);
  selfFetchTimerUnit = unitNumber;
  selfFetchTimer = setTimeout(() => {
    selfFetchTimer = null;
    selfFetchTimerUnit = null;
    if (unitOrgsByUnit.has(unitNumber)) return;
    const selected = getSelectedUnitNumbers();
    if (selected && selected.length === 1 && selected[0] === unitNumber) {
      selfFetchUnit(unitNumber);
    }
  }, SELF_FETCH_DELAY_MS);
}

/**
 * Applies one of three looks to the button:
 * - `ready`: enabled, red, "Extract Callings".
 * - `loading`: disabled, faded red — the unit's data hasn't arrived yet.
 * - `unavailable`: disabled, grey — nothing extractable is selected.
 */
function setButtonState(button, state, text) {
  button.disabled = state !== 'ready';
  button.classList.toggle('extract-callings-button--unavailable', state === 'unavailable');
  button.title = state === 'unavailable' ? text : '';
  if (button.textContent !== text) button.textContent = text;
}

/**
 * Recomputes the button from the unit picker and the captured data.
 * Enabled only when exactly one unit is ticked AND that unit's api/orgs
 * payload has been captured. Called on every DOM mutation and picker
 * change, so it must stay cheap and idempotent.
 */
function refreshButtonState() {
  const button = document.getElementById('extract-callings-button-id');
  if (!button || extracting) return;

  const selected = getSelectedUnitNumbers();
  const selectionKey = selected ? selected.join(',') : '';
  if (selectionKey !== lastSelectionKey) {
    lastSelectionKey = selectionKey;
    extractError = false;
  }

  if (!selected || selected.length !== 1) {
    clearTimeout(selfFetchTimer);
    selfFetchTimer = null;
    selfFetchTimerUnit = null;
    setButtonState(button, 'unavailable', 'Select one unit to extract');
    return;
  }

  const unitNumber = selected[0];
  if (unitOrgsByUnit.has(unitNumber)) {
    setButtonState(button, 'ready', extractError ? 'Error (Retry)' : 'Extract Callings');
    return;
  }

  if (selfFetchAttempted.has(unitNumber) && !selfFetchPending.has(unitNumber)) {
    // Our own fetch for this unit already ran and failed.
    setButtonState(button, 'unavailable', "Couldn't load unit — reload the page");
    return;
  }

  setButtonState(button, 'loading', 'Loading unit…');
  scheduleSelfFetch(unitNumber);
}

/**
 * Click handler for the Extract Callings button. Only reachable when
 * refreshButtonState has enabled it, i.e. exactly one unit is selected
 * and its data is loaded. Holds the button disabled during the async
 * email fetch so a double-click can't fire two extraction cycles.
 */
function extractCallingsHandler(event) {
  const button = event.target;
  const selected = getSelectedUnitNumbers();
  if (!selected || selected.length !== 1 || !unitOrgsByUnit.has(selected[0])) {
    refreshButtonState();
    return;
  }

  // Snapshot everything tied to the selection now; the user may change
  // the picker while emails are loading.
  lcrNameByUuid = new Map();
  const callings = extractCallingsFromData(unitOrgsByUnit.get(selected[0]));
  const ward = extractUnitName();

  extracting = true;
  extractError = false;
  setButtonState(button, 'loading', 'Loading Callings...');

  fetchMemberEmails(callings)
    .then((withEmails) => openCallingsTab(withEmails, ward))
    .catch((error) => {
      console.error(error);
      extractError = true;
    })
    .finally(() => {
      extracting = false;
      refreshButtonState();
    });
}

// LCR's page-header button group (the one holding Print), beside the
// "Organizations" heading. LCR's old `#role-picker-container` anchor was
// removed in the Oct 2026 redesign; if the button vanishes again, check
// this selector first.
const BUTTON_ANCHOR_SELECTOR = '.page-container__button-container';

/**
 * Builds the Extract Callings button and puts it first in LCR's
 * page-header button group. Idempotent — the observer below can call it
 * repeatedly and only the first call has any effect.
 */
function createExtractCallingsButton() {
  if (document.getElementById('extract-callings-button-id')) return;

  const anchor = document.querySelector(BUTTON_ANCHOR_SELECTOR);
  if (!anchor) return;

  addExtensionStyles();
  const button = document.createElement('button');
  button.id = 'extract-callings-button-id';
  button.type = 'button';
  button.classList.add('extract-callings-button');
  anchor.insertAdjacentElement('afterbegin', button);
  button.addEventListener('click', extractCallingsHandler);
  refreshButtonState();
}

/******************* Execute Content Script *******************/
// Checkbox ticks don't show up as DOM mutations, so listen for them too.
// The table re-render that follows a selection does trigger the observer.
document.addEventListener('change', refreshButtonState, true);

const observer = new MutationObserver(() => {
  if (!document.getElementById('extract-callings-button-id')) {
    createExtractCallingsButton();
  } else {
    refreshButtonState();
  }
});
observer.observe(document.body, { childList: true, subtree: true });

createExtractCallingsButton();

// Inject the interceptor into the page's world.
const script = document.createElement('script');
script.src = chrome.runtime.getURL('interceptor.js');
script.onload = function () { this.remove(); };
(document.head || document.documentElement).appendChild(script);
