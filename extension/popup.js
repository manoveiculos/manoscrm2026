
document.getElementById('save-btn').onclick = () => {
    const url = document.getElementById('crm-url').value;
    chrome.storage.local.set({ crmUrl: url }, () => {
        document.getElementById('status-msg').style.display = 'block';
        setTimeout(() => {
            document.getElementById('status-msg').style.display = 'none';
            window.close();
        }, 1500);
    });
};

chrome.storage.local.get(['crmUrl'], (result) => {
    if (result.crmUrl) {
        document.getElementById('crm-url').value = result.crmUrl;
    }
});
