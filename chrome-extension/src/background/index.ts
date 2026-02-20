import 'webextension-polyfill';
import { exampleThemeStorage } from '@extension/storage';

exampleThemeStorage.get().then(theme => {
  console.log('theme', theme);
});

const FOREST_SUFFIX = 'forest.mushroom.box';
const originalUrlByTabId = new Map<number, string>();

const isForestUrl = (rawUrl: string) => {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return url.hostname === FOREST_SUFFIX || url.hostname.endsWith(`.${FOREST_SUFFIX}`);
  } catch {
    return false;
  }
};

chrome.webNavigation.onBeforeNavigate.addListener(details => {
  if (details.frameId !== 0) return;
  if (!isForestUrl(details.url)) return;

  originalUrlByTabId.set(details.tabId, details.url);

  if (chrome.storage?.session) {
    void chrome.storage.session.set({ [`forest:lastUrl:${details.tabId}`]: details.url });
  }
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;

  if ('type' in message && (message as { type?: unknown }).type === 'forest:getOriginalUrl') {
    const tabId = (message as { tabId?: number }).tabId ?? sender.tab?.id;

    if (typeof tabId !== 'number') {
      sendResponse({ ok: false, error: 'missing_tab_id' });
      return false;
    }

    const fromMemory = originalUrlByTabId.get(tabId);
    if (fromMemory) {
      sendResponse({ ok: true, url: fromMemory });
      return false;
    }

    if (chrome.storage?.session) {
      chrome.storage.session.get(`forest:lastUrl:${tabId}`).then(items => {
        const url = items[`forest:lastUrl:${tabId}`] as unknown;
        if (typeof url === 'string') sendResponse({ ok: true, url });
        else sendResponse({ ok: false, error: 'not_found' });
      });
      return true;
    }

    sendResponse({ ok: false, error: 'not_found' });
    return false;
  }

  return false;
});

console.log('Background loaded');
