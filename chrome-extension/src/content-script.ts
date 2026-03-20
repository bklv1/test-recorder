import { CdpStep, RecordingState } from './shared/types';
import { generateSelectors } from './shared/selectors';

// ── Floating badge UI ─────────────────────────────────────────────────────────

let badge: HTMLElement | null = null;

function injectBadge(): void {
  if (badge) return;

  badge = document.createElement('div');
  badge.id = '__tr_badge';
  badge.innerHTML = `
    <style>
      #__tr_badge {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 2147483647;
        background: #1a1a2e;
        color: #fff;
        border-radius: 12px;
        padding: 8px 14px;
        font-family: system-ui, sans-serif;
        font-size: 13px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.35);
        display: flex;
        align-items: center;
        gap: 8px;
        user-select: none;
      }
      #__tr_badge .rec-dot { color: #e74c3c; font-size: 16px; animation: blink 1s infinite; }
      @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
    </style>
    <span class="rec-dot">●</span>
    <span>REC</span>
  `;

  document.documentElement.appendChild(badge);
}

function removeBadge(): void {
  badge?.remove();
  badge = null;
}

// ── Event capture ─────────────────────────────────────────────────────────────

let isRecording = false;

function sendStep(step: CdpStep): void {
  chrome.runtime.sendMessage({ action: 'recordStep', step });
}

// Debounce input events: wait 600ms after last keystroke before recording
const inputTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

// ── Post-click value sniff helpers ────────────────────────────────────────────

function snapshotInputValues(): Map<HTMLInputElement | HTMLTextAreaElement, string> {
  const map = new Map<HTMLInputElement | HTMLTextAreaElement, string>();
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea').forEach(el => {
    map.set(el, el.value);
  });
  return map;
}

function findChangedInputs(
  before: Map<HTMLInputElement | HTMLTextAreaElement, string>
): Array<{ el: HTMLInputElement | HTMLTextAreaElement; newValue: string }> {
  const changed: Array<{ el: HTMLInputElement | HTMLTextAreaElement; newValue: string }> = [];
  before.forEach((oldVal, el) => {
    if (el.value !== oldVal && el.value.trim() !== '') {
      changed.push({ el, newValue: el.value });
    }
  });
  return changed;
}

function onClickCapture(e: MouseEvent): void {
  if (!isRecording) return;
  const target = e.target as Element;

  // Skip our own badge
  if (target.closest('#__tr_badge')) return;

  // Skip pure input elements (handled by input listener)
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  const offsetX = Math.round(e.offsetX);
  const offsetY = Math.round(e.offsetY);
  const before = snapshotInputValues();

  setTimeout(() => {
    const changed = findChangedInputs(before);

    if (changed.length > 0) {
      // Widget interaction (date picker, custom select, etc.): record as change steps
      for (const { el, newValue } of changed) {
        sendStep({
          type: 'change',
          target: 'main',
          selectors: generateSelectors(el),
          value: newValue,
        });
      }
    } else {
      sendStep({
        type: 'click',
        target: 'main',
        selectors: generateSelectors(target),
        offsetX,
        offsetY,
        assertedEvents: [],
      });
    }
  }, 300);
}

function onInputCapture(e: Event): void {
  if (!isRecording) return;
  const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

  const existing = inputTimers.get(target);
  if (existing) clearTimeout(existing);

  inputTimers.set(
    target,
    setTimeout(() => {
      const isSelect = target.tagName.toLowerCase() === 'select';
      const value = isSelect
        ? (target as HTMLSelectElement).options[(target as HTMLSelectElement).selectedIndex]?.text ?? target.value
        : target.value;

      sendStep({
        type: 'change',
        target: 'main',
        selectors: generateSelectors(target),
        value,
      });
    }, 600)
  );
}

function onChangeCapture(e: Event): void {
  if (!isRecording) return;
  const target = e.target as HTMLInputElement;
  const type = (target.getAttribute('type') ?? '').toLowerCase();
  if (type !== 'checkbox' && type !== 'radio') return;

  sendStep({
    type: 'change',
    target: 'main',
    selectors: generateSelectors(target),
    value: String(target.checked),
  });
}

let scrollTimer: ReturnType<typeof setTimeout> | null = null;

function onScrollCapture(): void {
  if (!isRecording) return;
  if (scrollTimer) clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    sendStep({
      type: 'scroll',
      target: 'main',
      x: Math.round(window.scrollX),
      y: Math.round(window.scrollY),
    });
  }, 200);
}

function attachListeners(): void {
  document.addEventListener('click', onClickCapture, { capture: true });
  document.addEventListener('input', onInputCapture, { capture: true });
  document.addEventListener('change', onChangeCapture, { capture: true });
  window.addEventListener('scroll', onScrollCapture, { passive: true });
}

function detachListeners(): void {
  document.removeEventListener('click', onClickCapture, { capture: true });
  document.removeEventListener('input', onInputCapture, { capture: true });
  document.removeEventListener('change', onChangeCapture, { capture: true });
  window.removeEventListener('scroll', onScrollCapture);
}

// ── Background state sync ─────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg: { action: string; state?: RecordingState }) => {
  if (msg.action === 'stateChanged' && msg.state) {
    const { isRecording: nowRecording } = msg.state;

    if (nowRecording && !isRecording) {
      isRecording = true;
      attachListeners();
      injectBadge();
    } else if (!nowRecording && isRecording) {
      isRecording = false;
      detachListeners();
      removeBadge();
    }
  }
});

// Sync on initial load
chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
  if (response?.success && response.state?.isRecording) {
    isRecording = true;
    attachListeners();
    injectBadge();
  }
});
