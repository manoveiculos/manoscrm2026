
document.getElementById('save-btn').onclick = () => {
    const token = document.getElementById('crm-token').value;

    chrome.storage.local.set({ crmToken: token }, () => {
        document.getElementById('status-msg').style.display = 'block';
        setTimeout(() => {
            document.getElementById('status-msg').style.display = 'none';
            window.close();
        }, 1500);
    });
};

chrome.storage.local.get(['crmToken'], (result) => {
    if (result.crmToken) document.getElementById('crm-token').value = result.crmToken;
});
