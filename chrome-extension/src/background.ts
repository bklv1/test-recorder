import { RecordingState, MessageAction, MessageResponse } from './shared/types';
import { formatRecording } from './shared/format';

let state: RecordingState = {
  isRecording: false,
  recording: { title: 'Recording', steps: [] },
};

let lastNavigatedUrl: string | null = null;

function notifyAllTabs(): void {
  chrome.tabs.query({}, tabs => {
    for (const tab of tabs) {
      if (tab.id != null) {
        chrome.tabs.sendMessage(tab.id, { action: 'stateChanged', state }).catch(() => {
          // Tab may not have content script — ignore
        });
      }
    }
  });
}

// Insert a navigate step whenever the active tab navigates during recording
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (!state.isRecording) return;
  if (changeInfo.status === 'complete' && tab.url && /^https?:\/\//.test(tab.url)) {
    if (tab.url !== lastNavigatedUrl) {
      lastNavigatedUrl = tab.url;
      state.recording.steps.push({
        type: 'navigate',
        url: tab.url,
        assertedEvents: [{ type: 'navigation', url: tab.url, title: tab.title ?? '' }],
      });
    }
  }
});

chrome.runtime.onMessage.addListener(
  (msg: MessageAction, _sender, sendResponse: (r: MessageResponse) => void) => {
    switch (msg.action) {
      case 'startRecording': {
        lastNavigatedUrl = null;
        state = { isRecording: true, recording: { title: 'Recording', steps: [] } };

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tab = tabs[0];
          const finish = () => {
            notifyAllTabs();
            sendResponse({ success: true, state });
          };

          const tabId = tab?.id;
          const tabUrl = tab?.url;
          if (!tabId || !tabUrl) { finish(); return; }

          // Insert initial navigate step
          if (/^https?:\/\//.test(tabUrl)) {
            lastNavigatedUrl = tabUrl;
            state.recording.steps.push({
              type: 'navigate',
              url: tabUrl,
              assertedEvents: [{ type: 'navigation', url: tabUrl, title: tab.title ?? '' }],
            });
          }

          // Insert setViewport at the front using real window dimensions
          chrome.scripting.executeScript({
            target: { tabId },
            func: () => ({
              width: window.innerWidth,
              height: window.innerHeight,
              deviceScaleFactor: window.devicePixelRatio || 1,
            }),
          }, (results) => {
            const vp = results?.[0]?.result as { width: number; height: number; deviceScaleFactor: number } | undefined;
            state.recording.steps.unshift({
              type: 'setViewport',
              width: vp?.width ?? 1280,
              height: vp?.height ?? 720,
              deviceScaleFactor: vp?.deviceScaleFactor ?? 1,
              isMobile: false,
              hasTouch: false,
              isLandscape: (vp?.width ?? 1280) > (vp?.height ?? 720),
            });
            finish();
          });
        });
        break; // sendResponse called inside callback
      }

      case 'stopRecording':
        state = { ...state, isRecording: false };
        notifyAllTabs();
        sendResponse({ success: true, state });
        break;

      case 'recordStep':
        if (state.isRecording) {
          state.recording.steps.push(msg.step);
        }
        sendResponse({ success: true });
        break;

      case 'getState':
      case 'getRecordingState':
        sendResponse({ success: true, state });
        break;

      case 'getRecording':
        sendResponse({ success: true, text: formatRecording(state.recording) });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
    return true; // Keep channel open for async sendResponse
  }
);
