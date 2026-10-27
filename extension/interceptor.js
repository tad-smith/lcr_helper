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
      // Tag the payload with its unit so the content script can tell
      // which picker selection it belongs to. LCR fires one request per
      // ticked unit and caches results, so "latest response" is not
      // the same as "currently selected unit".
      const unitNumber = new URL(url.toString(), location.href).searchParams.get('unitNumber');
      // Clone so the original caller's body stream is untouched.
      response.clone().json().then((data) => {
        window.dispatchEvent(new CustomEvent(LCR_API_DATA_EVENT, { detail: { unitNumber, data } }));
      }).catch((err) => {
        console.error('Error parsing JSON from intercepted request:', err);
      });
    }

    return response;
  };
})();
