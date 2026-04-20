// background.js: Kraftig Traffic Controller for OnePlayer
async function ensureContentScriptInYouTubeTabs() {
    const tabs = await browser.tabs.query({ url: '*://*.youtube.com/*' });
    await Promise.all(tabs.map((tab) => {
        if (!tab.id) return Promise.resolve();
        return browser.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
        }).catch(() => {});
    }));
}

browser.runtime.onInstalled.addListener(() => {
    // Lagre videoposisjon i alle YouTube-faner, reload dem, og pause etter gjenopprettelse
    browser.tabs.query({ url: '*://*.youtube.com/*' }).then(async (tabs) => {
        for (const tab of tabs) {
            if (!tab.id) continue;
            // Injiser script som lagrer videoposisjon og setter force-pause-flagg
            await browser.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
                    if (v && v.currentTime > 0) {
                        sessionStorage.setItem('oneplayer_restore_time', v.currentTime);
                        sessionStorage.setItem('oneplayer_was_playing', !v.paused);
                        sessionStorage.setItem('oneplayer_force_pause', 'true');
                    }
                }
            }).catch(() => {});
            // Reload fanen så content script lastes inn
            browser.tabs.reload(tab.id).catch(() => {});
        }
    }).catch(() => {});
});

browser.runtime.onMessage.addListener((message, sender) => {
    if (message.action === 'ensure_content_scripts') {
        return ensureContentScriptInYouTubeTabs().then(() => ({ status: 'ok' }));
    }

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
