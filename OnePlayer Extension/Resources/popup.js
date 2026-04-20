document.addEventListener('DOMContentLoaded', () => {
    const pauseToggle = document.getElementById('pauseToggle');
    const pipToggle = document.getElementById('pipToggle');
    const pipButtonToggle = document.getElementById('pipButtonToggle');
    const refreshBtn = document.getElementById('refreshBtn');

    const youtubeTabsQuery = { url: '*://*.youtube.com/*' };

    const pingTab = (tabId) => browser.tabs.sendMessage(tabId, { action: 'ping' })
        .then(() => true)
        .catch(() => false);

    const refreshTabs = (tabs) => {
        tabs.forEach(tab => {
            browser.tabs.sendMessage(tab.id, { action: 'save_time' }).then(() => {
                browser.tabs.reload(tab.id);
            }).catch(() => {
                browser.tabs.reload(tab.id);
            });
        });
    };

    const ensureActiveContentScripts = async () => {
        await browser.runtime.sendMessage({ action: 'ensure_content_scripts' }).catch(() => {});

        const tabs = await browser.tabs.query(youtubeTabsQuery);
        const tabsNeedingRefresh = [];

        for (const tab of tabs) {
            if (!tab.id) continue;
            const isResponsive = await pingTab(tab.id);
            if (!isResponsive) {
                tabsNeedingRefresh.push(tab);
            }
        }

        if (tabsNeedingRefresh.length > 0) {
            refreshTabs(tabsNeedingRefresh);
        }
    };

    ensureActiveContentScripts().catch(() => {});

    // 1. Last innstillinger
    browser.storage.local.get(['pauseEnabled', 'pipEnabled', 'pipButtonEnabled']).then((result) => {
        pauseToggle.checked = result.pauseEnabled !== false;
        pipToggle.checked = result.pipEnabled !== false;
        pipButtonToggle.checked = result.pipButtonEnabled !== false;
    });

    // 2. Synkroniser innstillinger
    const update = () => {
        const settings = {
            pauseEnabled: pauseToggle.checked,
            pipEnabled: pipToggle.checked,
            pipButtonEnabled: pipButtonToggle.checked
        };
        browser.storage.local.set(settings);
        browser.tabs.query(youtubeTabsQuery).then(tabs => {
            tabs.forEach(tab => {
                browser.tabs.sendMessage(tab.id, { action: 'update_settings', ...settings }).catch(() => {});
            });
        });
    };

    pauseToggle.addEventListener('change', update);
    pipToggle.addEventListener('change', update);
    pipButtonToggle.addEventListener('change', update);

    // 3. Refresh-knapp med state-lagring
    refreshBtn.addEventListener('click', () => {
        refreshBtn.innerText = 'Refreshing...';
        refreshBtn.disabled = true;

        browser.tabs.query(youtubeTabsQuery).then(tabs => {
            refreshTabs(tabs);
            setTimeout(() => {
                refreshBtn.innerText = 'Refresh YouTube Tabs';
                refreshBtn.disabled = false;
            }, 2000);
        });
    });
});
