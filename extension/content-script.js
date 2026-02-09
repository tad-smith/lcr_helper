/**
 * This script is run in the context of the active tab.
 */
let unitOrgData = null;
let unitOrgDataCallings = null;

window.addEventListener('LCR_API_DATA_RECEIVED', (event) => {
  unitOrgData = event.detail.unitOrgs;
  unitOrgDataCallings = extractCallingsFromData(unitOrgData);
  console.log('Content script received unitOrgData:', unitOrgData);
  console.log('Content script extracted callings:', unitOrgDataCallings);
});


/**
 * Extracts callings from the provided unitOrgData JSON object.
 * 
 * @param {Array<Object>} unitOrgData The array of unit organization data.
 * @returns {Array<Object>} The extracted list of callings.
 */
function extractCallingsFromData(unitOrgData) {
  const callings = [];

  function processOrg(org) {
    const orgName = org.name;

    if (org.positions) {
      org.positions.forEach(position => {
        const calling = {};
        calling.organization = orgName;
        calling.calling = position.positionType.name;
        calling.id = calling.organization + ':' + calling.calling.replaceAll(' ', '-');
        calling.isVacant = position.positionStatus === 'VACANT_POSITION';

        if (!calling.isVacant && position.person) {
          calling.person = position.person.name;
          calling.memberProfileNumber = position.person.uuid;
          // calling.profileLink is intentionally left blank
        }

        callings.push(calling);
      });
    }

    if (org.childUnitOrgs) {
      org.childUnitOrgs.forEach(childOrg => processOrg(childOrg));
    }
  }

  if (unitOrgData) {
    unitOrgData.forEach(org => processOrg(org));
  }

  return callings;
}

/**
 * Fetches profile emails for a list of members and adds the email attribute to each object.
 * @param {Array<Object>} callings - An array of objects, each with a "memberProfileNumber" attribute (which is the UUID).
 * @returns {Promise<Array<Object>>} A promise that resolves to the updated array of objects.
 */
async function fetchMemberEmails(callings) {
  // Use a map to store promises for each unique UUID to avoid duplicate requests
  const emailPromises = new Map();

  // Helper function to fetch email for a single UUID
  async function getEmail(uuid) {
    if (!uuid) return 'N/A';

    try {
      const response = await fetch(`https://lcr.churchofjesuschrist.org/mlt/api/member-card?uuid=${uuid}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      if (data.email && data.email.address) {
        return data.email.address;
      } else {
        return 'N/A';
      }
    } catch (error) {
      console.error(`Error fetching email for UUID ${uuid}:`, error);
      return 'Error';
    }
  }

  // Iterate through callings and initiate fetch if not already in progress
  for (const calling of callings) {
    if (calling.memberProfileNumber && !emailPromises.has(calling.memberProfileNumber)) {
      emailPromises.set(calling.memberProfileNumber, getEmail(calling.memberProfileNumber));
    }
  }

  // Wait for all promises to resolve
  // functionality: we want to update the calling objects in place
  await Promise.all(callings.map(async (calling) => {
    if (calling.memberProfileNumber) {
      calling.email = await emailPromises.get(calling.memberProfileNumber);
    } else {
      calling.email = '';
    }
  }));

  return callings;
}

/**
 * Extracts the unit name from the page.
 * Finds the "Filter Results" input, goes up to its parent div with no class,
 * then finds the next sibling div, which contains a button with the unit name.
 * @returns {string} The unit name, or "Unknown Unit" if not found.
 */
function extractUnitName() {
  const filterInput = document.querySelector('div#partner-content input[placeholder="Filter Results"]');
  if (!filterInput) return "Unknown Unit";

  let searchDiv = filterInput.parentElement;
  // Traverse up until we find a div with no class
  while (searchDiv && (searchDiv.tagName !== 'DIV' || searchDiv.className !== '')) {
    searchDiv = searchDiv.parentElement;
    if (searchDiv.id === 'partner-content') return "Unknown Unit"; // Safety check
  }

  if (!searchDiv) return "Unknown Unit";

  const unitDiv = searchDiv.nextElementSibling;
  if (!unitDiv || unitDiv.tagName !== 'DIV') return "Unknown Unit";

  const button = unitDiv.querySelector('button');
  if (!button) return "Unknown Unit";

  // Find a div with no class inside the button
  const divs = button.getElementsByTagName('div');
  for (let i = 0; i < divs.length; i++) {
    if (divs[i].className === '') {
      return divs[i].textContent.trim();
    }
  }

  return "Unknown Unit";
}

/**
 * Processes an array of raw calling data, extracts the current organizational unit
 * (Ward), and sends a message to the Service Worker (or background script) to open
 * a new extension tab to display the results.
 *
 * This function handles the final data preparation before delegating the UI task 
 * to a privileged extension context via message passing.
 *
 * @param {Array<Object>} callingsInput The raw array of calling objects extracted 
 * from the webpage.
 * @returns {void}
 * * @global {function} mergeCallings - Required function to group and merge 
 * duplicate calling entries in the input array.
 * @global {function} extractUnitName - Required function to retrieve the name of the 
 * current organizational unit (Ward/Branch).
 * @fires {chrome.runtime.sendMessage} Sends a message to the extension's background 
 * script with the merged data and the Ward name, requesting a new tab be opened.
 */
function openNewTabWithHTML(callings, button) {
  console.log(callings);

  const message = {
    action: 'openCallingsTable',
    callings: callings,
    ward: extractUnitName(),
  };
  chrome.runtime.sendMessage(message, (response) => {
    // This callback fires when the Service Handler calls sendResponse()
    if (response && response.status === 'Tab creation requested.') {
      // Re-enable the button once the action is complete
      button.disabled = false;
      button.textContent = 'Extract Callings';
      console.log('Tab opened and button re-enabled.');
    } else {
      console.error('Failed to open tab or no response received.');
      // Handle error state if necessary
      button.disabled = false;
      button.textContent = 'Error (Retry)';
    }
  });
}

/**
 * Handles the click event for the "Extract Callings" button, orchestrating 
 * the entire data extraction, augmentation, and display process.
 *
 * This function performs the following asynchronous chain of operations:
 * 1. Extracts the initial calling data from the current webpage's DOM.
 * 2. Augments the extracted data by asynchronously fetching email addresses 
 * for the associated members.
 * 3. Sends the final, complete calling data to a function that prepares 
 * and opens a new extension tab for display.
 *
 * @param {Event} event The DOM event object (typically a mouse click) 
 * that triggered the function.
 * @returns {void}
 * * @global {function(): Array<Object>} extractCallings - Required function to 
 * extract raw calling data from the DOM.
 * @global {function(Array<Object>): Promise<Array<Object>>} fetchMemberEmails - 
 * Required asynchronous function to augment calling data with member emails.
 * @global {function(Array<Object>): void} openNewTabWithHTML - Required function 
 * to process the final data and initiate the opening of the display tab.
 */
function extractCallingsHandler(event) {
  console.log('Extract Callings button clicked!');
  const button = event.target;

  // Disable the button
  button.disabled = false;
  button.textContent = 'Loading Callings...';

  fetchMemberEmails(unitOrgDataCallings)
    .then(callings => openNewTabWithHTML(callings, button))
    .catch((error) => {
      console.error(error);
    });
}

/**
 * Creates the "Extract Callings" button element with the specified styles 
 * and structure, and attaches an event listener.
 * * @returns {HTMLButtonElement} The fully constructed button element.
 */
function createExtractCallingsButton() {
  // 1. Check to see if the button exists
  let button = document.getElementById('extract-callings-button-id');
  if (button) {
    console.log("'extract-callings-button-id' button already exists.");
    return;
  }

  // 2. Create the main button element
  addExtensionStyles();
  button = document.createElement('button');
  button.id = 'extract-callings-button-id';
  button.textContent = 'Extract Callings';
  button.type = 'button'; // Good practice for buttons
  button.classList.add('extract-callings-button');

  // 3. Add the button to the page
  let rolePicker = document.getElementById('role-picker-container');

  if (rolePicker) {
    // 4. Insert the container (with the button inside) immediately after the reference element
    // 'beforebegin' places the new element immediately before the reference element.
    rolePicker.insertAdjacentElement('beforebegin', button);
    console.log('Button successfully inserted before #role-picker-container.');
  } else {
    console.error("Role Picker element with ID 'role-picker-container' not found.");
  }

  // 4. Attach an event listener for the button's action
  button.addEventListener('click', extractCallingsHandler);
}

/******************* Execute Content Script *******************/
console.log('Content script loaded.');
const observer = new MutationObserver((mutations) => {
  const rolePicker = document.getElementById('role-picker-container');
  const button = document.getElementById('extract-callings-button-id');

  if (rolePicker && !button) {
    createExtractCallingsButton();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Initial check
const rolePicker = document.getElementById('role-picker-container');
if (rolePicker) {
  createExtractCallingsButton();
}

// Inject the interceptor script
const script = document.createElement('script');
script.src = chrome.runtime.getURL('interceptor.js');
script.onload = function () {
  this.remove();
};
(document.head || document.documentElement).appendChild(script);
