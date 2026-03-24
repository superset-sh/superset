import "highlight.js/styles/github-dark.css";

import { cn } from "@superset/ui/utils";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { type MutableRefObject, useEffect, useRef } from "react";
import { useMarkdownStyle } from "renderer/stores";
import { defaultConfig } from "../../styles/default/config";
import { tufteConfig } from "../../styles/tufte/config";
import { SelectionContextMenu } from "../SelectionContextMenu";
import { BubbleMenuToolbar } from "./components/BubbleMenuToolbar";
import { createMarkdownExtensions } from "./createMarkdownExtensions";

const styleConfigs = {
	default: defaultConfig,
	tufte: tufteConfig,
} as const;

export interface MarkdownEditorAdapter {
	focus(): void;
	getValue(): string;
	setValue(value: string): void;
	dispose(): void;
}

interface TipTapMarkdownRendererProps {
	value: string;
	style?: keyof typeof styleConfigs;
	className?: string;
	editable?: boolean;
	editorRef?: MutableRefObject<MarkdownEditorAdapter | null>;
	onChange?: (value: string) => void;
	onNormalizedValue?: (value: string) => void;
	onSave?: () => void;
}

function getEditorMarkdown(editor: Editor): string {
	const storage = editor.storage as unknown as Record<
		string,
		{ getMarkdown?: () => string }
	>;

	return storage.markdown?.getMarkdown?.() ?? "";
}

function createMarkdownEditorAdapter(
	editor: Editor,
	normalizedContentRef: MutableRefObject<string | null>,
	onNormalizedValueRef: MutableRefObject<((value: string) => void) | undefined>,
): MarkdownEditorAdapter {
	let disposed = false;

	return {
		focus() {
			editor.commands.focus();
		},
		getValue() {
			return getEditorMarkdown(editor);
		},
		setValue(value) {
			editor.commands.setContent(value, { emitUpdate: false });
			const normalizedValue = getEditorMarkdown(editor);
			normalizedContentRef.current = normalizedValue;
			onNormalizedValueRef.current?.(normalizedValue);
		},
		dispose() {
			if (disposed) return;
			disposed = true;
		},
	};
}

export function TipTapMarkdownRenderer({
	value,
	style: styleProp,
	className,
	editable = false,
	editorRef,
	onChange,
	onNormalizedValue,
	onSave,
}: TipTapMarkdownRendererProps) {
	const globalStyle = useMarkdownStyle();
	const style = styleProp ?? globalStyle;
	const config = styleConfigs[style];
	const articleRef = useRef<HTMLElement | null>(null);
	const onChangeRef = useRef(onChange);
	const onNormalizedValueRef = useRef(onNormalizedValue);
	const onSaveRef = useRef(onSave);

	onChangeRef.current = onChange;
	onNormalizedValueRef.current = onNormalizedValue;
	onSaveRef.current = onSave;
	const normalizedContentRef = useRef<string | null>(null);

	const editor = useEditor({
		immediatelyRender: false,
		editable,
		extensions: createMarkdownExtensions({
			editable,
			onSaveRef,
		}),
		content: value,
		editorProps: {
			attributes: {
				class: cn("focus:outline-none", editable && "min-h-[100px]"),
			},
		},
		onUpdate: ({ editor: currentEditor }) => {
			const markdown = getEditorMarkdown(currentEditor);
			if (normalizedContentRef.current === null) {
				normalizedContentRef.current = markdown;
				return;
			}
			if (markdown === normalizedContentRef.current) {
				return;
			}

			normalizedContentRef.current = markdown;
			onChangeRef.current?.(markdown);
		},
	});

	useEffect(() => {
		if (!editor) {
			return;
		}

		const currentValue = getEditorMarkdown(editor);
		normalizedContentRef.current = currentValue;
		if (currentValue === value) {
			onNormalizedValueRef.current?.(currentValue);
			return;
		}

		editor.commands.setContent(value, { emitUpdate: false });
		const normalizedValue = getEditorMarkdown(editor);
		normalizedContentRef.current = normalizedValue;
		onNormalizedValueRef.current?.(normalizedValue);
	}, [editor, value]);

	useEffect(() => {
		if (!editor) {
			return;
		}

		// TipTap v3 emits onUpdate by default when toggling editable state.
		// Suppress that so update events only represent content changes.
		editor.setEditable(editable, false);
	}, [editable, editor]);

	useEffect(() => {
		if (!editorRef || !editor) {
			return;
		}

		const adapter = createMarkdownEditorAdapter(
			editor,
			normalizedContentRef,
			onNormalizedValueRef,
		);
		editorRef.current = adapter;

		return () => {
			if (editorRef.current === adapter) {
				editorRef.current = null;
			}
			adapter.dispose();
		};
	}, [editor, editorRef]);

	const content = (
		<div
			className={cn(
				"markdown-renderer h-full overflow-y-auto select-text",
				config.wrapperClass,
				className,
			)}
		>
			{editable && editor && (
				<BubbleMenu
					editor={editor}
					options={{
						placement: "top",
						offset: { mainAxis: 8 },
					}}
					shouldShow={({ editor: e, from, to }) => {
						if (from === to) return false;
						if (e.isActive("codeBlock")) return false;
						return true;
					}}
				>
					<BubbleMenuToolbar editor={editor} />
				</BubbleMenu>
			)}
			<article ref={articleRef} className={config.articleClass}>
				<EditorContent editor={editor} />
			</article>
		</div>
	);

	if (editable) {
		return content;
	}

	return (
		<SelectionContextMenu selectAllContainerRef={articleRef}>
			{content}
		</SelectionContextMenu>
	);
}
