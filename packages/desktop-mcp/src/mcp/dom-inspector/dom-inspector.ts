/**
 * JavaScript source to inject into the renderer via page.evaluate().
 * Walks the DOM and returns a flat list of visible elements with metadata.
 */
export const DOM_INSPECTOR_SCRIPT = `function inspectDom({ selector, interactiveOnly }) {
  const INTERACTIVE_TAGS = new Set([
    'A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'DETAILS', 'SUMMARY'
  ]);
  const INTERACTIVE_ROLES = new Set([
    'button', 'link', 'checkbox', 'radio', 'tab', 'menuitem',
    'switch', 'textbox', 'combobox', 'listbox', 'option', 'slider', 'spinbutton'
  ]);

  const root = selector ? document.querySelector(selector) : document.body;
  if (!root) return [];

  const elements = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);

  let node = walker.currentNode;
  while (node) {
    if (node instanceof HTMLElement) {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);

      // Skip invisible elements
      if (rect.width === 0 && rect.height === 0) { node = walker.nextNode(); continue; }
      if (style.display === 'none' || style.visibility === 'hidden') { node = walker.nextNode(); continue; }
      if (parseFloat(style.opacity) === 0) { node = walker.nextNode(); continue; }

      const tag = node.tagName.toLowerCase();
      const role = node.getAttribute('role') || undefined;
      const testId = node.getAttribute('data-testid') || undefined;
      const isInteractive = INTERACTIVE_TAGS.has(node.tagName)
        || INTERACTIVE_ROLES.has(role || '')
        || node.hasAttribute('onclick')
        || node.getAttribute('tabindex') !== null;

      if (interactiveOnly && !isInteractive) { node = walker.nextNode(); continue; }

      // Build a unique CSS selector
      let cssSelector;
      if (node.id) {
        cssSelector = '#' + CSS.escape(node.id);
      } else if (testId) {
        cssSelector = '[data-testid="' + testId + '"]';
      } else {
        const path = [];
        let el = node;
        while (el && el !== document.body) {
          const parent = el.parentElement;
          if (!parent) break;
          const siblings = Array.from(parent.children).filter(s => s.tagName === el.tagName);
          if (siblings.length > 1) {
            const idx = siblings.indexOf(el) + 1;
            path.unshift(el.tagName.toLowerCase() + ':nth-of-type(' + idx + ')');
          } else {
            path.unshift(el.tagName.toLowerCase());
          }
          el = parent;
        }
        cssSelector = path.join(' > ');
      }

      const text = (node.textContent || '').trim().slice(0, 200);

      elements.push({
        tag,
        id: node.id || undefined,
        classes: Array.from(node.classList),
        text,
        selector: cssSelector,
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        role,
        testId,
        interactive: isInteractive,
        disabled: node.hasAttribute('disabled'),
        checked: 'checked' in node ? node.checked : undefined,
        focused: document.activeElement === node,
        visible: true,
      });
    }
    node = walker.nextNode();
  }

  return elements;
}`;
