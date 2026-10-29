document.getElementById('open-audit')?.addEventListener('click',()=>chrome.tabs.create({url:chrome.runtime.getURL('dashboard/dashboard.html#/audit')}));
