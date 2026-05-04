document.getElementById('save-btn').onclick = () => {
    const token = document.getElementById('crm-token').value.trim();
    const email = document.getElementById('crm-consultant-email').value.trim();
    const name = document.getElementById('crm-consultant-name').value.trim();

    chrome.storage.local.set({
        crmToken: token,
        crmConsultantEmail: email,
        crmConsultantName: name,
    }, () => {
        document.getElementById('status-msg').style.display = 'block';
        setTimeout(() => {
            document.getElementById('status-msg').style.display = 'none';
            window.close();
        }, 1500);
    });
};

chrome.storage.local.get(['crmToken', 'crmConsultantEmail', 'crmConsultantName'], (result) => {
    if (result.crmToken) document.getElementById('crm-token').value = result.crmToken;
    if (result.crmConsultantEmail) document.getElementById('crm-consultant-email').value = result.crmConsultantEmail;
    if (result.crmConsultantName) document.getElementById('crm-consultant-name').value = result.crmConsultantName;
});
