/**
 * Phase 5.1 Tiptap composer editor (shell).
 *
 * Scope for this slice: a plain Tiptap ProseMirror editor that behaves
 * like a richer textarea, plus a paste handler that intercepts
 * clipboard image data and forwards it as a PendingAttachment. That
 * alone fixes the headline UX bug where macOS `cmd+shift+4`
 * screenshots pasted into the composer rendered the `/var/folders/…/
 * Screenshot.png` temp path as text.
 *
 * Explicitly out of scope for this slice (follow-ups):
 *   - Mentions (@file) — Tiptap suggestion extension
 *   - Slash commands (/new, /stop, /model, /mcp)
 *   - File drop (handled here at the Composer layer via DragEvent,
 *     coming next)
 *   - Rich formatting (bold/italic/code) UI affordances
 */

import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import History from "@tiptap/extension-history";
import Paragraph from "@tiptap/extension-paragraph";
import Placeholder from "@tiptap/extension-placeholder";
import Text from "@tiptap/extension-text";
import { EditorContent, type Editor as TiptapEditor, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useRef } from "react";
import {
	blobToBase64,
	newAttachmentId,
	type PendingAttachment,
} from "./attachments";

export interface EditorProps {
	value: string;
	onChange: (text: string) => void;
	onSubmit: () => void;
	onAttachImage: (attachment: PendingAttachment) => void;
	placeholder?: string;
	disabled?: boolean;
	autoFocus?: boolean;
}

/** Minimal extension set — prose-only, no headings / lists / code blocks. */
const EXTENSIONS = [
	Document,
	Paragraph,
	Text,
	HardBreak,
	History,
	Placeholder.configure({
		placeholder: ({ editor }) => {
			const attr = editor.options.editorProps?.attributes;
			if (attr && typeof attr === "object" && "data-placeholder" in attr) {
				return (attr["data-placeholder"] as string) ?? "Send a message…";
			}
			return "Send a message…";
		},
		includeChildren: true,
	}),
];

export function Editor({
	value,
	onChange,
	onSubmit,
	onAttachImage,
	placeholder = "Send a message…",
	disabled = false,
	autoFocus = false,
}: EditorProps) {
	const onSubmitRef = useRef(onSubmit);
	onSubmitRef.current = onSubmit;
	const onAttachImageRef = useRef(onAttachImage);
	onAttachImageRef.current = onAttachImage;

	// Clipboard → PendingAttachment: called when the user pastes clipboard
	// items. Returns true when the event was fully handled (ProseMirror
	// shouldn't also insert text).
	const handlePaste = useCallback((view: unknown, event: ClipboardEvent) => {
		const data = event.clipboardData;
		if (!data) return false;
		const items = Array.from(data.items);
		const imageItems = items.filter((item) =>
			item.type.startsWith("image/"),
		);
		if (imageItems.length === 0) return false;

		// Defer parsing + don't let the editor also insert a raw file path.
		event.preventDefault();
		for (const item of imageItems) {
			const blob = item.getAsFile();
			if (!blob) continue;
			void blobToBase64(blob)
				.then((base64) => {
					onAttachImageRef.current({
						id: newAttachmentId(),
						data: base64,
						mediaType: blob.type || "image/png",
						filename: blob.name || undefined,
						sizeBytes: blob.size,
					});
				})
				.catch((err) => {
					console.error("composer paste: failed to read image", err);
				});
		}
		return true;
	}, []);

	const editor = useEditor({
		extensions: EXTENSIONS,
		editable: !disabled,
		autofocus: autoFocus,
		content: value,
		editorProps: {
			attributes: {
				class:
					"prose prose-sm dark:prose-invert placeholder:text-muted-foreground min-h-[28px] max-h-60 overflow-y-auto w-full outline-none text-sm",
				"data-placeholder": placeholder,
			},
			handlePaste: (view, event) =>
				handlePaste(view, event as ClipboardEvent),
			handleKeyDown: (_view, event) => {
				if (
					event.key === "Enter" &&
					!event.shiftKey &&
					!event.metaKey &&
					!event.ctrlKey
				) {
					event.preventDefault();
					onSubmitRef.current();
					return true;
				}
				return false;
			},
		},
		onUpdate: ({ editor: ed }) => {
			onChange(ed.getText());
		},
	});

	// Sync external value → editor (e.g. error-restore after a failed
	// submit, or switching drafts across sessions).
	useEffect(() => {
		if (!editor) return;
		const current = editor.getText();
		if (current === value) return;
		editor.commands.setContent(value, { emitUpdate: false });
	}, [editor, value]);

	useEffect(() => {
		if (!editor) return;
		editor.setEditable(!disabled);
	}, [editor, disabled]);

	if (!editor) return null;
	return <EditorContent editor={editor} />;
}

export type { TiptapEditor };
