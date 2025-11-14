import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

const ALLOWED_ATTRS = new Set(['id', 'class', 'name', 'type', 'href', 'placeholder', 'role']);
const MAX_ATTR_LENGTH = 40;

/**
 * Filter and format allowed attributes for an HTML tag.
 * Includes attributes in ALLOWED_ATTRS and any attribute starting with 'data' or 'test'.
 */
function filterAttributes(attrs: Record<string, string | undefined>): string {
  const filtered: string[] = [];
  
  for (const [attr, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    
    const shouldInclude = (
      ALLOWED_ATTRS.has(attr) ||
      attr.startsWith('data') ||
      attr.startsWith('test')
    ) && value.length <= MAX_ATTR_LENGTH;
    
    if (shouldInclude) {
      filtered.push(`${attr}="${value}"`);
    }
  }
  
  return filtered.length > 0 ? ' ' + filtered.join(' ') : '';
}

/**
 * Simplify a cheerio element: keep allowed attributes and inner text.
 */
function simplifyTag($: cheerio.CheerioAPI, element: AnyNode): string {
  const $elem = $(element);
  const attrs = $elem.attr() || {};
  const attrStr = filterAttributes(attrs);
  const innerText = $elem.text().trim();
  const tagName = (element as any).name || (element as any).tagName;
  
  return `<${tagName}${attrStr}>${innerText}</${tagName}>`;
}

/**
 * Simplify HTML by keeping only allowed attributes and always preserving inner text.
 * Handles single tags, fragments, and plain text.
 */
export function simplifyHtml(html: string): string {
  const $ = cheerio.load(html, null, false);
  const root = $.root();
  const contents = root.contents().toArray();
  
  // If the input is just text, return as is
  if (contents.length === 0 || (contents.length === 1 && contents[0].type === 'text')) {
    return root.text().trim();
  }
  
  // If the input is a single tag
  if (contents.length === 1 && contents[0].type === 'tag') {
    return simplifyTag($, contents[0]);
  }
  
  // If the input is a fragment, process each node at the top level
  const simplified: string[] = [];
  
  for (const node of contents) {
    if (node.type === 'tag') {
      simplified.push(simplifyTag($, node));
    } else if (node.type === 'text') {
      const text = $(node).text().trim();
      if (text) {
        simplified.push(text);
      }
    }
  }
  
  return simplified.join(' ');
}