import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

/* -------------------------------------------------------------------------------------------------
 * Types
 * -----------------------------------------------------------------------------------------------*/

interface PdfDownloadOptions {
  /** PDF 파일명 (확장자 포함) */
  filename: string;
  /** 인쇄 영역에 적용할 CSS (기본: 테이블/텍스트 스타일) */
  styles?: string;
  /** iframe 너비 (기본: "800px") */
  width?: string;
  /** html2canvas 렌더링 스케일 (기본: 2) */
  scale?: number;
  /** PDF 페이지 포맷 (기본: "a4") */
  format?: string | [number, number];
  /** PDF 방향 (기본: "portrait") */
  orientation?: "portrait" | "landscape";
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
 * downloadPdf
 * -----------------------------------------------------------------------------------------------*/

/**
 * DOM 요소를 PDF로 변환하여 다운로드합니다.
 * iframe 격리를 통해 앱 CSS(oklch 등)가 html2canvas 렌더링에 영향을 주지 않습니다.
 */
export async function downloadPdf(element: HTMLElement, options: PdfDownloadOptions) {
  const {
    filename,
    styles = DEFAULT_STYLES,
    width = "800px",
    scale = 2,
    format = "a4",
    orientation = "portrait",
  } = options;

  const iframe = createIsolatedIframe(element, styles, width);
  if (!iframe) throw new Error("Failed to create isolated iframe for PDF rendering");

  try {
    const canvas = await html2canvas(iframe.contentDocument!.body, {
      scale,
      useCORS: true,
    });

    const pdf = new jsPDF({ orientation, unit: "mm", format });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const ratio = canvas.width / canvas.height;
    const pageRatio = pageWidth / pageHeight;

    let drawWidth: number;
    let drawHeight: number;

    if (ratio > pageRatio) {
      drawWidth = pageWidth;
      drawHeight = pageWidth / ratio;
    } else {
      drawHeight = pageHeight;
      drawWidth = pageHeight * ratio;
    }

    const imgData = canvas.toDataURL("image/png");
    pdf.addImage(imgData, "PNG", 0, 0, drawWidth, drawHeight);
    pdf.save(filename);
  } finally {
    document.body.removeChild(iframe);
  }
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
