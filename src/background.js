'use strict';

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id == null) return;
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'x-media-viewer:toggle' });
    if (!result?.ok) throw new Error('Viewer unavailable');
    await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
    await chrome.action.setTitle({ tabId: tab.id, title: 'View this X timeline' });
  } catch {
    // Stay on the current page. Existing X tabs may need one refresh after an update.
    await chrome.action.setBadgeText({ tabId: tab.id, text: 'X' }).catch(() => {});
    await chrome.action
      .setTitle({
        tabId: tab.id,
        title:
          'Open an X timeline and click again. If you are already on X, refresh this tab once.',
      })
      .catch(() => {});
  }
});
