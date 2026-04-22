/*
 * Runs in the page's JS context (not the extension's isolated world), so
 * it can monkey-patch window.fetch. Dispatches a CustomEvent that the
 * content script listens for. The event name must match
 * LCR_API_DATA_EVENT in extension/constants.js — kept in sync manually
 * since this file cannot import extension globals.
 */
(function () {
  const LCR_API_DATA_EVENT = 'LCR_API_DATA_RECEIVED';
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    let url = args[0];
    if (url instanceof Request) url = url.url;

    if (url && url.toString().includes('api/orgs')) {
      // Clone so the original caller's body stream is untouched.
      response.clone().json().then((data) => {
        window.dispatchEvent(new CustomEvent(LCR_API_DATA_EVENT, { detail: data }));
      }).catch((err) => {
        console.error('Error parsing JSON from intercepted request:', err);
      });
    }

    return response;
  };
})();
