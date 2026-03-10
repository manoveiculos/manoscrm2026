
// Manos CRM - Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
    console.log("Manos CRM Extension Installed and Ready!");
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'FETCH_DATA') {
        console.log("Manos CRM Background: Fetching", request.url);

        fetch(request.url, request.options || {})
            .then(async response => {
                if (!response.ok) {
                    let errorDetails = `HTTP ${response.status}`;
                    try {
                        const errorJson = await response.json();
                        errorDetails = errorJson.error || errorJson.message || errorDetails;
                    } catch (e) {
                        // Não é JSON
                    }
                    console.error("Manos CRM Background: Erro na API -", errorDetails);
                    if (request.options && request.options.body) {
                        console.log("Manos CRM Background: Request Body Enviado ->", request.options.body);

                        if (errorDetails.toLowerCase().includes('bigint')) {
                            console.warn("Manos CRM Background: ERRO DE BIGINT! Verifique o campo leadId no body acima.");
                        }
                    }
                    return sendResponse({ success: false, error: errorDetails });
                }
                const data = await response.json();
                sendResponse({ success: true, data });
            })
            .catch(error => {
                console.error("Manos CRM Background: Erro de Rede/Script", error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep channel open
    }
});
