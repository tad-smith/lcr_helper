
/*
 * Listen for the content script to open a tab.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openCallingsTable") {
    openNewTabWithHTML(request.callings, request.ward);

    // Acknowledge receipt (optional, but good practice)
    sendResponse({ status: "Tab creation requested." }); 
  }
});

/**     
 * Opens a specific HTML page from the extension package and passes dynamic data
 * as a URL parameter.
 *
 * @param {string} pageFileName - The name of the HTML file (e.g., "dashboard.html").
 * @param {object} params - An object containing key-value pairs to pass as URL parameters.
 */
function openNewTabWithHTML(callings, ward) {
  // 1. Get the base URL for the internal HTML page
  const baseUrl = chrome.runtime.getURL('callings-table.html');
 
  // 2. Safely construct the query string
  const urlParams = new URLSearchParams();
  
  // You can also stringify and encode complex objects here, 
  // e.g., if params.data was an array of objects:
  console.log(callings);
  urlParams.set('ward', encodeURIComponent(ward));
  urlParams.set('callings', encodeURIComponent(JSON.stringify(callings)));
    
  // 3. Combine the base URL and the query string
  const finalUrl = `${baseUrl}?${urlParams.toString()}`;
    
  // 4. Open the new tab/window
  // Step 1: Query the active tab in the current window
  console.log(`Opening new tab: ${finalUrl}`);
  chrome.tabs.query({ 
      active: true, 
      currentWindow: true 
  }, (tabs) => {
    
    if (tabs.length === 0) {
      console.error("Could not find active tab.");
      return;
    }

    // tabs[0] is the current active tab
    const currentTab = tabs[0];
    
    // Step 2: Calculate the index for the new tab
    // The index should be immediately after the current tab
    const nextIndex = currentTab.index + 1; 

    // Step 3: Create the new tab with the calculated index
    chrome.tabs.create({
      url: finalUrl,
      index: nextIndex,
      active: true // Opens the new tab in the foreground
    }, (newTab) => {
      console.log(`Opened new tab: ${newTab}`);
      console.log(newTab);
    });
  });
}

