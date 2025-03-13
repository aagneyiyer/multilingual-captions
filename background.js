// Listen for installation or update
chrome.runtime.onInstalled.addListener(() => {
  // Set default preferences
  chrome.storage.sync.set({
    language: 'en',
    displayMode: 'translated'
  });
});

// Listen for tab updates to inject content script when needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com/watch')) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
  }
}); 