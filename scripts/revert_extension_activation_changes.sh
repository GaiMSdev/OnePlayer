#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cat > "$ROOT_DIR/OnePlayer Extension/Resources/background.js" <<'EOF'
// background.js: Kraftig Traffic Controller for OnePlayer
browser.runtime.onMessage.addListener((message, sender) => {
    if (message.action === 'notify_playing') {
        const currentTabId = sender.tab?.id;
        if (!currentTabId) return;

        browser.tabs.query({ url: '*://*.youtube.com/*' }).then((tabs) => {
            tabs.forEach(tab => {
                if (tab.id !== currentTabId) {
                    // BRUTE FORCE: Tving pause via direkte injeksjon (mest stabil i Safari 18)
                    browser.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: () => {
                            const videos = document.querySelectorAll('video');
                            videos.forEach(v => {
                                if (!v.paused) v.pause();
                            });
                        }
                    }).catch(() => {
                        // Backup: Vanlig melding hvis injection er blokkert
                        browser.tabs.sendMessage(tab.id, { action: 'pause_playback' }).catch(() => {});
                    });
                }
            });
        });
    }
});
EOF

cat > "$ROOT_DIR/OnePlayer Extension/Resources/content.js" <<'EOF'
// content.js - Forbedret med innstillings-støtte
let pauseEnabled = true;
let pipEnabled = true;
let isPiPActive = false;

// 1. Last innstillinger
browser.storage.local.get(['pauseEnabled', 'pipEnabled']).then((result) => {
    pauseEnabled = result.pauseEnabled !== false;
    pipEnabled = result.pipEnabled !== false;
});

// 2. Lytt etter oppdateringer fra popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'update_settings') {
        pauseEnabled = message.pauseEnabled;
        pipEnabled = message.pipEnabled;
        if (!pipEnabled && document.pictureInPictureElement) {
            document.exitPictureInPicture().catch(() => {});
        }
        sendResponse({ status: "ok" });
    } else if (message.action === 'pause_playback') {
        if (!pauseEnabled) {
            sendResponse({ status: "disabled" });
            return;
        }
        const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
        if (v && !v.paused) v.pause();
        sendResponse({ status: "paused" });
    } else if (message.action === 'save_time') {
        const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
        if (v && v.currentTime > 0) {
            // Lagre tid i sessionStorage for denne spesifikke fanen
            sessionStorage.setItem('oneplayer_restore_time', v.currentTime);
            sessionStorage.setItem('oneplayer_was_playing', !v.paused);
        }
        sendResponse({ status: "saved" });
    }
});

// Gjenopprett tid etter oppdatering
window.addEventListener('load', () => {
    const savedTime = sessionStorage.getItem('oneplayer_restore_time');
    if (savedTime) {
        sessionStorage.removeItem('oneplayer_restore_time');
        const wasPlaying = sessionStorage.getItem('oneplayer_was_playing') === 'true';
        sessionStorage.removeItem('oneplayer_was_playing');
        
        // Prøv å finne video og sette tid (kan kreve polling siden YouTube bygger opp DOMen tregt)
        let attempts = 0;
        const interval = setInterval(() => {
            const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
            if (v && v.readyState >= 1) {
                v.currentTime = parseFloat(savedTime);
                if (wasPlaying) {
                    v.play().catch(() => {});
                }
                clearInterval(interval);
            }
            attempts++;
            if (attempts > 20) clearInterval(interval); // Gi opp etter 10 sekunder
        }, 500);
    }
});

// 3. Sticky PiP med 75% scroll-grense
let scrollTimeout;
function handleScroll() {
    if (!pipEnabled || !location.pathname.startsWith('/watch')) return;
    
    // Bruker requestAnimationFrame for jevnere bevegelse/sjekk
    if (scrollTimeout) cancelAnimationFrame(scrollTimeout);
    
    scrollTimeout = requestAnimationFrame(() => {
        const video = document.querySelector('video.html5-main-video');
        if (!video || video.paused) return;

        const rect = video.getBoundingClientRect();
        const videoHeight = rect.height;
        
        // Sjekker om 75% av videoen er scrollet ut av syne (toppen er negativ)
        // rect.top er avstanden fra viewport-toppen til videoens topp.
        // Når rect.top < -(videoHeight * 0.75), betyr det at 75% er over toppen.
        const threshold = -(videoHeight * 0.75);

        if (rect.top < threshold && video.webkitPresentationMode !== 'picture-in-picture') {
            isPiPActive = true;
            try { video.webkitSetPresentationMode('picture-in-picture'); } catch (e) {}
        } else if (rect.top > threshold && video.webkitPresentationMode === 'picture-in-picture') {
            isPiPActive = false;
            try { video.webkitSetPresentationMode('inline'); } catch (e) {}
        }
    });
}
window.addEventListener('scroll', handleScroll, { passive: true });

// 4. Play-event
document.addEventListener('play', (e) => {
    if (!pauseEnabled) return;
    const video = e.target;
    if (video.tagName === 'VIDEO' && !video.muted && video.volume > 0) {
        if (video.closest('#inline-preview-player')) return; 
        browser.runtime.sendMessage({ action: 'notify_playing' }).catch(() => {});
    }
}, true);
EOF

cat > "$ROOT_DIR/OnePlayer Extension/Resources/popup.js" <<'EOF'
document.addEventListener('DOMContentLoaded', () => {
    const pauseToggle = document.getElementById('pauseToggle');
    const pipToggle = document.getElementById('pipToggle');
    const refreshBtn = document.getElementById('refreshBtn');

    // 1. Last innstillinger
    browser.storage.local.get(['pauseEnabled', 'pipEnabled']).then((result) => {
        pauseToggle.checked = result.pauseEnabled !== false;
        pipToggle.checked = result.pipEnabled !== false;
    });

    // 2. Synkroniser innstillinger
    const update = () => {
        const settings = {
            pauseEnabled: pauseToggle.checked,
            pipEnabled: pipToggle.checked
        };
        browser.storage.local.set(settings);
        browser.tabs.query({ url: '*://*.youtube.com/*' }).then(tabs => {
            tabs.forEach(tab => {
                browser.tabs.sendMessage(tab.id, { action: 'update_settings', ...settings }).catch(() => {});
            });
        });
    };

    pauseToggle.addEventListener('change', update);
    pipToggle.addEventListener('change', update);

    // 3. Refresh-knapp med state-lagring
    refreshBtn.addEventListener('click', () => {
        refreshBtn.innerText = 'Refreshing...';
        
        browser.tabs.query({ url: '*://*.youtube.com/*' }).then(tabs => {
            tabs.forEach(tab => {
                // Be content script lagre tiden, og reload fanen fra utvidelsen etterpå
                browser.tabs.sendMessage(tab.id, { action: 'save_time' }).then(() => {
                    browser.tabs.reload(tab.id);
                }).catch(() => {
                    // Fallback hvis content script ikke svarer
                    browser.tabs.reload(tab.id);
                });
            });
            setTimeout(() => { refreshBtn.innerText = 'Refresh YouTube Tabs'; }, 1000);
        });
    });
});
EOF

cat > "$ROOT_DIR/OnePlayer Extension/Resources/popup.html" <<'EOF'
<!DOCTYPE html>
<html lang="no">
<head>
    <meta charset="UTF-8">
    <style>
        * {
            box-sizing: border-box;
            -webkit-user-select: none;
        }
        html, body {
            width: 320px;
            margin: 0;
            padding: 0;
            background: #0f172a;
            font-family: -apple-system, sans-serif;
            color: white;
            overflow: hidden;
        }
        .container {
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
        }
        .logo {
            width: 36px;
            height: 36px;
            background: #2563eb url('images/icon-64.png') no-repeat center center;
            background-size: 26px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
        }
        .play-triangle {
            display: none;
        }
        h1 { font-size: 20px; margin: 0; font-weight: 700; letter-spacing: -0.02em; }
        
        .card {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 18px;
            padding: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .label-group { display: flex; flex-direction: column; gap: 2px; }
        .label-main { font-size: 14px; font-weight: 600; }
        .label-sub { font-size: 11px; color: rgba(255, 255, 255, 0.5); }

        /* iOS Switch */
        .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider {
            position: absolute; cursor: pointer; inset: 0;
            background-color: rgba(255,255,255,0.15);
            transition: .2s cubic-bezier(0.4, 0, 0.2, 1);
            border-radius: 24px;
        }
        .slider:before {
            position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px;
            background-color: white; transition: .2s cubic-bezier(0.4, 0, 0.2, 1);
            border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        input:checked + .slider { background-color: #3b82f6; }
        input:checked + .slider:before { transform: translateX(20px); }

        button {
            width: 100%;
            background: rgba(59, 130, 246, 0.1);
            border: 1px solid rgba(59, 130, 246, 0.2);
            color: #60a5fa;
            padding: 14px;
            border-radius: 14px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            margin-top: 4px;
            transition: all 0.2s;
        }
        button:hover { background: rgba(59, 130, 246, 0.2); }
        button:active { transform: scale(0.98); }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo"><div class="play-triangle"></div></div>
            <h1>OnePlayer</h1>
        </div>

        <div class="card">
            <div class="label-group">
                <span class="label-main">Auto-pause</span>
                <span class="label-sub">Play one video at a time</span>
            </div>
            <label class="switch">
                <input type="checkbox" id="pauseToggle" checked>
                <span class="slider"></span>
            </label>
        </div>

        <div class="card">
            <div class="label-group">
                <span class="label-main">Sticky PiP</span>
                <span class="label-sub">Floating video on scroll</span>
            </div>
            <label class="switch">
                <input type="checkbox" id="pipToggle" checked>
                <span class="slider"></span>
            </label>
        </div>

        <button id="refreshBtn">Refresh YouTube Tabs</button>
    </div>
    <script src="popup.js"></script>
</body>
</html>
EOF

echo "Reverted extension activation changes in background.js, content.js, popup.js, and popup.html"
