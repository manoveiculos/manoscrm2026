
document.getElementById('save-btn').onclick = () => {
    const url = document.getElementById('crm-url').value;
    const token = document.getElementById('crm-token').value;

    chrome.storage.local.set({
        crmUrl: url,
        crmToken: token
    }, () => {
        document.getElementById('status-msg').style.display = 'block';
        setTimeout(() => {
            document.getElementById('status-msg').style.display = 'none';
            window.close();
        }, 1500);
    });
};

chrome.storage.local.get(['crmUrl', 'crmToken'], (result) => {
    if (result.crmUrl) document.getElementById('crm-url').value = result.crmUrl;
    if (result.crmToken) document.getElementById('crm-token').value = result.crmToken;
});
