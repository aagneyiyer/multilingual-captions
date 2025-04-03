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
                    vidLang: metadata.language,
                    hasCaption: metadata.hasCaption,
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
        return {
            language: video.snippet.defaultLanguage || video.snippet.defaultAudioLanguage || 'en',
            hasCaption: captionsData.items && captionsData.items.length > 0
        };
    } catch (error) {
        console.error('Error fetching metadata:', error);
        return {
            language: 'en',
            hasCaption: false
        };
    }
}