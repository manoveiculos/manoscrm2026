const fs = require('fs');
const path = require('path');
const uiPath = path.join(__dirname, '..', 'extension', 'content', 'ui.js');

let content = fs.readFileSync(uiPath, 'utf8');

// Replace button code
content = content.replace(
    '<button class="close-alert" id="manos-alert-close">&times;</button>',
    '<div class="controls"><button class="btn-next" id="manos-alert-next" style="display:none;">PRÓXIMO</button><button class="close-alert" id="manos-alert-close">&times;</button></div>'
);

// Replace add visible
content = content.replace(
    "this.alertBar.classList.add('visible');",
    "this.alertBar.classList.add('visible');\n        const waApp = document.getElementById('app');\n        if (waApp) {\n            waApp.style.position = 'relative';\n            waApp.style.top = '36px';\n            waApp.style.height = 'calc(100% - 36px)';\n        }"
);

// Replace remove visible
content = content.replace(
    "this.alertBar.classList.remove('visible');",
    "this.alertBar.classList.remove('visible');\n        const waApp = document.getElementById('app');\n        if (waApp) {\n            waApp.style.top = '0px';\n            waApp.style.height = '100%';\n        }"
);

fs.writeFileSync(uiPath, content);
console.log('ui.js updated successfully');
