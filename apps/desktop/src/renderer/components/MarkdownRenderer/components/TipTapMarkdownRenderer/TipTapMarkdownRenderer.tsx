import "highlight.js/styles/github-dark.css";

import { cn } from "@superset/ui/utils";
import { Extension } from "@tiptap/core";
import { Blockquote } from "@tiptap/extension-blockquote";
import { Bold } from "@tiptap/extension-bold";
import { BulletList } from "@tiptap/extension-bullet-list";
import { Code } from "@tiptap/extension-code";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Document } from "@tiptap/extension-document";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Heading } from "@tiptap/extension-heading";
import { History } from "@tiptap/extension-history";
import { HorizontalRule } from "@tiptap/extension-horizontal-rule";
import Image from "@tiptap/extension-image";
import { Italic } from "@tiptap/extension-italic";
import Link from "@tiptap/extension-link";
import { ListItem } from "@tiptap/extension-list-item";
import { OrderedList } from "@tiptap/extension-ordered-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Strike } from "@tiptap/extension-strike";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Text } from "@tiptap/extension-text";
import { Underline } from "@tiptap/extension-underline";
import {
	type Editor,
	EditorContent,
	ReactNodeViewRenderer,
	useEditor,
} from "@tiptap/react";
import { common, createLowlight } from "lowlight";
import { type MutableRefObject, useEffect, useRef } from "react";
import { useMarkdownStyle } from "renderer/stores";
import { Markdown } from "tiptap-markdown";
import { defaultConfig } from "../../styles/default/config";
import { tufteConfig } from "../../styles/tufte/config";
import { SelectionContextMenu } from "../SelectionContextMenu";
import { EditableCodeBlockView } from "./components/EditableCodeBlockView";
import { ReadOnlyCodeBlockView } from "./components/ReadOnlyCodeBlockView";
import { ReadOnlySafeImageView } from "./components/ReadOnlySafeImageView";

const lowlight = createLowlight(common);

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
	onSave?: () => void;
}

function getEditorMarkdown(editor: Editor): string {
	const storage = editor.storage as unknown as Record<
		string,
		{ getMarkdown?: () => string }
	>;

	return storage.markdown?.getMarkdown?.() ?? "";
}

function createMarkdownEditorAdapter(editor: Editor): MarkdownEditorAdapter {
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
		},
		dispose() {
			if (disposed) return;
			disposed = true;
		},
	};
}

const SafeImage = Image.extend({
	addNodeView() {
		return ReactNodeViewRenderer(ReadOnlySafeImageView);
	},
});

const ReadOnlyCodeBlock = CodeBlockLowlight.extend({
	addNodeView() {
		return ReactNodeViewRenderer(ReadOnlyCodeBlockView);
	},
});

const EditableCodeBlock = CodeBlockLowlight.extend({
	addNodeView() {
		return ReactNodeViewRenderer(EditableCodeBlockView);
	},
});

const EditorHotkeys = Extension.create<{
	onSaveRef: MutableRefObject<(() => void) | undefined>;
}>({
	name: "editorHotkeys",

	addKeyboardShortcuts() {
		return {
			"Mod-s": () => {
				if (!this.editor.isEditable) {
					return false;
				}

				this.options.onSaveRef.current?.();
				return true;
			},
			Tab: ({ editor }) => {
				if (!editor.isEditable) {
					return false;
				}

				if (editor.commands.sinkListItem("listItem")) return true;
				if (editor.commands.sinkListItem("taskItem")) return true;
				return true;
			},
			"Shift-Tab": ({ editor }) => {
				if (!editor.isEditable) {
					return false;
				}

				if (editor.commands.liftListItem("listItem")) return true;
				if (editor.commands.liftListItem("taskItem")) return true;
				return true;
			},
		};
	},
});

export function TipTapMarkdownRenderer({
	value,
	style: styleProp,
	className,
	editable = false,
	editorRef,
	onChange,
	onSave,
}: TipTapMarkdownRendererProps) {
	const globalStyle = useMarkdownStyle();
	const style = styleProp ?? globalStyle;
	const config = styleConfigs[style];
	const articleRef = useRef<HTMLElement | null>(null);
	const onChangeRef = useRef(onChange);
	const onSaveRef = useRef(onSave);

	onChangeRef.current = onChange;
	onSaveRef.current = onSave;

	const editor = useEditor({
		immediatelyRender: false,
		editable,
		extensions: [
			Document,
			Text,
			Paragraph,
			Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
			Bold,
			Italic,
			Strike,
			Underline,
			Code.configure({
				HTMLAttributes: {
					class: "rounded bg-muted px-1.5 py-0.5 font-mono text-sm",
				},
			}),
			(editable ? EditableCodeBlock : ReadOnlyCodeBlock).configure({
				lowlight,
				HTMLAttributes: editable
					? {
							class:
								"my-3 overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm",
						}
					: undefined,
			}),
			BulletList,
			OrderedList,
			ListItem,
			TaskList.configure({
				HTMLAttributes: { class: "list-none pl-0" },
			}),
			TaskItem.configure({
				nested: true,
				HTMLAttributes: { class: "list-none flex items-start gap-2" },
			}),
			Blockquote,
			HorizontalRule,
			HardBreak,
			History,
			Link.configure({
				openOnClick: !editable,
				HTMLAttributes: {
					class:
						"text-primary underline underline-offset-2 hover:text-primary/80",
					target: "_blank",
					rel: "noopener noreferrer",
				},
			}),
			SafeImage,
			Table.configure({
				resizable: false,
				HTMLAttributes: {
					class: "markdown-table my-4 min-w-full border-collapse",
				},
			}),
			TableRow,
			TableHeader.configure({
				HTMLAttributes: {
					class: "bg-muted px-4 py-2 text-left text-sm font-semibold align-top",
				},
			}),
			TableCell.configure({
				HTMLAttributes: {
					class: "border-t border-border px-4 py-2 text-sm align-top",
				},
			}),
			Markdown.configure({
				html: true,
				transformPastedText: true,
				transformCopiedText: true,
			}),
			EditorHotkeys.configure({
				onSaveRef,
			}),
		],
		content: value,
		editorProps: {
			attributes: {
				class: cn("focus:outline-none", editable && "min-h-[100px]"),
			},
		},
		onUpdate: ({ editor: currentEditor }) => {
			onChangeRef.current?.(getEditorMarkdown(currentEditor));
		},
	});

	useEffect(() => {
		if (!editor) {
			return;
		}

		const currentValue = getEditorMarkdown(editor);
		if (currentValue === value) {
			return;
		}

		editor.commands.setContent(value, { emitUpdate: false });
	}, [editor, value]);

	useEffect(() => {
		if (!editor) {
			return;
		}

		editor.setEditable(editable);
	}, [editable, editor]);

	useEffect(() => {
		if (!editorRef || !editor) {
			return;
		}

		const adapter = createMarkdownEditorAdapter(editor);
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
