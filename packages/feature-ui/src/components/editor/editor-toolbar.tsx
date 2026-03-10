/**
 * EditorToolbar - TipTap 에디터 포맷팅 툴바
 */
import type { Editor } from "@tiptap/react";
import type { ToolbarVariant } from "./types";

interface EditorToolbarProps {
  editor: Editor | null;
  variant?: ToolbarVariant;
}

export function EditorToolbar({ editor, variant = "full" }: EditorToolbarProps) {
  if (!editor || variant === "none") return null;

  return (
    <div className="flex flex-wrap gap-0.5 border rounded-md p-1 bg-muted/30">
      {/* Text 포맷 */}
      <ToolbarButton
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        label="B"
        title="Bold (Ctrl+B)"
        className="font-bold"
      />
      <ToolbarButton
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        label="I"
        title="Italic (Ctrl+I)"
        className="italic"
      />
      <ToolbarButton
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        label="S"
        title="Strikethrough"
        className="line-through"
      />
      <ToolbarButton
        active={editor.isActive("highlight")}
        onClick={() => editor.chain().focus().toggleHighlight().run()}
        label="H"
        title="Highlight"
        className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5"
      />

      <ToolbarDivider />

      {/* Heading */}
      <ToolbarButton
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        label="H1"
        title="Heading 1"
      />
      <ToolbarButton
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        label="H2"
        title="Heading 2"
      />
      <ToolbarButton
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        label="H3"
        title="Heading 3"
      />

      <ToolbarDivider />

      {/* List */}
      <ToolbarButton
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        label="UL"
        title="Bullet List"
      />
      <ToolbarButton
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        label="OL"
        title="Ordered List"
      />

      {variant === "full" && (
        <>
          <ToolbarDivider />

          {/* Block */}
          <ToolbarButton
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            label="Q"
            title="Blockquote"
          />
          <ToolbarButton
            active={editor.isActive("codeBlock")}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            label="<>"
            title="Code Block"
          />
          <ToolbarButton
            active={false}
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            label="HR"
            title="Horizontal Rule"
          />

          <ToolbarDivider />

          {/* Align */}
          <ToolbarButton
            active={editor.isActive({ textAlign: "left" })}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            label="L"
            title="Align Left"
          />
          <ToolbarButton
            active={editor.isActive({ textAlign: "center" })}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            label="C"
            title="Align Center"
          />
          <ToolbarButton
            active={editor.isActive({ textAlign: "right" })}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            label="R"
            title="Align Right"
          />

          <ToolbarDivider />

          {/* Insert */}
          <ToolbarButton
            active={false}
            onClick={() => {
              const url = window.prompt("이미지 URL을 입력하세요:");
              if (url) editor.chain().focus().setImage({ src: url }).run();
            }}
            label="IMG"
            title="Insert Image"
          />
        </>
      )}
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  label,
  title,
  className,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 text-xs rounded transition-colors ${className ?? ""} ${
        active
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted text-muted-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="w-px bg-border mx-0.5 self-stretch" />;
}
