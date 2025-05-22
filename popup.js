const YT_API_KEY = "AIzaSyCRl5Yh4mabGYU56dKR7YP9OTUnC-nItlY";
const MS_TRANSLITERATION_KEY = "34GJqJNyIQ4bZyiN7R4ITu2licD661X1tqPFGQNgzUNoS3ADfVmQJQQJ99BDAC8vTInXJ3w3AAAbACOGtPrx";

document.addEventListener('DOMContentLoaded', async () => {
    // Load saved preferences
    const settings = await chrome.storage.sync.get({
        language: 'hi'
    });

    document.getElementById('language').value = settings.language;

    document.getElementById('applySettings').addEventListener('click', async () => {
        const language = document.getElementById('language').value;

        // Save preferences
        await chrome.storage.sync.set({
            language
        });

        // Get current tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (tab.url.includes('youtube.com/watch')) {
            // Get video metadata using YouTube API
            const videoId = new URL(tab.url).searchParams.get('v');
            const metadata = await fetchMetadata(videoId);
            
            // Send settings and metadata to content script
            await chrome.tabs.sendMessage(tab.id, {
                type: 'APPLY_SETTINGS',
                settings: {
                    language,
                    vidLang: metadata[0].code,
                    hasCaption: metadata.some(lang => lang.type === 'caption'),
                    msTransliterationKey: MS_TRANSLITERATION_KEY
                }
            });

            document.getElementById('status').textContent = 'Settings applied!';
            setTimeout(() => {
                document.getElementById('status').textContent = '';
            }, 2000);
        } else {
            document.getElementById('status').textContent = 'Please open a YouTube video first!';
        }
    });
});

// Helper function to get human-readable language names
function getLanguageName(code) {
    if (!code) return 'Unknown';
    try {
        // Use Intl.DisplayNames if available
        const displayName = new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
        return displayName || code.toUpperCase();
    } catch (e) {
        // Fallback for basic language codes if Intl.DisplayNames fails or code is non-standard
        const langMap = {
            'en': 'English', 'es': 'Spanish', 'hi': 'Hindi', 'zh': 'Chinese',
            'fr': 'French', 'de': 'German', 'ja': 'Japanese', 'ko': 'Korean',
            'ar': 'Arabic', 'ru': 'Russian', 'pt': 'Portuguese', 'it': 'Italian'
            // Add more common codes as needed
        };
        return langMap[code.toLowerCase()] || code.toUpperCase();
    }
}

async function fetchMetadata(videoId) {
    try {
        // Fetch video details
        const videoUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YT_API_KEY}`;
        const videoResponse = await fetch(videoUrl);
        const videoData = await videoResponse.json();

        if (!videoData.items || videoData.items.length === 0) {
            console.warn('Video not found or API key issue for video details.');
            // Return a default structure even if video details fail, so UI can show something
            return [{ code: 'en', name: 'English (Default)', type: 'default' }];
        }

        const video = videoData.items[0];
        const videoLanguageCode = video.snippet.defaultLanguage || video.snippet.defaultAudioLanguage;

        const fromLanguages = [];
        const addedLangCodes = new Set(); // To avoid duplicates

        if (videoLanguageCode) {
            const langName = getLanguageName(videoLanguageCode);
            fromLanguages.push({
                code: videoLanguageCode,
                name: `${langName} (Video Language)`,
                type: 'video'
            });
            addedLangCodes.add(videoLanguageCode);
        }

        // Fetch caption tracks
        const captionsUrl = `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${YT_API_KEY}`;
        const captionsResponse = await fetch(captionsUrl);
        const captionsData = await captionsResponse.json();

        if (captionsData.items && captionsData.items.length > 0) {
            captionsData.items.forEach(caption => {
                const langCode = caption.snippet.language;
                if (langCode && !addedLangCodes.has(langCode)) {
                    // caption.snippet.name can be like "English" or "English (auto-generated)"
                    const captionDisplayName = caption.snippet.name || getLanguageName(langCode);
                    fromLanguages.push({
                        code: langCode,
                        name: `${captionDisplayName} (Caption)`,
                        type: 'caption'
                    });
                    addedLangCodes.add(langCode);
                }
            });
        }
        
        // If no languages were found from video or captions, add a default
        if (fromLanguages.length === 0) {
             fromLanguages.push({
                code: 'en',
                name: 'English (Default)',
                type: 'default'
            });
        }

        return fromLanguages; // This is now an array of {code, name, type}

    } catch (error) {
        console.error('Error fetching metadata:', error);
        // Return a default structure on error, e.g., English
        return [{ code: 'en', name: 'English (Error - Default)', type: 'error' }];
    }
}