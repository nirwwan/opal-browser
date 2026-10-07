chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'opal-test', title: 'Opal test item', contexts: ['page'] });
});
chrome.action.setBadgeText({ text: '7' });
