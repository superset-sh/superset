/**
 * TipTapViewer - TipTap JSON 콘텐츠 읽기 전용 렌더러
 *
 * generateHTML()로 TipTap JSON을 HTML로 변환한 뒤,
 * DOMPurify로 새니타이징하여 XSS 공격을 방지합니다.
 *
 * 사용 예:
 * <TipTapViewer content={node.content} />
 */
import { useMemo } from "react";
import { generateHTML } from "@tiptap/html";
import DOMPurify from "dompurify";
import { createViewerExtensions } from "./editor-extensions";

interface TipTapViewerProps {
  /** TipTap JSON 콘텐츠 */
  content: Record<string, unknown>;
  /** 추가 className */
  className?: string;
}

const viewerExtensions = createViewerExtensions();

export function TipTapViewer({ content, className }: TipTapViewerProps) {
  // DOMPurify를 사용하여 XSS 공격 벡터를 제거한 안전한 HTML을 생성합니다
  const sanitizedHtml = useMemo(() => {
    if (!content || !content.type) return "";
    try {
      const html = generateHTML(content as any, viewerExtensions);
      return DOMPurify.sanitize(html);
    } catch {
      return "";
    }
  }, [content]);

  if (!sanitizedHtml) return null;

  return (
    <div
      className={`prose prose-sm prose-neutral dark:prose-invert max-w-none ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}
