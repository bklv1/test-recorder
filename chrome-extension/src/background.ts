import { RecordedEvent, RecordingStage, RecordingState, StageData, MessageAction, MessageResponse } from './shared/types';
import { formatRecording } from './shared/format';

const STAGES: RecordingStage[] = ['GIVEN', 'WHEN', 'THEN'];

function emptyStages(): Record<RecordingStage, StageData> {
  return { GIVEN: {}, WHEN: {}, THEN: {} };
}

let state: RecordingState = {
  isRecording: false,
  currentStage: 'GIVEN',
  stages: emptyStages(),
};

function appendEvent(event: RecordedEvent): void {
  const stageData = state.stages[state.currentStage];
  if (!stageData[event.url]) {
    stageData[event.url] = [];
  }
  stageData[event.url].push(event);
}

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

chrome.runtime.onMessage.addListener(
  (msg: MessageAction, _sender, sendResponse: (r: MessageResponse) => void) => {
    switch (msg.action) {
      case 'startRecording':
        state = { isRecording: true, currentStage: 'GIVEN', stages: emptyStages() };
        notifyAllTabs();
        sendResponse({ success: true, state });
        break;

      case 'stopRecording':
        state = { ...state, isRecording: false };
        notifyAllTabs();
        sendResponse({ success: true, state });
        break;

      case 'switchStage':
        if (STAGES.includes(msg.stage)) {
          state = { ...state, currentStage: msg.stage };
          notifyAllTabs();
          sendResponse({ success: true, state });
        } else {
          sendResponse({ success: false, error: 'Invalid stage' });
        }
        break;

      case 'recordEvent':
        if (state.isRecording) {
          appendEvent(msg.event);
        }
        sendResponse({ success: true });
        break;

      case 'getState':
      case 'getRecordingState':
        sendResponse({ success: true, state });
        break;

      case 'getRecording':
        sendResponse({ success: true, text: formatRecording(state.stages) });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
    return true; // Keep channel open for async sendResponse
  }
);
