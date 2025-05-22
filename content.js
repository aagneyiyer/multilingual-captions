let lastUrl = location.href;
let captionDisplay = null;
let displayInterval = null;
let currentCues = [];
let currentSettings = null;

// Language mapping for Microsoft Transliteration API
const LANG_SCRIPT_MAP = {
    'hi': { script: 'Deva' },  // Devanagari
    'zh': { script: 'Hans' },  // Chinese Simplified
    'ja': { script: 'Jpan' },  // Japanese
    'ko': { script: 'Kore' },  // Korean
    'ar': { script: 'Arab' },  // Arabic
    'th': { script: 'Thai' },  // Thai
    'en': { script: 'Latn' }   // Latin
};

// Listen for settings from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'APPLY_SETTINGS') {
        currentSettings = message.settings;
        extractAndDisplayCaptions();
    }
});

function createCaptionDisplay() {
    const div = document.createElement('div');
    div.id = 'custom-captions-display';
    div.style.position = 'fixed';
    div.style.bottom = '80px';
    div.style.left = '50%';
    div.style.transform = 'translateX(-50%)';
    div.style.color = 'white';
    div.style.padding = '8px 16px';
    div.style.borderRadius = '4px';
    div.style.fontFamily = 'Roboto, Arial, sans-serif';
    div.style.fontSize = '18px';
    div.style.zIndex = '9999';
    div.style.maxWidth = '80%';
    div.style.textAlign = 'center';
    div.style.display = 'none';
    div.style.pointerEvents = 'none';
    document.body.appendChild(div);
    return div;
}

function parseSubtitles(subtitleText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(subtitleText, 'text/xml');
    const textNodes = doc.getElementsByTagName('text');
    const cues = [];
    
    const decodeHTML = (text) => {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = text;
        return textarea.value;
    };

    Array.from(textNodes).forEach((node) => {
        const start = parseFloat(node.getAttribute('start'));
        const dur = parseFloat(node.getAttribute('dur') || '0');
        const end = start + dur;
        const text = decodeHTML(node.textContent);
        cues.push({ start, end, text });
    });

    return cues;
}

async function processText(text) {
    if (!currentSettings?.msTransliterationKey) {
        console.error('No API key found');
        return text;
    }

    const sourceLanguage = currentSettings.sourceLanguage;
    const targetLanguage = currentSettings.targetLanguage;
    
    try {
        if (currentSettings.mode === 'transliterate') {
            return await transliterateText(text, sourceLanguage, targetLanguage);
        } else {
            return await translateText(text, sourceLanguage, targetLanguage);
        }
    } catch (error) {
        console.error('Error processing text:', error);
        return text;
    }
}

async function transliterateText(text, sourceLanguage, targetLanguage) {
    if (!LANG_SCRIPT_MAP[sourceLanguage] || !LANG_SCRIPT_MAP[targetLanguage]) {
        console.error('Unsupported language combination for transliteration:', sourceLanguage, targetLanguage);
        return text;
    }

    const fromScript = LANG_SCRIPT_MAP[sourceLanguage].script;
    const toScript = LANG_SCRIPT_MAP[targetLanguage].script;
    
    console.log('Using script configuration:', { fromScript, toScript });
    
    try {
        const url = 'https://api.cognitive.microsofttranslator.com/transliterate?api-version=3.0' +
            `&language=${sourceLanguage}` +
            `&fromScript=${fromScript}` +
            `&toScript=${toScript}`;
            
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': currentSettings.msTransliterationKey,
                'Ocp-Apim-Subscription-Region': 'westus2',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify([{ Text: text }])
        });

        if (!response.ok) {
            throw new Error(`Transliteration request failed: ${response.status}`);
        }

        const data = await response.json();
        return data[0]?.text || text;
    } catch (error) {
        console.error('Transliteration error:', error);
        return text;
    }
}

async function translateText(text, sourceLanguage, targetLanguage) {
    try {
        const url = 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0' +
            `&from=${sourceLanguage}` +
            `&to=${targetLanguage}`;
            
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': currentSettings.msTransliterationKey,
                'Ocp-Apim-Subscription-Region': 'westus2',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify([{ Text: text }])
        });

        if (!response.ok) {
            throw new Error(`Translation request failed: ${response.status}`);
        }

        const data = await response.json();
        return data[0]?.translations[0]?.text || text;
    } catch (error) {
        console.error('Translation error:', error);
        return text;
    }
}

function startCaptionDisplay(cues) {
    if (!captionDisplay) {
        captionDisplay = createCaptionDisplay();
    }
    captionDisplay.style.display = 'block';
    currentCues = cues;

    const videoElement = document.querySelector('video');
    if (!videoElement) return;

    let lastText = '';
    let lastProcessedText = '';

    async function updateCaption() {
        const currentTime = videoElement.currentTime;
        const activeCue = currentCues.find(cue => 
            currentTime >= cue.start && currentTime <= cue.end
        );

        if (activeCue) {
            try {
                // Only process if the text has changed
                if (activeCue.text !== lastText) {
                    console.log('Caption text changed, processing:', activeCue.text);
                    lastText = activeCue.text;
                    lastProcessedText = await processText(activeCue.text);
                    console.log('Processed result:', lastProcessedText);
                }
                captionDisplay.textContent = lastProcessedText;
            } catch (error) {
                console.error('Error in updateCaption:', error);
                captionDisplay.textContent = activeCue.text; // Fallback to original text
            }
        } else {
            captionDisplay.textContent = '';
            lastText = '';
            lastProcessedText = '';
        }
    }

    if (displayInterval) clearInterval(displayInterval);
    displayInterval = setInterval(updateCaption, 100);
}

function stopCaptionDisplay() {
    if (captionDisplay) {
        captionDisplay.style.display = 'none';
        captionDisplay.textContent = '';
    }
    if (displayInterval) {
        clearInterval(displayInterval);
        displayInterval = null;
    }
}

async function getSubtitleTracks() {
    try {
        const videoId = new URLSearchParams(window.location.search).get('v');
        if (!videoId) return null;

        // Try multiple methods to get caption tracks
        // Method 1: From player response
        const moviePlayer = document.getElementById('movie_player');
        if (moviePlayer && typeof moviePlayer.getPlayerResponse === 'function') {
            const playerResponse = moviePlayer.getPlayerResponse();
            if (playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
                return playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
            }
        }

        // Method 2: From ytInitialPlayerResponse in the page source
        const scriptRegex = /ytInitialPlayerResponse\s*=\s*({.+?});/;
        const scripts = document.getElementsByTagName('script');
        
        for (const script of scripts) {
            const match = script.textContent.match(scriptRegex);
            if (match) {
                try {
                    const data = JSON.parse(match[1]);
                    if (data?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
                        return data.captions.playerCaptionsTracklistRenderer.captionTracks;
                    }
                } catch (e) {
                    console.error('Error parsing script content:', e);
                }
            }
        }

        // Method 3: Try parsing from page HTML
        const ytInitialData = document.body.innerHTML.match(/ytInitialPlayerResponse\s*=\s*({.+?});/)?.[1];
        if (ytInitialData) {
            try {
                const data = JSON.parse(ytInitialData);
                if (data?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
                    return data.captions.playerCaptionsTracklistRenderer.captionTracks;
                }
            } catch (e) {
                console.error('Error parsing ytInitialData:', e);
            }
        }

        // Method 4: Direct API request as a last resort
        const response = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`);
        const text = await response.text();
        const ytInitialDataMatch = text.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
        
        if (ytInitialDataMatch) {
            try {
                const data = JSON.parse(ytInitialDataMatch[1]);
                if (data?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
                    return data.captions.playerCaptionsTracklistRenderer.captionTracks;
                }
            } catch (e) {
                console.error('Error parsing ytInitialData from response:', e);
            }
        }

        return null;
    } catch (error) {
        console.error('Error fetching subtitle tracks:', error);
        return null;
    }
}

async function extractAndDisplayCaptions() {
    try {
        if (!currentSettings) {
            console.error('No settings available');
            return;
        }

        const tracks = await getSubtitleTracks();
        if (!tracks || tracks.length === 0) {
            console.error('No subtitles available for this video');
            return;
        }

        // Find the track that matches the user's preferred language
        const preferredTrack = tracks.find(track => track.languageCode === currentSettings.sourceLanguage) || tracks[0];
        
        const response = await fetch(preferredTrack.baseUrl);
        const subtitleText = await response.text();
        
        const cues = parseSubtitles(subtitleText);
        startCaptionDisplay(cues);

    } catch (error) {
        console.error('Error processing subtitles:', error);
    }
}

// Add this function to initialize the extension
async function initializeExtension() {
    try {
        // Try to load settings if they exist
        const settings = await chrome.storage.sync.get({
            sourceLanguage: 'en',
            targetLanguage: 'en',
            mode: 'translate',
            displayType: 'translated',
            msTransliterationKey: ''
        });
        
        currentSettings = settings;
        
        // If we're on a video page, extract and display captions
        if (location.pathname === '/watch') {
            extractAndDisplayCaptions();
        }
    } catch (error) {
        console.error('Error initializing extension:', error);
    }
}

// Watch for URL changes
const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        if (location.pathname === '/watch') {
            // Reset caption state when URL changes
            stopCaptionDisplay();
            // Try to get captions regardless of YouTube's caption state
            initializeExtension();
        } else {
            stopCaptionDisplay();
        }
    }
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Initialize on page load
initializeExtension();

// Also initialize if we're already on a watch page
if (location.pathname === '/watch') {
    setTimeout(() => {
        initializeExtension();
    }, 1000); // Small delay to ensure the page is fully loaded
}