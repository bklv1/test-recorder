import { RecordingStage, RecordingState } from '../shared/types';

const mainBtn = document.getElementById('main-btn') as HTMLButtonElement;
const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
const statusBadge = document.getElementById('status-badge') as HTMLSpanElement;
const stageSection = document.getElementById('stage-section') as HTMLElement;
const previewSection = document.getElementById('preview-section') as HTMLElement;
const previewEl = document.getElementById('preview') as HTMLPreElement;
const copyMsg = document.getElementById('copy-msg') as HTMLParagraphElement;
const stageBtns = document.querySelectorAll<HTMLButtonElement>('.stage-btn');

let currentText = '';

function applyState(state: RecordingState, recordingText?: string): void {
  if (state.isRecording) {
    statusBadge.textContent = 'Recording';
    statusBadge.className = 'badge recording';
    mainBtn.textContent = 'Stop & Export';
    mainBtn.classList.add('recording');
    stageSection.classList.remove('hidden');
    copyBtn.classList.add('hidden');
    previewSection.classList.add('hidden');
    copyMsg.classList.add('hidden');

    stageBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.stage === state.currentStage);
    });
  } else {
    statusBadge.textContent = 'Idle';
    statusBadge.className = 'badge idle';
    mainBtn.textContent = 'Start Recording';
    mainBtn.classList.remove('recording');
    stageSection.classList.add('hidden');

    if (recordingText && recordingText.trim() !== '=== Test Recording ===') {
      currentText = recordingText;
      previewEl.textContent = recordingText;
      previewSection.classList.remove('hidden');
      copyBtn.classList.remove('hidden');
    }
  }
}

// Load initial state
chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
  if (response?.success) {
    applyState(response.state);
  }
});

// Main record/stop button
mainBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage(
    { action: mainBtn.classList.contains('recording') ? 'stopRecording' : 'startRecording' },
    (response) => {
      if (!response?.success) return;

      if (!response.state.isRecording) {
        // Just stopped — fetch the formatted text
        chrome.runtime.sendMessage({ action: 'getRecording' }, (r) => {
          applyState(response.state, r?.text ?? '');
        });
      } else {
        applyState(response.state);
      }
    }
  );
});

// Stage buttons
stageBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const stage = btn.dataset.stage as RecordingStage;
    chrome.runtime.sendMessage({ action: 'switchStage', stage }, (response) => {
      if (response?.success) applyState(response.state);
    });
  });
});

// Copy to clipboard
copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(currentText).then(() => {
    copyMsg.classList.remove('hidden');
    setTimeout(() => copyMsg.classList.add('hidden'), 2000);
  });
});
