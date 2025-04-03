// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
    // Set default settings
    chrome.storage.sync.set({
        language: 'en',
        displayType: 'translated'
    });
}); 