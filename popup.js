document.addEventListener('DOMContentLoaded', async () => {
  const languageSelect = document.getElementById('language');
  const translatedRadio = document.getElementById('translated');
  const transliteratedRadio = document.getElementById('transliterated');
  const statusElement = document.getElementById('status');

  // Load saved preferences
  chrome.storage.sync.get(['language', 'displayMode'], (result) => {
    if (result.language) {
      languageSelect.value = result.language;
    }
    if (result.displayMode) {
      if (result.displayMode === 'translated') {
        translatedRadio.checked = true;
      } else {
        transliteratedRadio.checked = true;
      }
    }
  });

  // Save preferences and notify content script when changes are made
  const savePreferences = async () => {
    const preferences = {
      language: languageSelect.value,
      displayMode: translatedRadio.checked ? 'translated' : 'transliterated'
    };

    // Save to storage
    await chrome.storage.sync.set(preferences);

    // Notify content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('youtube.com/watch')) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'PREFERENCES_UPDATED',
        preferences
      });
      
      showStatus('Settings saved!', 'success');
    }
  };

  // Event listeners
  languageSelect.addEventListener('change', savePreferences);
  translatedRadio.addEventListener('change', savePreferences);
  transliteratedRadio.addEventListener('change', savePreferences);

  function showStatus(message, type) {
    statusElement.textContent = message;
    statusElement.className = `status-message ${type}`;
    setTimeout(() => {
      statusElement.style.display = 'none';
    }, 3000);
  }

  // Check if we're on a YouTube video page
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes('youtube.com/watch')) {
    showStatus('Please navigate to a YouTube video', 'error');
    languageSelect.disabled = true;
    translatedRadio.disabled = true;
    transliteratedRadio.disabled = true;
  }
}); 