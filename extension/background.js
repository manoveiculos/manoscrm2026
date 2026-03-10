
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
                    // Se for 404, retornamos sucesso falso mas com o status, para não gerar erro no log do Chrome
                    if (response.status === 404) {
                        console.log("Manos CRM Background: Recurso não encontrado (404) -", request.url);
                        return sendResponse({ success: false, error: '404' });
                    }
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                sendResponse({ success: true, data });
            })
            .catch(error => {
                // Apenas logamos como erro real se não for 404
                console.error("Manos CRM Background: Erro na requisição", request.url, error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep channel open
    }
});
