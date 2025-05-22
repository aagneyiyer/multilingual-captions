const YT_API_KEY = "AIzaSyCRl5Yh4mabGYU56dKR7YP9OTUnC-nItlY";
const MS_TRANSLITERATION_KEY = "34GJqJNyIQ4bZyiN7R4ITu2licD661X1tqPFGQNgzUNoS3ADfVmQJQQJ99BDAC8vTInXJ3w3AAAbACOGtPrx";

// Available scripts for transliteration
const SCRIPTS = [
    { code: 'en', name: 'Latin' },
    { code: 'hi', name: 'Devanagari' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'ar', name: 'Arabic' },
    { code: 'th', name: 'Thai' }
];

// Available languages for translation
const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh', name: 'Chinese' },
    { code: 'hi', name: 'Hindi' },
    { code: 'ar', name: 'Arabic' },
    { code: 'ru', name: 'Russian' }
];

// Helper function to get language display name
function getLanguageName(code, type = '') {
    const names = {
        'hi': 'Devanagari',
        'zh': 'Chinese',
        'en': 'Latin',
        'ja': 'Japanese',
        'ko': 'Korean',
        'ar': 'Arabic',
        'th': 'Thai'
    };
    const displayName = names[code] || code.toUpperCase();
    return type ? `${displayName} (${type})` : displayName;
}

document.addEventListener('DOMContentLoaded', async () => {
    // Load saved preferences
    const settings = await chrome.storage.sync.get({
        mode: 'transliterate',
        fromLanguage: '',
        toLanguage: 'en',
        msTransliterationKey: MS_TRANSLITERATION_KEY
    });

    const modeSelect = document.getElementById('mode');
    const fromSelect = document.getElementById('fromLanguage');
    const toSelect = document.getElementById('toLanguage');

    // Set initial mode
    modeSelect.value = settings.mode;

    // Handle mode changes
    modeSelect.addEventListener('change', () => {
        updateToOptions(modeSelect.value);
    });

    // Get current tab and populate languages if it's a YouTube video
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.url.includes('youtube.com/watch')) {
        const videoId = new URL(tab.url).searchParams.get('v');
        const languages = await fetchMetadata(videoId);
        
        // Populate "from" language dropdown
        fromSelect.innerHTML = languages.map(lang => 
            `<option value="${lang.code}" ${lang.code === settings.fromLanguage ? 'selected' : ''}>
                ${lang.name}
            </option>`
        ).join('');
        
        // Set default if no saved preference
        if (!settings.fromLanguage && languages.length > 0) {
            settings.fromLanguage = languages[0].code;
        }
    }

    // Initial population of "to" options based on mode
    updateToOptions(settings.mode, settings.toLanguage);

    document.getElementById('applySettings').addEventListener('click', async () => {
        const mode = modeSelect.value;
        const fromLanguage = fromSelect.value;
        const toLanguage = toSelect.value;

        // Save preferences
        await chrome.storage.sync.set({
            mode,
            fromLanguage,
            toLanguage
        });

        if (tab.url.includes('youtube.com/watch')) {
            // Send settings to content script
            await chrome.tabs.sendMessage(tab.id, {
                type: 'APPLY_SETTINGS',
                settings: {
                    mode,
                    sourceLanguage: fromLanguage,
                    targetLanguage: toLanguage,
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

function updateToOptions(mode, selectedValue = '') {
    const toSelect = document.getElementById('toLanguage');
    const options = mode === 'transliterate' ? SCRIPTS : LANGUAGES;
    
    toSelect.innerHTML = options.map(item => 
        `<option value="${item.code}" ${item.code === selectedValue ? 'selected' : ''}>
            ${item.name}
        </option>`
    ).join('');
}

async function fetchMetadata(videoId) {
    try {
        // Fetch video details
        const videoUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YT_API_KEY}`;
        const videoResponse = await fetch(videoUrl);
        const videoData = await videoResponse.json();

        if (!videoData.items || videoData.items.length === 0) {
            throw new Error('Video not found');
        }

        // Fetch caption tracks
        const captionsUrl = `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${YT_API_KEY}`;
        const captionsResponse = await fetch(captionsUrl);
        const captionsData = await captionsResponse.json();

        const video = videoData.items[0];
        const languages = [];

        // Add video's default language
        const defaultLang = video.snippet.defaultLanguage || video.snippet.defaultAudioLanguage;
        if (defaultLang) {
            languages.push({
                code: defaultLang,
                name: getLanguageName(defaultLang, 'Video Language'),
                type: 'video'
            });
        }

        // Add caption tracks
        if (captionsData.items && captionsData.items.length > 0) {
            captionsData.items.forEach(caption => {
                const langCode = caption.snippet.language;
                if (!languages.some(l => l.code === langCode)) {
                    languages.push({
                        code: langCode,
                        name: getLanguageName(langCode, 'Caption'),
                        type: 'caption'
                    });
                }
            });
        }

        return languages;
    } catch (error) {
        console.error('Error fetching metadata:', error);
        return [];
    }
}