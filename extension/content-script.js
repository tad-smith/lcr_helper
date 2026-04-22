/**
 * Runs in the extension's isolated world on LCR's orgs page. Listens for
 * the interceptor's CustomEvent to capture the api/orgs payload, and
 * injects the Extract Callings button when LCR's role-picker mounts.
 */

let unitOrgData = null;
let unitOrgDataCallings = null;

window.addEventListener(LCR_API_DATA_EVENT, (event) => {
  unitOrgData = event.detail.unitOrgs;
  unitOrgDataCallings = extractCallingsFromData(unitOrgData);
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
          calling.person = position.person.name;
          calling.memberProfileNumber = position.person.uuid;
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
 * Fetches a member's preferred email from LCR's member-card endpoint.
 * Returns 'N/A' if the response has no email, 'Error' on network failure.
 */
async function fetchOneEmail(uuid) {
  if (!uuid) return 'N/A';
  try {
    const response = await fetch(`https://lcr.churchofjesuschrist.org/mlt/api/member-card?uuid=${uuid}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data && data.email && data.email.address ? data.email.address : 'N/A';
  } catch (error) {
    console.error(`Error fetching email for UUID ${uuid}:`, error);
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
 * can open the callings-table page in a new tab.
 */
function openCallingsTab(callings, button) {
  const message = {
    action: MSG_OPEN_CALLINGS_TABLE,
    callings: callings,
    ward: extractUnitName(),
  };
  chrome.runtime.sendMessage(message, (response) => {
    if (response && response.status === 'Tab creation requested.') {
      button.disabled = false;
      button.textContent = 'Extract Callings';
    } else {
      console.error('Failed to open tab or no response received.');
      button.disabled = false;
      button.textContent = 'Error (Retry)';
    }
  });
}

/**
 * Click handler for the Extract Callings button. Disables the button
 * during the async fetch so a double-click can't fire two extraction
 * cycles. Requires the interceptor to have already captured an api/orgs
 * response; if not, prompts the user to re-navigate.
 */
function extractCallingsHandler(event) {
  const button = event.target;

  if (!unitOrgDataCallings) {
    button.textContent = 'Data not ready — reload the ward';
    return;
  }

  button.disabled = true;
  button.textContent = 'Loading Callings...';

  fetchMemberEmails(unitOrgDataCallings)
    .then((callings) => openCallingsTab(callings, button))
    .catch((error) => {
      console.error(error);
      button.disabled = false;
      button.textContent = 'Error (Retry)';
    });
}

/**
 * Builds the Extract Callings button and inserts it before LCR's
 * role-picker container. Idempotent — the observer below can call it
 * repeatedly and only the first call has any effect.
 */
function createExtractCallingsButton() {
  if (document.getElementById('extract-callings-button-id')) return;

  addExtensionStyles();
  const button = document.createElement('button');
  button.id = 'extract-callings-button-id';
  button.textContent = 'Extract Callings';
  button.type = 'button';
  button.classList.add('extract-callings-button');

  const rolePicker = document.getElementById('role-picker-container');
  if (!rolePicker) {
    console.error("Role Picker element with ID 'role-picker-container' not found.");
    return;
  }
  rolePicker.insertAdjacentElement('beforebegin', button);
  button.addEventListener('click', extractCallingsHandler);
}

/******************* Execute Content Script *******************/
const observer = new MutationObserver(() => {
  const rolePicker = document.getElementById('role-picker-container');
  const button = document.getElementById('extract-callings-button-id');
  if (rolePicker && !button) createExtractCallingsButton();
});
observer.observe(document.body, { childList: true, subtree: true });

if (document.getElementById('role-picker-container')) {
  createExtractCallingsButton();
}

// Inject the interceptor into the page's world.
const script = document.createElement('script');
script.src = chrome.runtime.getURL('interceptor.js');
script.onload = function () { this.remove(); };
(document.head || document.documentElement).appendChild(script);
