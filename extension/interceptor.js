(function () {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
        const response = await originalFetch(...args);

        // Clone the response so we can read the body without consuming the stream for the original requester
        const clone = response.clone();

        // Check if URL matches the pattern we're interested in
        // Pattern: https://lcr.churchofjesuschrist.org/mlt/api/orgs?unitNumber=491829
        let url = args[0];
        if (url instanceof Request) {
            url = url.url;
        }
        if (url && url.toString().includes('api/orgs')) {
            clone.json().then(data => {
                console.log('Intercepted api/orgs data:');
                console.log(data);
                window.dispatchEvent(new CustomEvent('LCR_API_DATA_RECEIVED', { detail: data }));
            }).catch(err => {
                console.error('Error parsing JSON from intercepted request:', err);
            });
        }

        return response;
    };
})();
