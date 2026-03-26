(async () => {
    try {
        const src = chrome.runtime.getURL('content/index.js');
        await import(src);
        console.log("Manos CRM v2: Loaded ✅");
    } catch (err) {
        console.error("Manos CRM v2: Load failed ❌", err);
    }
})();
