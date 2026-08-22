// Browser Design Mode — self-contained JS strings injected into the guest page
// via executeJavaScript(). The guest webview has no preload, so everything the
// overlay needs must live in one plain-JS string that runs in the page's own
// world. State lives on window.__supersetDesignMode so the teardown/await
// scripts can reach it across separate executeJavaScript calls.

import {
	DESIGN_MODE_BUDGET,
	DESIGN_MODE_SAFE_ATTRIBUTE_NAMES,
	DESIGN_MODE_SECRET_PATTERNS,
	DESIGN_MODE_STYLE_PROPERTIES,
} from "shared/browser-design-mode";

export type DesignModeScriptAction = "arm" | "awaitClick" | "teardown";

export function buildDesignModeScript(action: DesignModeScriptAction): string {
	switch (action) {
		case "arm":
			return ARM_SCRIPT;
		case "awaitClick":
			return AWAIT_CLICK_SCRIPT;
		case "teardown":
			return TEARDOWN_SCRIPT;
	}
}

// arm: install the shadow-root overlay, hover tracking, and extraction logic.
const ARM_SCRIPT = `(function() {
  'use strict';

  // Always tear down pre-existing state before arming: a malicious page could
  // predefine window.__supersetDesignMode with a fake extractPayload. Tearing
  // down unconditionally guarantees the freshly installed extraction logic is
  // the only code that runs.
  if (window.__supersetDesignMode) {
    try {
      // cancelAwait (when a selection is pending) also settles that pending
      // executeJavaScript promise; bare cleanup would leave it dangling.
      if (typeof window.__supersetDesignMode.cancelAwait === 'function') {
        window.__supersetDesignMode.cancelAwait();
      } else if (typeof window.__supersetDesignMode.cleanup === 'function') {
        window.__supersetDesignMode.cleanup();
      }
    } catch (e) {}
    delete window.__supersetDesignMode;
  }

  // Interpolated from shared/browser-design-mode.ts so guest-side clamping
  // and redaction can never drift from main's clampDesignModePayload.
  var BUDGET = ${JSON.stringify(DESIGN_MODE_BUDGET)};
  var TEXT_NODE_SCAN_LIMIT = 80;
  var SIBLING_SCAN_LIMIT = 80;

  var SAFE_ATTRS = new Set(${JSON.stringify([...DESIGN_MODE_SAFE_ATTRIBUTE_NAMES])});

  var SECRET_PATTERNS = ${JSON.stringify(DESIGN_MODE_SECRET_PATTERNS)};

  var SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

  var STYLE_PROPS = ${JSON.stringify(DESIGN_MODE_STYLE_PROPERTIES)};

  function clampStr(s, max) {
    if (!s || typeof s !== 'string') return '';
    if (s.length <= max) return s;
    return s.slice(0, max) + ' (truncated)';
  }

  function containsSecret(value) {
    if (!value) return false;
    var lower = value.toLowerCase();
    for (var i = 0; i < SECRET_PATTERNS.length; i++) {
      if (lower.indexOf(SECRET_PATTERNS[i]) !== -1) return true;
    }
    return false;
  }

  function sanitizeUrl(url) {
    try {
      var u = new URL(url);
      if (u.protocol === 'about:') {
        return u.toString() === 'about:blank' ? 'about:blank' : '';
      }
      if (!SAFE_URL_PROTOCOLS.has(u.protocol)) return '';
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch (e) {
      // Returning the raw URL on parse failure could preserve javascript:
      // URIs or other non-http schemes. Return empty instead.
      return '';
    }
  }

  function getBoundedText(el, max) {
    try {
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      var text = '';
      var inspected = 0;
      var node = walker.nextNode();
      while (node && text.length < max + 20 && inspected < TEXT_NODE_SCAN_LIMIT) {
        inspected++;
        var value = (node.nodeValue || '').replace(/\\s+/g, ' ');
        if (value.trim()) {
          text += (text && !text.endsWith(' ') ? ' ' : '') + value.trim();
        }
        node = walker.nextNode();
      }
      return clampStr(text, max);
    } catch (e) {
      return '';
    }
  }

  function getHtmlSnippet(el) {
    var clone = el.cloneNode(true);
    var scripts = clone.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) scripts[i].remove();
    return clampStr(clone.outerHTML || '', BUDGET.htmlSnippetMaxLength);
  }

  function getSafeAttributes(el) {
    var attrs = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var attr = el.attributes[i];
      var name = attr.name.toLowerCase();
      var isAria = name.indexOf('aria-') === 0;
      if (!SAFE_ATTRS.has(name) && !isAria) continue;
      var value = attr.value;
      if (containsSecret(value)) {
        attrs[name] = '[redacted]';
      } else if ((name === 'href' || name === 'src' || name === 'action') && value) {
        attrs[name] = sanitizeUrl(value);
      } else if (name === 'class') {
        attrs[name] = clampStr(value, 200);
      } else {
        attrs[name] = value;
      }
    }
    return attrs;
  }

  function getAccessibility(el) {
    var role = el.getAttribute('role') || el.tagName.toLowerCase();
    var ariaLabel = el.getAttribute('aria-label') || null;
    var accessibleName = null;
    if (ariaLabel) {
      accessibleName = ariaLabel;
    } else {
      var tag = el.tagName.toLowerCase();
      if (tag === 'button' || tag === 'a' || tag === 'label') {
        accessibleName = getBoundedText(el, 100);
      } else if (el.getAttribute('title')) {
        accessibleName = el.getAttribute('title');
      } else if (el.getAttribute('alt')) {
        accessibleName = el.getAttribute('alt');
      }
    }
    return { role: role, accessibleName: accessibleName, ariaLabel: ariaLabel };
  }

  function getComputedStyleSubset(el) {
    var cs = window.getComputedStyle(el);
    var result = {};
    for (var i = 0; i < STYLE_PROPS.length; i++) {
      result[STYLE_PROPS[i]] = cs.getPropertyValue(
        STYLE_PROPS[i].replace(/[A-Z]/g, function(m) { return '-' + m.toLowerCase(); })
      ) || '';
    }
    return result;
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, function(ch) {
      return '\\\\' + ch;
    });
  }

  function looksHashy(value) {
    return /^[A-Za-z0-9_-]{12,}$/.test(value) && /\\d/.test(value) && /[A-Z]/.test(value);
  }

  function getStableClasses(el, maxCount) {
    if (!el.classList) return [];
    var result = [];
    for (var i = 0; i < el.classList.length && result.length < maxCount; i++) {
      var cls = el.classList[i];
      if (!cls || cls.length > 60 || containsSecret(cls)) continue;
      if (/^css-[a-z0-9]+$/i.test(cls) || looksHashy(cls)) continue;
      result.push(cls);
    }
    return result;
  }

  function buildSelectorPart(el) {
    var tag = el.tagName.toLowerCase();
    var id = el.id;
    if (id && !containsSecret(id)) {
      return tag + '#' + cssEscape(id);
    }
    var classes = getStableClasses(el, 2);
    if (classes.length > 0) {
      return tag + classes.map(function(cls) { return '.' + cssEscape(cls); }).join('');
    }
    return tag;
  }

  function isUniqueSelector(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch (e) {
      return false;
    }
  }

  function getNthOfTypeSuffix(current) {
    var tag = current.tagName;
    var index = 1;
    var sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === tag) index++;
      sibling = sibling.previousElementSibling;
    }
    if (index > 1) return ':nth-of-type(' + index + ')';
    sibling = current.nextElementSibling;
    while (sibling) {
      if (sibling.tagName === tag) return ':nth-of-type(1)';
      sibling = sibling.nextElementSibling;
    }
    return '';
  }

  function buildSelector(el) {
    var parts = [];
    var current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body && parts.length < 10) {
      var part = buildSelectorPart(current);
      var parent = current.parentElement;
      if (parent && !isUniqueSelector([part].concat(parts).join(' > '))) {
        part += getNthOfTypeSuffix(current);
      }
      parts.unshift(part);
      var selector = parts.join(' > ');
      if (isUniqueSelector(selector)) {
        return clampStr(selector, BUDGET.selectorMaxLength);
      }
      current = parent;
    }
    return clampStr(parts.join(' > ') || el.tagName.toLowerCase(), BUDGET.selectorMaxLength);
  }

  function buildReadablePath(el) {
    var parts = [];
    var current = el;
    while (current && current !== document.documentElement && parts.length < 6) {
      var tag = current.tagName.toLowerCase();
      if (tag === 'html' || tag === 'body') break;
      var label = tag;
      var aria = current.getAttribute('aria-label');
      var role = current.getAttribute('role');
      var stableClasses = getStableClasses(current, 1);
      if (current.id && !containsSecret(current.id)) {
        label = '#' + cssEscape(current.id);
      } else if (aria && !containsSecret(aria)) {
        label = tag + '[aria-label="' + clampStr(aria, 40).replace(/"/g, '\\\\"') + '"]';
      } else if (role && !containsSecret(role)) {
        label = tag + '[role="' + clampStr(role, 30).replace(/"/g, '\\\\"') + '"]';
      } else if (stableClasses.length > 0) {
        label = '.' + cssEscape(stableClasses[0]);
      }
      parts.unshift(label);
      current = current.parentElement;
    }
    return clampStr(parts.join(' > '), BUDGET.pathMaxLength);
  }

  function getNearbyText(el) {
    var results = [];
    var parent = el.parentElement;
    if (!parent) return results;
    function addSiblingText(sibling) {
      if (!sibling) return;
      var text = getBoundedText(sibling, BUDGET.nearbyTextEntryMaxLength);
      if (text) results.push(text);
    }
    var inspected = 0;
    var previous = el.previousElementSibling;
    var next = el.nextElementSibling;
    while (
      results.length < BUDGET.nearbyTextMaxEntries &&
      inspected < SIBLING_SCAN_LIMIT &&
      (previous || next)
    ) {
      if (previous) {
        var previousSibling = previous;
        previous = previous.previousElementSibling;
        inspected++;
        addSiblingText(previousSibling);
      }
      if (next && results.length < BUDGET.nearbyTextMaxEntries && inspected < SIBLING_SCAN_LIMIT) {
        var nextSibling = next;
        next = next.nextElementSibling;
        inspected++;
        addSiblingText(nextSibling);
      }
    }
    return results;
  }

  function getAncestorPath(el) {
    var path = [];
    var current = el.parentElement;
    while (current && current !== document.documentElement && path.length < BUDGET.ancestorPathMaxEntries) {
      var tag = current.tagName.toLowerCase();
      var role = current.getAttribute('role');
      path.push(role ? tag + '[role=' + role + ']' : tag);
      current = current.parentElement;
    }
    return path;
  }

  function getFiberFromElement(el) {
    var keys = Object.keys(el);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf('__reactFiber$') === 0 || keys[i].indexOf('__reactInternalInstance$') === 0) {
        try {
          return el[keys[i]] || null;
        } catch (e) {
          return null;
        }
      }
    }
    return null;
  }

  function getComponentNameFromFiber(fiber) {
    if (!fiber) return null;
    var type = fiber.type || fiber.elementType;
    if (!type || typeof type === 'string') return null;
    if (type.displayName || type.name) return type.displayName || type.name;
    if (type.render && (type.render.displayName || type.render.name)) {
      return type.render.displayName || type.render.name;
    }
    if (type.type && (type.type.displayName || type.type.name)) {
      return type.type.displayName || type.type.name;
    }
    return null;
  }

  function shouldSkipReactName(name) {
    if (!name || name.length <= 2) return true;
    return /^(Fragment|Root|Routes|Route|Outlet|Provider|Consumer|Profiler|Suspense)$/.test(name) ||
      /(?:Boundary|BoundaryHandler|Router|Provider|Consumer|Context|Wrapper)$/.test(name) ||
      /^(Inner|Outer|Client|Server|RSC|Dev|React|Hot)/.test(name);
  }

  function cleanSourcePath(path) {
    if (!path) return '';
    return String(path)
      .replace(/[?#].*$/, '')
      .replace(/^turbopack:\\/\\/\\/\\[project\\]\\//, '')
      .replace(/^webpack-internal:\\/\\/\\/\\.\\//, '')
      .replace(/^webpack-internal:\\/\\/\\//, '')
      .replace(/^webpack:\\/\\/\\/\\.\\//, '')
      .replace(/^webpack:\\/\\/\\//, '')
      .replace(/^turbopack:\\/\\/\\//, '')
      .replace(/^https?:\\/\\/[^/]+\\//, '')
      .replace(/^file:\\/\\/\\//, '/')
      .replace(/^\\([^)]+\\)\\/\\.\\//, '')
      .replace(/^\\.\\//, '');
  }

  // Shallow one-line summary of a component fiber's props (Cursor passes
  // fiber props too). Primitives inline; everything else is just typed.
  function summarizeReactProps(props) {
    if (!props || typeof props !== 'object') return null;
    var parts = [];
    var keys = Object.keys(props);
    for (var i = 0; i < keys.length && parts.length < 8; i++) {
      var key = keys[i];
      if (key === 'children' || key === 'key' || key === 'ref') continue;
      var value = props[key];
      var rendered;
      var type = typeof value;
      if (value === null || value === undefined || type === 'boolean' || type === 'number') {
        rendered = String(value);
      } else if (type === 'string') {
        rendered = containsSecret(value) ? '"[redacted]"' : JSON.stringify(clampStr(value, 40));
      } else if (type === 'function') {
        rendered = 'fn';
      } else if (Array.isArray(value)) {
        rendered = '[…' + value.length + ']';
      } else {
        rendered = '{…}';
      }
      if (containsSecret(key)) continue;
      parts.push(key + '=' + rendered);
    }
    if (parts.length === 0) return null;
    if (keys.length > 8) parts.push('…');
    return clampStr(parts.join(' '), BUDGET.reactPropsMaxLength);
  }

  function getReactMetadata(el) {
    try {
      var fiber = getFiberFromElement(el);
      var components = [];
      var sourceFile = null;
      var reactProps = null;
      var depth = 0;
      while (fiber && depth < 35) {
        var name = getComponentNameFromFiber(fiber);
        if (name && !shouldSkipReactName(name) && components.indexOf(name) === -1 && components.length < 6) {
          components.push(name);
          // Props of the innermost named component — the instance the user
          // thinks of as "the thing" they clicked.
          if (!reactProps) {
            try { reactProps = summarizeReactProps(fiber.memoizedProps); } catch (e) {}
          }
        }
        var source = fiber._debugSource || (fiber._debugOwner && fiber._debugOwner._debugSource);
        if (!sourceFile && source && source.fileName && source.lineNumber) {
          sourceFile = cleanSourcePath(source.fileName) + ':' + source.lineNumber;
          if (containsSecret(sourceFile)) sourceFile = null;
        }
        fiber = fiber.return;
        depth++;
      }
      return {
        reactComponents: components.length > 0
          ? clampStr(components.slice().reverse().map(function(c) { return '<' + c + '>'; }).join(' '), BUDGET.reactComponentsMaxLength)
          : null,
        sourceFile: sourceFile ? clampStr(sourceFile, BUDGET.sourceFileMaxLength) : null,
        reactProps: reactProps
      };
    } catch (e) {
      return { reactComponents: null, sourceFile: null, reactProps: null };
    }
  }

  function extractPayload(el) {
    var rect = el.getBoundingClientRect();
    var react = getReactMetadata(el);
    return {
      page: {
        sanitizedUrl: sanitizeUrl(window.location.href),
        title: document.title || '',
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        devicePixelRatio: window.devicePixelRatio || 1
      },
      target: {
        tagName: el.tagName.toLowerCase(),
        selector: buildSelector(el),
        elementPath: buildReadablePath(el),
        cssClasses: containsSecret(el.getAttribute('class') || '')
          ? '[redacted]'
          : clampStr(el.getAttribute('class') || '', BUDGET.cssClassesMaxLength),
        reactComponents: react.reactComponents,
        reactProps: react.reactProps,
        sourceFile: react.sourceFile,
        textSnippet: getBoundedText(el, BUDGET.textSnippetMaxLength),
        htmlSnippet: getHtmlSnippet(el),
        attributes: getSafeAttributes(el),
        accessibility: getAccessibility(el),
        rectViewport: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        rectPage: {
          x: rect.x + window.scrollX,
          y: rect.y + window.scrollY,
          width: rect.width,
          height: rect.height
        },
        computedStyles: getComputedStyleSubset(el)
      },
      nearbyText: getNearbyText(el),
      ancestorPath: getAncestorPath(el),
      screenshot: null
    };
  }

  // --- Overlay UI ---
  // The host element is a full-viewport click catcher (pointer-events:all) so
  // the page never receives the selection click. Hit-testing the element under
  // the cursor is done by momentarily disabling the host's pointer events.
  var host = document.createElement('div');
  host.id = '__superset-design-mode-host';
  host.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:all;cursor:crosshair;';
  document.documentElement.appendChild(host);

  var shadow = host.attachShadow({ mode: 'closed' });

  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647;';
  shadow.appendChild(overlay);

  // Figma-style selection: 2px #0D99FF outline (Figma's own stroke width) with
  // a light tint fill. The thin white halo keeps the blue legible on dark or
  // blue page backgrounds; wider strokes overwhelm small inline targets.
  var highlightBox = document.createElement('div');
  highlightBox.style.cssText = 'position:fixed;border:2px solid #0d99ff;border-radius:2px;pointer-events:none;transition:all 0.05s ease-out;display:none;background:rgba(13,153,255,0.10);box-shadow:0 0 0 1px rgba(255,255,255,0.45),0 2px 10px rgba(0,0,0,0.25);';
  overlay.appendChild(highlightBox);

  // Solid blue pill, like Figma's layer/size label on a selection.
  var hoverLabel = document.createElement('div');
  hoverLabel.style.cssText = 'position:fixed;padding:3px 8px;background:#0d99ff;color:#fff;font:500 11px/1.4 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;border-radius:4px;pointer-events:none;white-space:nowrap;display:none;max-width:300px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 8px rgba(0,0,0,0.35);';
  overlay.appendChild(hoverLabel);

  var currentEl = null;

  function updateHighlight(el) {
    if (!el || el === document.documentElement || el === document.body) {
      highlightBox.style.display = 'none';
      hoverLabel.style.display = 'none';
      currentEl = null;
      return;
    }
    currentEl = el;
    var rect = el.getBoundingClientRect();
    highlightBox.style.left = rect.x + 'px';
    highlightBox.style.top = rect.y + 'px';
    highlightBox.style.width = rect.width + 'px';
    highlightBox.style.height = rect.height + 'px';
    highlightBox.style.display = 'block';

    var tag = el.tagName.toLowerCase();
    var role = el.getAttribute('role');
    var text = getBoundedText(el, 40);
    var parts = [tag];
    if (role) parts.push('role=' + role);
    if (text) parts.push('"' + text + '"');
    parts.push(Math.round(rect.width) + 'x' + Math.round(rect.height));
    hoverLabel.textContent = parts.join('  ');

    var labelY = rect.bottom + 6;
    if (labelY + 28 > window.innerHeight) {
      labelY = rect.top - 28;
    }
    hoverLabel.style.left = Math.max(4, rect.x) + 'px';
    hoverLabel.style.top = labelY + 'px';
    hoverLabel.style.display = 'block';
  }

  var lastPointer = null;

  function refreshHitTest() {
    if (!lastPointer) return;
    // Momentarily hide the overlay to hit-test the element underneath.
    host.style.pointerEvents = 'none';
    var el = document.elementFromPoint(lastPointer.x, lastPointer.y);
    host.style.pointerEvents = 'all';
    if (el) {
      requestAnimationFrame(function() { updateHighlight(el); });
    }
  }

  function onPointerMove(e) {
    lastPointer = { x: e.clientX, y: e.clientY };
    refreshHitTest();
  }

  host.addEventListener('mousemove', onPointerMove);
  // Wheel-scrolling fires no mousemove, but shifts which element sits under
  // the stationary cursor — re-hit-test so the highlight (and the element a
  // click captures) can't go stale.
  window.addEventListener('scroll', refreshHitTest, true);

  window.__supersetDesignMode = {
    host: host,
    extractPayload: extractPayload,
    getCurrentElement: function() { return currentEl; },
    // Freeze keeps the selected element outlined while the renderer shows the
    // composer anchored next to it; the label pill would duplicate the
    // composer's header, so it hides.
    freezeHighlight: function() {
      host.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('scroll', refreshHitTest, true);
      host.style.pointerEvents = 'none';
      host.style.cursor = 'default';
      hoverLabel.style.display = 'none';
    },
    cleanup: function() {
      host.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('scroll', refreshHitTest, true);
      try { host.remove(); } catch (e) {}
      delete window.__supersetDesignMode;
    }
  };

  return true;
})()`;

// awaitClick: resolve with the payload when the user clicks the overlay.
const AWAIT_CLICK_SCRIPT = `(async function() {
  // Hand the result to executeJavaScript through a native (intrinsic) Promise:
  // pages that replace the global Promise (e.g. Zone.js) would otherwise pass
  // a non-native thenable that Electron fails to unwrap. An async function's
  // promise comes from the engine intrinsic, which page code cannot reassign.
  return await new Promise(function(resolve, reject) {
    'use strict';
    var design = window.__supersetDesignMode;
    if (!design) {
      reject(new Error('Design mode not armed'));
      return;
    }

    function removeListeners() {
      design.host.removeEventListener('click', onSelect, true);
      design.host.removeEventListener('contextmenu', onSelect, true);
      window.removeEventListener('keydown', onKeyDown, true);
    }

    function onSelect(e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      removeListeners();
      var el = design.getCurrentElement();
      if (!el) {
        design.cleanup();
        resolve({ __supersetDesignCancelled: true });
        return;
      }
      var payload;
      try {
        payload = design.extractPayload(el);
      } catch (error) {
        design.cleanup();
        reject(error instanceof Error ? error : new Error('Failed to extract element context'));
        return;
      }
      // Freeze rather than remove so the user still sees which element was
      // selected while the composer is shown; teardown happens on exit/re-arm.
      design.freezeHighlight();
      resolve(payload);
    }

    function onKeyDown(e) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      removeListeners();
      design.cleanup();
      resolve({ __supersetDesignCancelled: true });
    }

    design.host.addEventListener('click', onSelect, true);
    design.host.addEventListener('contextmenu', onSelect, true);
    // The guest owns keyboard focus while the user hovers it, so Escape must
    // be handled here — the host renderer never sees the keystroke.
    window.addEventListener('keydown', onKeyDown, true);

    // Teardown settles the pending promise via this hook.
    design.cancelAwait = function() {
      removeListeners();
      design.cleanup();
      // Cancellation is a normal user flow; resolving a marker avoids a noisy
      // guest-console error while main still treats it as a cancel.
      resolve({ __supersetDesignCancelled: true });
    };
  });
})()`;

const TEARDOWN_SCRIPT = `(function() {
  'use strict';
  var design = window.__supersetDesignMode;
  if (!design) return true;
  if (design.cancelAwait) {
    design.cancelAwait();
  } else {
    design.cleanup();
  }
  return true;
})()`;
