chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => { document.getElementById('n').textContent = tabs.length + ' tab'; });
chrome.action.setBadgeText({ text: '7' });
