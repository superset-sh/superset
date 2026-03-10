/**
 * TipTapEditor - 공용 리치텍스트 에디터
 *
 * 사용 예:
 * <TipTapEditor
 *   content={initialContent}
 *   onChange={(json) => save(json)}
 *   placeholder="내용을 작성하세요..."
 *   toolbar="full"
 * />
 */
import { useEditor, EditorContent } from "@tiptap/react";
import { createEditorExtensions } from "./editor-extensions";
import { EditorToolbar } from "./editor-toolbar";
import type { ToolbarVariant } from "./types";

interface TipTapEditorProps {
  /** 초기 콘텐츠 (TipTap JSON) */
  content?: Record<string, unknown>;
  /** 콘텐츠 변경 콜백 */
  onChange?: (json: Record<string, unknown>) => void;
  /** placeholder 텍스트 */
  placeholder?: string;
  /** 편집 가능 여부 */
  editable?: boolean;
  /** 툴바 variant */
  toolbar?: ToolbarVariant;
  /** 추가 className */
  className?: string;
  /** 에디터 최소 높이 */
  minHeight?: string;
}

export function TipTapEditor({
  content,
  onChange,
  placeholder = "내용을 작성하세요...",
  editable = true,
  toolbar = "full",
  className,
  minHeight = "200px",
}: TipTapEditorProps) {
  const editor = useEditor({
    extensions: createEditorExtensions({
      placeholder,
      enableImage: true,
      enableCodeHighlight: true,
    }),
    content: content as any,
    editable,
    onUpdate: ({ editor: e }) => {
      onChange?.(e.getJSON() as Record<string, unknown>);
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm prose-neutral dark:prose-invert max-w-none p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-ring ${className ?? ""}`,
        style: `min-height: ${minHeight}`,
      },
    },
  });

  if (!editor) return null;

  return (
    <div className="space-y-2">
      {editable && <EditorToolbar editor={editor} variant={toolbar} />}
      <EditorContent editor={editor} />
    </div>
  );
}
