importScripts('constants.js');

/*
 * Listen for the content script to open a tab.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === MSG_OPEN_CALLINGS_TABLE) {
    openCallingsTableTab(request.callings, request.ward);
    sendResponse({ status: 'Tab creation requested.' });
  }
});

/**
 * Opens the callings table page in a new tab immediately after the caller's
 * tab. Ward and the merged calling list are passed as query parameters;
 * URLSearchParams handles the percent-encoding itself — callers must pass
 * raw values, not pre-encoded ones.
 */
function openCallingsTableTab(callings, ward) {
  const baseUrl = chrome.runtime.getURL(TABLE_PAGE);
  const urlParams = new URLSearchParams();
  urlParams.set('ward', ward);
  urlParams.set('callings', JSON.stringify(callings));
  const finalUrl = `${baseUrl}?${urlParams.toString()}`;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) {
      console.error('Could not find active tab.');
      return;
    }
    const nextIndex = tabs[0].index + 1;
    chrome.tabs.create({ url: finalUrl, index: nextIndex, active: true });
  });
}
