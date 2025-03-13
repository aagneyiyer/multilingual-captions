// Global state
let currentPreferences = null;
let captionsInterval = null;
let lastProcessedTime = -1;

// Initialize when the script loads
async function initialize() {
  // Load saved preferences
  const result = await chrome.storage.sync.get(['language', 'displayMode']);
  currentPreferences = {
    language: result.language || 'en',
    displayMode: result.displayMode || 'translated'
  };

  // Start processing captions
  startCaptionProcessing();
}

// Listen for preference updates from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PREFERENCES_UPDATED') {
    currentPreferences = message.preferences;
    startCaptionProcessing(); // Restart processing with new preferences
  }
});

async function startCaptionProcessing() {
  if (captionsInterval) {
    clearInterval(captionsInterval);
  }

  // Create or get caption container
  let captionContainer = document.getElementById('multilingual-caption-container');
  if (!captionContainer) {
    captionContainer = document.createElement('div');
    captionContainer.id = 'multilingual-caption-container';
    document.body.appendChild(captionContainer);
  }

  // Style the caption container
  captionContainer.style.position = 'fixed';
  captionContainer.style.bottom = '100px';
  captionContainer.style.left = '50%';
  captionContainer.style.transform = 'translateX(-50%)';
  captionContainer.style.zIndex = '9999';
  captionContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  captionContainer.style.color = 'white';
  captionContainer.style.padding = '10px 20px';
  captionContainer.style.borderRadius = '4px';
  captionContainer.style.fontSize = '18px';
  captionContainer.style.textAlign = 'center';
  captionContainer.style.maxWidth = '80%';
  captionContainer.style.display = 'none';

  // Get video metadata using YouTube Data API
  const videoId = getYouTubeVideoId();
  if (!videoId) return;

  try {
    const metadata = await fetchVideoMetadata(videoId);
    const captionTrack = metadata.items[0].captions;
    
    // Start monitoring for captions
    captionsInterval = setInterval(async () => {
      const video = document.querySelector('video');
      if (!video) return;

      const currentTime = Math.floor(video.currentTime);
      if (currentTime === lastProcessedTime) return;
      
      lastProcessedTime = currentTime;
      
      // Find the current caption based on timestamp
      const currentCaption = findCaptionAtTime(captionTrack, currentTime);
      if (!currentCaption) {
        captionContainer.style.display = 'none';
        return;
      }

      // Process caption based on preferences
      let processedCaption;
      if (currentPreferences.displayMode === 'translated') {
        processedCaption = await translateText(currentCaption.text, currentPreferences.language);
      } else {
        processedCaption = await transliterateText(currentCaption.text, currentPreferences.language);
      }

      // Display the processed caption
      captionContainer.textContent = processedCaption;
      captionContainer.style.display = 'block';
    }, 100);
  } catch (error) {
    console.error('Error processing captions:', error);
  }
}

// Helper function to get YouTube video ID from URL
function getYouTubeVideoId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('v');
}

// Function to fetch video metadata using YouTube Data API
async function fetchVideoMetadata(videoId) {
  // Note: You'll need to implement this using your YouTube Data API key
  // This is a placeholder for the actual API call
  const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,captions&id=${videoId}&key=YOUR_API_KEY`);
  return await response.json();
}

// Function to find the current caption based on timestamp
function findCaptionAtTime(captionTrack, currentTime) {
  // Implement caption search logic based on timestamp
  // This will need to be adapted based on how you're storing/receiving caption data
  return captionTrack.find(caption => 
    currentTime >= caption.start && currentTime <= caption.end
  );
}


// Function to translate text using Google Cloud Translation API
async function translateText(text, targetLanguage) {
    const GOOGLE_API_KEY = 'AIzaSyBZQ68uFun8EWAc1Nhv66YbbpLT3Y8VJvA';
    try {
    const response = await fetch('https://translation.googleapis.com/language/translate/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GOOGLE_API_KEY}` // You should store this securely
      },
      body: JSON.stringify({
        q: text,
        target: targetLanguage,
        format: 'text'
      })
    });

    if (!response.ok) {
      throw new Error(`Translation API error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.data || !data.data.translations || !data.data.translations[0]) {
      throw new Error('Invalid translation response format');
    }

    return data.data.translations[0].translatedText;
  } catch (error) {
    console.error('Translation error:', error);
    return `[Translation Error: ${error.message}]`;
  }
}

// Function to transliterate text using Azure API
async function transliterateText(text, targetLanguage) {
  // Note: You'll need to implement this using your Azure API key
  // This is a placeholder for the actual API call
  const response = await fetch('https://api.cognitive.microsofttranslator.com/transliterate?api-version=3.0', {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': 'EyJgDQiG3uLokL8wfwiknDsAAeVCm29jFQKRMxIEQG6PtbbAxwIuJQQJ99BCAC8vTInXJ3w3AAAbACOGRW1S',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([{
      text: text,
      language: targetLanguage,
      fromScript: 'Latn',
      toScript: getScriptForLanguage(targetLanguage)
    }])
  });
  const data = await response.json();
  return data[0].text;
}

// Helper function to get the appropriate script code for transliteration
function getScriptForLanguage(language) {
  const scriptMap = {
    'hi': 'Deva', // Devanagari for Hindi
    'ja': 'Jpan', // Japanese
    'zh': 'Hans', // Simplified Chinese
    'en': 'Latn'  // Latin script for English
  };
  return scriptMap[language] || 'Latn';
}

// Start the extension
initialize(); 