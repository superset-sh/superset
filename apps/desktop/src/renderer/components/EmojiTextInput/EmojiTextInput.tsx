import { cn } from "@superset/ui/utils";
import { Extension } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { EmojiSuggestionPluginKey } from "@tiptap/extension-emoji";
import { History } from "@tiptap/extension-history";
import { Paragraph } from "@tiptap/extension-paragraph";
import Placeholder from "@tiptap/extension-placeholder";
import { Text } from "@tiptap/extension-text";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect } from "react";
import { EmojiSuggestion } from "renderer/components/MarkdownEditor/components/EmojiSuggestion";

/** Doc that allows exactly one paragraph — no block splitting. */
const SingleLineDocument = Document.extend({
	content: "paragraph",
});

/** Blocks Enter / Shift-Enter so the editor stays on one line. */
const NoLineBreaks = Extension.create<{ onEnter?: () => void }>({
	name: "noLineBreaks",
	addOptions() {
		return { onEnter: undefined };
	},
	addKeyboardShortcuts() {
		const guarded = ({ editor }: { editor: { state: unknown } }) => {
			// If the emoji suggestion popup is open, let it handle Enter (select).
			const emojiState = EmojiSuggestionPluginKey.getState(
				editor.state as Parameters<typeof EmojiSuggestionPluginKey.getState>[0],
			) as { active?: boolean } | undefined;
			if (emojiState?.active) return false;
			this.options.onEnter?.();
			return true;
		};
		return {
			Enter: guarded,
			"Shift-Enter": guarded,
		};
	},
});

interface EmojiTextInputProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	className?: string;
	onEnter?: () => void;
	onBlur?: (value: string) => void;
}

function getPlainText(
	editor: {
		state: { doc: { textContent: string } };
	} | null,
): string {
	return editor?.state.doc.textContent ?? "";
}

export function EmojiTextInput({
	value,
	onChange,
	placeholder,
	className,
	onEnter,
	onBlur,
}: EmojiTextInputProps) {
	const editor = useEditor({
		immediatelyRender: false,
		extensions: [
			SingleLineDocument,
			Text,
			Paragraph,
			History,
			Placeholder.configure({
				placeholder: placeholder ?? "",
				emptyNodeClass:
					"first:before:text-muted-foreground first:before:float-left first:before:h-0 first:before:pointer-events-none first:before:content-[attr(data-placeholder)]",
			}),
			EmojiSuggestion,
			NoLineBreaks.configure({ onEnter }),
		],
		content: value,
		editorProps: {
			attributes: {
				class: cn(
					"focus:outline-none whitespace-nowrap overflow-hidden text-ellipsis",
					className,
				),
			},
		},
		onUpdate: ({ editor: e }) => {
			onChange(getPlainText(e));
		},
		onBlur: ({ editor: e }) => {
			onBlur?.(getPlainText(e));
		},
	});

	useEffect(() => {
		if (!editor) return;
		if (editor.isFocused) return;
		const current = getPlainText(editor);
		if (current === value) return;
		editor.commands.setContent(value, { emitUpdate: false });
	}, [value, editor]);

	return <EditorContent editor={editor} className="w-full" />;
}
