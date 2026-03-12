import { RecordedEvent, RecordingStage, RecordingState } from './shared/types';
import { simplifyUrl } from './shared/url-utils';

// ── Semantic resolution ───────────────────────────────────────────────────────

function getRole(el: Element): string {
  const explicitRole = el.getAttribute('role');
  if (explicitRole) {
    return explicitRole.charAt(0).toUpperCase() + explicitRole.slice(1);
  }
  const tag = el.tagName.toLowerCase();
  const type = (el.getAttribute('type') ?? '').toLowerCase();

  if (tag === 'button') return 'Button';
  if (tag === 'a') return 'Link';
  if (tag === 'select') return 'Dropdown';
  if (tag === 'textarea') return 'Text area';
  if (tag === 'input') {
    if (type === 'checkbox') return 'Checkbox';
    if (type === 'radio') return 'Radio';
    if (type === 'submit' || type === 'button' || type === 'reset') return 'Button';
    return 'Field';
  }
  // Clickable divs / spans often have button-like roles
  if (el.getAttribute('tabindex') != null) return 'Control';
  return 'Element';
}

function trimText(text: string, max = 60): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > max ? t.slice(0, max) + '…' : t;
}

function getName(el: Element): string {
  // 1. aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return trimText(ariaLabel);

  // 2. aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '');
    const joined = parts.join(' ').trim();
    if (joined) return trimText(joined);
  }

  // 3. <label for="id"> or wrapping <label>
  const id = el.getAttribute('id');
  if (id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`);
    if (label) return trimText(label.textContent ?? '');
  }
  // Ancestor label
  const ancestorLabel = el.closest('label');
  if (ancestorLabel) {
    // Get label text without the input's own value
    const clone = ancestorLabel.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('input, select, textarea').forEach(c => c.remove());
    const text = (clone.textContent ?? '').trim();
    if (text) return trimText(text);
  }

  // 4. placeholder
  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return trimText(placeholder);

  // 5. Inner text (for buttons, links)
  const innerText = (el as HTMLElement).innerText ?? el.textContent ?? '';
  if (innerText.trim()) return trimText(innerText);

  // 6. title
  const title = el.getAttribute('title');
  if (title) return trimText(title);

  // 7. value (for submit buttons)
  const value = (el as HTMLInputElement).value;
  if (value) return trimText(value);

  return 'unknown';
}

// ── Floating badge UI ─────────────────────────────────────────────────────────

let badge: HTMLElement | null = null;

function injectBadge(stage: RecordingStage): void {
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
        gap: 10px;
        user-select: none;
      }
      #__tr_badge .rec-dot { color: #e74c3c; font-size: 16px; animation: blink 1s infinite; }
      @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
      #__tr_badge .stage-btns { display: flex; gap: 4px; }
      #__tr_badge .stage-btn {
        background: #2d2d44;
        border: none;
        color: #aaa;
        border-radius: 6px;
        padding: 3px 8px;
        cursor: pointer;
        font-size: 12px;
        font-family: inherit;
      }
      #__tr_badge .stage-btn.active { background: #27ae60; color: #fff; }
    </style>
    <span class="rec-dot">●</span>
    <span id="__tr_stage_label">REC · ${stage}</span>
    <div class="stage-btns">
      <button class="stage-btn${stage === 'GIVEN' ? ' active' : ''}" data-stage="GIVEN">G</button>
      <button class="stage-btn${stage === 'WHEN' ? ' active' : ''}" data-stage="WHEN">W</button>
      <button class="stage-btn${stage === 'THEN' ? ' active' : ''}" data-stage="THEN">T</button>
    </div>
  `;

  badge.querySelectorAll('.stage-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const s = (btn as HTMLElement).dataset.stage as RecordingStage;
      chrome.runtime.sendMessage({ action: 'switchStage', stage: s });
    });
  });

  document.documentElement.appendChild(badge);
}

function updateBadge(stage: RecordingStage): void {
  if (!badge) return;
  const label = badge.querySelector('#__tr_stage_label');
  if (label) label.textContent = `REC · ${stage}`;
  badge.querySelectorAll('.stage-btn').forEach(btn => {
    const s = (btn as HTMLElement).dataset.stage;
    btn.classList.toggle('active', s === stage);
  });
}

function removeBadge(): void {
  badge?.remove();
  badge = null;
}

// ── Event capture ─────────────────────────────────────────────────────────────

let isRecording = false;
let currentStage: RecordingStage = 'GIVEN';

function sendEvent(event: RecordedEvent): void {
  chrome.runtime.sendMessage({ action: 'recordEvent', event });
}

// Debounce input events: wait 600ms after last keystroke before recording
const inputTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

function onClickCapture(e: MouseEvent): void {
  if (!isRecording) return;
  const target = e.target as Element;

  // Skip our own badge
  if (target.closest('#__tr_badge')) return;

  // Skip pure input elements (they'll be handled by input listener)
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  const role = getRole(target);
  const name = getName(target);
  if (name === 'unknown' && role === 'Element') return; // unidentifiable

  sendEvent({
    type: 'click',
    role,
    name,
    url: simplifyUrl(window.location.href),
    timestamp: Date.now(),
  });
}

function onInputCapture(e: Event): void {
  if (!isRecording) return;
  const target = e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

  const existing = inputTimers.get(target);
  if (existing) clearTimeout(existing);

  inputTimers.set(
    target,
    setTimeout(() => {
      const role = getRole(target);
      const name = getName(target);
      const value = target.value;

      if (target.tagName.toLowerCase() === 'select') {
        const sel = target as HTMLSelectElement;
        const selectedText = sel.options[sel.selectedIndex]?.text ?? value;
        sendEvent({
          type: 'select',
          role,
          name,
          value: selectedText,
          url: simplifyUrl(window.location.href),
          timestamp: Date.now(),
        });
      } else {
        sendEvent({
          type: 'type',
          role,
          name,
          value,
          url: simplifyUrl(window.location.href),
          timestamp: Date.now(),
        });
      }
    }, 600)
  );
}

function onChangeCapture(e: Event): void {
  if (!isRecording) return;
  const target = e.target as HTMLInputElement;
  const type = (target.getAttribute('type') ?? '').toLowerCase();
  if (type !== 'checkbox' && type !== 'radio') return;

  sendEvent({
    type: 'check',
    role: getRole(target),
    name: getName(target),
    value: String(target.checked),
    url: simplifyUrl(window.location.href),
    timestamp: Date.now(),
  });
}

function attachListeners(): void {
  document.addEventListener('click', onClickCapture, { capture: true });
  document.addEventListener('input', onInputCapture, { capture: true });
  document.addEventListener('change', onChangeCapture, { capture: true });
}

function detachListeners(): void {
  document.removeEventListener('click', onClickCapture, { capture: true });
  document.removeEventListener('input', onInputCapture, { capture: true });
  document.removeEventListener('change', onChangeCapture, { capture: true });
}

// ── Background state sync ─────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg: { action: string; state?: RecordingState }) => {
  if (msg.action === 'stateChanged' && msg.state) {
    const { isRecording: nowRecording, currentStage: nowStage } = msg.state;

    if (nowRecording && !isRecording) {
      isRecording = true;
      currentStage = nowStage;
      attachListeners();
      injectBadge(nowStage);
    } else if (!nowRecording && isRecording) {
      isRecording = false;
      detachListeners();
      removeBadge();
    } else if (nowRecording && nowStage !== currentStage) {
      currentStage = nowStage;
      updateBadge(nowStage);
    }
  }
});

// Sync on initial load
chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
  if (response?.success && response.state?.isRecording) {
    isRecording = true;
    currentStage = response.state.currentStage;
    attachListeners();
    injectBadge(currentStage);
  }
});
