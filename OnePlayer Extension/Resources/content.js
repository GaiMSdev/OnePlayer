if (!window.__onePlayerContentInitialized) {
    window.__onePlayerContentInitialized = true;
    let pauseEnabled = true;
    let pipEnabled = true;
    let pipButtonEnabled = true;
    let isPiPActive = false;

    function getRelevantVideo() {
        const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
        if (!video) return null;
        if (video.closest('#inline-preview-player')) return null;
        if (video.muted || video.volume <= 0) return null;
        return video;
    }

    function notifyIfVideoIsPlaying() {
        if (!pauseEnabled) return;
        const video = getRelevantVideo();
        if (video && !video.paused) {
            browser.runtime.sendMessage({ action: 'notify_playing' }).catch(() => {});
        }
    }

    // 1. Last innstillinger
    browser.storage.local.get(['pauseEnabled', 'pipEnabled', 'pipButtonEnabled']).then((result) => {
        pauseEnabled = result.pauseEnabled !== false;
        pipEnabled = result.pipEnabled !== false;
        pipButtonEnabled = result.pipButtonEnabled !== false;
        notifyIfVideoIsPlaying();
    });

    // 2. Lytt etter oppdateringer fra popup
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'ping') {
            sendResponse({ status: "ok" });
        } else if (message.action === 'toggle_pip') {
            const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
            if (v) {
                const isInPiP = v.webkitPresentationMode === 'picture-in-picture';
                try {
                    v.webkitSetPresentationMode(isInPiP ? 'inline' : 'picture-in-picture');
                } catch (e) {}
                sendResponse({ status: "ok", pip: !isInPiP });
            } else {
                sendResponse({ status: "no_video" });
            }
        } else if (message.action === 'get_pip_state') {
            const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
            sendResponse({
                status: "ok",
                pip: v ? v.webkitPresentationMode === 'picture-in-picture' : false,
                hasVideo: !!v
            });
        } else if (message.action === 'update_settings') {
            const wasPauseEnabled = pauseEnabled;
            pauseEnabled = message.pauseEnabled;
            pipEnabled = message.pipEnabled;
            pipButtonEnabled = message.pipButtonEnabled;
            if (!pipEnabled) {
                const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
                if (v && v.webkitPresentationMode === 'picture-in-picture') {
                    try { v.webkitSetPresentationMode('inline'); } catch (e) {}
                }
            }
            if (!wasPauseEnabled && pauseEnabled) {
                notifyIfVideoIsPlaying();
            }
            // Vis/skjul PiP-knappen basert på innstillingen
            if (pipButtonEnabled) {
                injectPipButton();
            } else {
                removePipButton();
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
            const forcePause = sessionStorage.getItem('oneplayer_force_pause') === 'true';
            sessionStorage.removeItem('oneplayer_force_pause');
            const wasPlaying = sessionStorage.getItem('oneplayer_was_playing') === 'true';
            sessionStorage.removeItem('oneplayer_was_playing');
            
            // Prøv å finne video og sette tid (kan kreve polling siden YouTube bygger opp DOMen tregt)
            let attempts = 0;
            const interval = setInterval(() => {
                const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
                if (v && v.readyState >= 1) {
                    v.currentTime = parseFloat(savedTime);
                    if (forcePause) {
                        // Etter installasjon: alltid pause
                        v.pause();
                    } else if (wasPlaying) {
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
        if (video.tagName === 'VIDEO' && video === getRelevantVideo()) {
            browser.runtime.sendMessage({ action: 'notify_playing' }).catch(() => {});
        }
    }, true);

    // 5. Manuell PiP overlay-knapp på YouTube-spilleren
    const PIP_BTN_ID = 'oneplayer-pip-btn';
    const pipIconOut = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="3" width="18" height="14" rx="2" stroke="white" stroke-width="1.5" fill="none"/><rect x="10" y="10" width="8" height="5.5" rx="1.2" fill="white"/></svg>`;
    const pipIconIn = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="3" width="18" height="14" rx="2" stroke="white" stroke-width="1.5" fill="none"/><rect x="10" y="10" width="8" height="5.5" rx="1.2" stroke="white" stroke-width="1.2" fill="none"/></svg>`;

    function updatePipBtnIcon() {
        const btn = document.getElementById(PIP_BTN_ID);
        if (!btn) return;
        const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
        const isInPiP = v && v.webkitPresentationMode === 'picture-in-picture';
        btn.innerHTML = isInPiP ? pipIconIn : pipIconOut;
        btn.title = isInPiP ? 'Return to tab' : 'Picture in Picture';
    }

    function injectPipButton() {
        if (document.getElementById(PIP_BTN_ID)) return;
        if (!pipButtonEnabled) return;
        if (!location.pathname.startsWith('/watch')) return;

        const player = document.getElementById('movie_player');
        if (!player) return;

        // Sørg for at player har position for absolutt plassering
        const cs = getComputedStyle(player);
        if (cs.position === 'static') player.style.position = 'relative';

        const btn = document.createElement('button');
        btn.id = PIP_BTN_ID;
        btn.title = 'Picture in Picture';
        btn.innerHTML = pipIconOut;
        Object.assign(btn.style, {
            position: 'absolute',
            top: '10px',
            right: '10px',
            zIndex: '2000',
            width: '36px',
            height: '36px',
            border: 'none',
            borderRadius: '8px',
            background: 'rgba(0,0,0,0.6)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: '0',
            transition: 'opacity 0.2s',
            padding: '0',
            boxShadow: 'none'
        });

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
            if (!v) return;
            const isInPiP = v.webkitPresentationMode === 'picture-in-picture' || document.pictureInPictureElement === v;
            if (isInPiP) {
                // Avslutt PiP
                if (document.exitPictureInPicture) {
                    document.exitPictureInPicture().catch(() => {});
                } else {
                    try { v.webkitSetPresentationMode('inline'); } catch (err) {}
                }
            } else {
                // Start PiP — prøv standard API først, deretter webkit
                if (v.requestPictureInPicture) {
                    v.requestPictureInPicture().catch(() => {
                        try { v.webkitSetPresentationMode('picture-in-picture'); } catch (err) {}
                    });
                } else {
                    try { v.webkitSetPresentationMode('picture-in-picture'); } catch (err) {}
                }
            }
        });

        // Vis knappen ved hover over spilleren
        player.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
        player.addEventListener('mouseleave', () => { btn.style.opacity = '0'; });

        player.appendChild(btn);

        // Lytt på PiP-endringer for å oppdatere ikon
        const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
        if (v) {
            v.addEventListener('webkitpresentationmodechanged', updatePipBtnIcon);
        }
    }

    function removePipButton() {
        const btn = document.getElementById(PIP_BTN_ID);
        if (btn) btn.remove();
    }

    function handleNavigation() {
        // Fjern alltid gammel knapp ved navigering (YouTube kan bytte ut spilleren)
        removePipButton();
        if (location.pathname.startsWith('/watch')) {
            // Poll for player (YouTube builds DOM gradually)
            let tries = 0;
            const check = setInterval(() => {
                if (document.getElementById('movie_player')) {
                    injectPipButton();
                    clearInterval(check);
                }
                if (++tries > 20) clearInterval(check);
            }, 300);
        }
    }

    // YouTube SPA-navigasjon
    document.addEventListener('yt-navigate-finish', handleNavigation);
    // Initial load
    handleNavigation();
}
