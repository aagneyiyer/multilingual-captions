let lastUrl = location.href;
let subtitleButton = null;
let lastVideoId = null;
let isDisplayingCaptions = false;
let displayInterval = null;
let captionDisplay = null;
let currentCues = [];

function createSubtitleButton() {
    const button = document.createElement('button');
    button.classList.add('ytp-subtitle-extract-button');
    button.innerHTML = `Get Captions`;
    return button;
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

function processSubtitles(cues, settings) {
    let output = '';

    if (settings.fileFormat === 'srt' && settings.includeTimestamp) {
        cues.forEach((cue, index) => {
            const start = formatTime(cue.start);
            const end = formatTime(cue.end);
            output += `${index + 1}\n${start} --> ${end}\n${cue.text}\n\n`;
        });
    } else if (settings.fileFormat === 'vtt' && settings.includeTimestamp) {
        output = 'WEBVTT\n\n';
        cues.forEach(cue => {
            const start = formatTimeVTT(cue.start);
            const end = formatTimeVTT(cue.end);
            output += `${start} --> ${end}\n${cue.text}\n\n`;
        });
    } else {
        cues.forEach(cue => {
            if (settings.includeTimestamp) {
                const start = formatTime(cue.start);
                output += `[${start}] `;
            }
            output += `${cue.text}\n`;
        });
    }

    return output;
}

function formatTime(seconds) {
    const pad = (num) => num.toString().padStart(2, '0');
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${ms.toString().padStart(3, '0')}`;
}

function formatTimeVTT(seconds) {
    const pad = (num) => num.toString().padStart(2, '0');
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}.${ms.toString().padStart(3, '0')}`;
}

function createCaptionDisplay() {
    const div = document.createElement('div');
    div.id = 'custom-captions-display';
    div.style.position = 'fixed';
    div.style.bottom = '80px';
    div.style.left = '50%';
    div.style.transform = 'translateX(-50%)';
    // div.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
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

function startCaptionDisplay(cues) {
    if (!captionDisplay) {
        captionDisplay = createCaptionDisplay();
    }
    captionDisplay.style.display = 'block';
    currentCues = cues;

    const videoElement = document.querySelector('video');
    if (!videoElement) return;

    function updateCaption() {
        const currentTime = videoElement.currentTime;
        const activeCue = currentCues.find(cue => 
            currentTime >= cue.start && currentTime <= cue.end
        );
        captionDisplay.textContent = activeCue ? activeCue.text : '';
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

async function extractSubtitles() {
    try {
        const settings = await chrome.storage.sync.get({
            outputType: 'clipboard',
            fileFormat: 'srt',
            includeTimestamp: true
        });

        const tracks = await getSubtitleTracks();
        if (!tracks || tracks.length === 0) {
            alert('No subtitles available for this video');
            return;
        }

        const track = tracks[0];
        const response = await fetch(track.baseUrl);
        const subtitleText = await response.text();
        
        const cues = parseSubtitles(subtitleText);
        const processedSubtitles = processSubtitles(cues, settings);
        
        await navigator.clipboard.writeText(processedSubtitles);

        if (isDisplayingCaptions) {
            stopCaptionDisplay();
        } else {
            startCaptionDisplay(cues);
        }
        isDisplayingCaptions = !isDisplayingCaptions;

    } catch (error) {
        console.error('Error processing subtitles:', error);
        alert('Failed to process subtitles. Please try again.');
    }
}

function injectButton() {
    const existingButtons = document.querySelectorAll('.ytp-subtitle-extract-button');
    existingButtons.forEach(button => button.remove());

    const titleContainer = document.querySelector('#above-the-fold #title');
    
    if (!titleContainer) {
        setTimeout(injectButton, 1000);
        return;
    }

    titleContainer.classList.add('title-container-with-button');

    subtitleButton = createSubtitleButton();
    subtitleButton.addEventListener('click', extractSubtitles);
    titleContainer.appendChild(subtitleButton);
}

async function getSubtitleTracks() {
    try {
        const videoId = new URLSearchParams(window.location.search).get('v');
        if (!videoId) return null;

        if (lastVideoId !== videoId) {
            lastVideoId = videoId;
            delete window.ytInitialPlayerResponse;
        }

        const moviePlayer = document.getElementById('movie_player');
        if (moviePlayer && moviePlayer.getPlayerResponse) {
            const playerResponse = moviePlayer.getPlayerResponse();
            if (playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
                return playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
            }
        }

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

        const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache'
            }
        });
        const html = await response.text();
        const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
        if (match) {
            const data = JSON.parse(match[1]);
            if (data?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
                return data.captions.playerCaptionsTracklistRenderer.captionTracks;
            }
        }

        return null;
    } catch (error) {
        console.error('Error fetching subtitle tracks:', error);
        return null;
    }
}

const observer = new MutationObserver((mutations) => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        if (location.pathname === '/watch') {
            setTimeout(injectButton, 1000);
        }
    } else if (location.pathname === '/watch') {
        const existingButton = document.querySelector('.ytp-subtitle-extract-button');
        const titleContainer = document.querySelector('#above-the-fold #title h1.ytd-watch-metadata');
        if (!existingButton && titleContainer) {
            setTimeout(injectButton, 1000);
        }
    }
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

if (location.pathname === '/watch') {
    setTimeout(injectButton, 1000);
} 

// Rest of the original functions (getSubtitleTracks, injectButton, etc.) remain the same
// ... [Keep the existing getSubtitleTracks, injectButton, and observer code unchanged] ...