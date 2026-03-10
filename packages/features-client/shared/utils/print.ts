/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface PrintOptions {
  /** 인쇄 영역에 적용할 CSS (기본: 테이블/텍스트 스타일) */
  styles?: string;
  /** iframe 너비 (기본: "800px") */
  width?: string;
}

/* -------------------------------------------------------------------------------------------------
 * Constants
 * -----------------------------------------------------------------------------------------------*/

const DEFAULT_STYLES = [
  "body { margin: 0; padding: 16px; font-family: sans-serif; background: #fff; color: #000; }",
  "table { border-collapse: collapse; width: 100%; }",
  "td, th { border: 1px solid #000; padding: 12px; font-size: 14px; }",
].join("\n");

/* -------------------------------------------------------------------------------------------------
 * printElement
 * -----------------------------------------------------------------------------------------------*/

/**
 * DOM 요소를 격리된 iframe에 복제하여 인쇄합니다.
 * iframe 격리를 통해 앱 CSS(oklch 등)의 영향을 받지 않습니다.
 */
export function printElement(element: HTMLElement, options: PrintOptions = {}) {
  const { styles = DEFAULT_STYLES, width = "800px" } = options;

  const iframe = createIsolatedIframe(element, styles, width);
  if (!iframe) return;

  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();
  setTimeout(() => document.body.removeChild(iframe), 1000);
}

/* -------------------------------------------------------------------------------------------------
 * Helpers
 * -----------------------------------------------------------------------------------------------*/

function createIsolatedIframe(element: HTMLElement, styles: string, width: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.top = "-10000px";
  iframe.style.left = "-10000px";
  iframe.style.width = width;
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    return null;
  }

  const style = doc.createElement("style");
  style.textContent = styles;
  doc.head.appendChild(style);
  doc.body.appendChild(element.cloneNode(true));
  doc.close();

  return iframe;
}
