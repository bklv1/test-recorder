export function generateSelectors(el: Element): string[][] {
  const selectors: string[][] = [];

  // 1. ARIA selector
  const ariaName = getAccessibleName(el);
  if (ariaName) selectors.push([`aria/${ariaName}`]);

  // 2. Test attribute CSS
  for (const attr of ['data-testid', 'data-test', 'data-qa', 'data-cy']) {
    const val = el.getAttribute(attr);
    if (val) {
      selectors.push([`[${attr}="${val}"]`]);
      break;
    }
  }

  // 3. ID
  if (el.id) selectors.push([`#${CSS.escape(el.id)}`]);

  // 4. CSS path (walks up DOM, stops at first id)
  selectors.push([buildCssPath(el)]);

  // 5. XPath
  selectors.push([`xpath/${buildXPath(el)}`]);

  return selectors;
}

function getAccessibleName(el: Element): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim().slice(0, 30);

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '');
    const text = parts.join(' ').trim();
    if (text) return text.slice(0, 30);
  }

  const innerText = (el as HTMLElement).innerText?.trim() ?? '';
  if (innerText) return innerText.slice(0, 30);

  const title = el.getAttribute('title');
  if (title) return title.trim().slice(0, 30);

  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return placeholder.trim().slice(0, 30);

  return '';
}

function buildCssPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.documentElement) {
    if (current.id) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      break;
    }
    const parent: Element | null = current.parentElement;
    if (!parent) break;

    const tag = current.tagName.toLowerCase();
    const siblings = Array.from<Element>(parent.children).filter(c => c.tagName === current!.tagName);
    if (siblings.length > 1) {
      const index = siblings.indexOf(current) + 1;
      parts.unshift(`${tag}:nth-of-type(${index})`);
    } else {
      parts.unshift(tag);
    }
    current = parent;
  }

  return parts.join(' > ');
}

function buildXPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.documentElement) {
    if (current.id) {
      const prefix = `//*[@id="${current.id}"]`;
      return parts.length ? `${prefix}/${parts.join('/')}` : prefix;
    }
    const parent: Element | null = current.parentElement;
    if (!parent) break;

    const tag = current.tagName.toLowerCase();
    const siblings = Array.from<Element>(parent.children).filter(c => c.tagName === current!.tagName);
    const index = siblings.indexOf(current) + 1;
    parts.unshift(siblings.length > 1 ? `${tag}[${index}]` : tag);
    current = parent;
  }

  return '//' + parts.join('/');
}
