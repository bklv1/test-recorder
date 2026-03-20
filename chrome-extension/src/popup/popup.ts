import { RecordingState } from '../shared/types';

const mainBtn = document.getElementById('main-btn') as HTMLButtonElement;
const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
const statusBadge = document.getElementById('status-badge') as HTMLSpanElement;
const previewSection = document.getElementById('preview-section') as HTMLElement;
const previewEl = document.getElementById('preview') as HTMLPreElement;
const copyMsg = document.getElementById('copy-msg') as HTMLParagraphElement;

let currentText = '';

function applyState(state: RecordingState, recordingText?: string): void {
  if (state.isRecording) {
    statusBadge.textContent = 'Recording';
    statusBadge.className = 'badge recording';
    mainBtn.textContent = 'Stop & Export';
    mainBtn.classList.add('recording');
    copyBtn.classList.add('hidden');
    downloadBtn.classList.add('hidden');
    previewSection.classList.add('hidden');
    copyMsg.classList.add('hidden');
  } else {
    statusBadge.textContent = 'Idle';
    statusBadge.className = 'badge idle';
    mainBtn.textContent = 'Start Recording';
    mainBtn.classList.remove('recording');

    let hasRecording = false;
    if (recordingText) {
      try {
        const parsed = JSON.parse(recordingText) as { steps?: unknown[] };
        if (Array.isArray(parsed.steps) && parsed.steps.length > 0) {
          hasRecording = true;
          currentText = recordingText;
          previewEl.textContent = recordingText;
        }
      } catch { /* fall through */ }
    }

    previewSection.classList.toggle('hidden', !hasRecording);
    copyBtn.classList.toggle('hidden', !hasRecording);
    downloadBtn.classList.toggle('hidden', !hasRecording);
  }
}

// Load initial state
chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
  if (response?.success) {
    applyState(response.state as RecordingState);
  }
});

// Main record/stop button
mainBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage(
    { action: mainBtn.classList.contains('recording') ? 'stopRecording' : 'startRecording' },
    (response) => {
      if (!response?.success) return;

      if (!response.state.isRecording) {
        // Just stopped — fetch the formatted JSON
        chrome.runtime.sendMessage({ action: 'getRecording' }, (r) => {
          applyState(response.state as RecordingState, r?.text ?? '');
        });
      } else {
        applyState(response.state as RecordingState);
      }
    }
  );
});

// Copy to clipboard
copyBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(currentText).then(() => {
    copyMsg.classList.remove('hidden');
    setTimeout(() => copyMsg.classList.add('hidden'), 2000);
  });
});

// Download as JSON
downloadBtn.addEventListener('click', () => {
  const blob = new Blob([currentText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'recording.json';
  a.click();
  URL.revokeObjectURL(url);
});
