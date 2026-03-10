/**
 * Manos CRM - Content Script Loader
 * This script bootstraps the modular ES6 content scripts.
 */

(async () => {
    try {
        const src = chrome.runtime.getURL('content/index.js');
        await import(src);
        console.log("Manos CRM: Modular system loaded successfully ✅");
    } catch (err) {
        console.error("Manos CRM: Failed to load modular scripts ❌", err);
    }
})();
