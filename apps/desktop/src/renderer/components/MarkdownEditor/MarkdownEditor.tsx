import "highlight.js/styles/github-dark.css";
import "./markdown-editor.css";

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
import Placeholder from "@tiptap/extension-placeholder";
import { Strike } from "@tiptap/extension-strike";
import { TableKit } from "@tiptap/extension-table";
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
import { BubbleMenu } from "@tiptap/react/menus";
import { common, createLowlight } from "lowlight";
import { useEffect, useRef } from "react";
import { BubbleMenuToolbar } from "renderer/components/MarkdownRenderer/components/TipTapMarkdownRenderer/components/BubbleMenuToolbar";
import { env } from "renderer/env.renderer";
import { useInlineLinkActions } from "renderer/hooks/useV2UserPreferences";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { Markdown } from "tiptap-markdown";
import { CodeBlockView } from "./components/CodeBlockView";
import { EmojiSuggestion } from "./components/EmojiSuggestion";
import {
	FileMentionNode,
	type FileMentionSearchFn,
	FileMentionSuggestion,
} from "./components/FileMention";
import { SlashCommand } from "./components/SlashCommand";

const lowlight = createLowlight(common);

const LINEAR_IMAGE_HOST = "uploads.linear.app";

function isLinearImageUrl(src: string): boolean {
	try {
		const url = new URL(src);
		return url.host === LINEAR_IMAGE_HOST;
	} catch {
		return false;
	}
}

function getLinearProxyUrl(linearUrl: string): string {
	const proxyUrl = new URL(`${env.NEXT_PUBLIC_API_URL}/api/proxy/linear-image`);
	proxyUrl.searchParams.set("url", linearUrl);
	return proxyUrl.toString();
}

const LinearImage = Image.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			src: {
				default: null,
				parseHTML: (element) => element.getAttribute("src"),
				renderHTML: (attributes) => {
					const src = attributes.src;
					if (!src) return { src: null };
					const proxiedSrc = isLinearImageUrl(src)
						? getLinearProxyUrl(src)
						: src;
					return {
						src: proxiedSrc,
						crossorigin: isLinearImageUrl(src) ? "use-credentials" : undefined,
					};
				},
			},
		};
	},
});

const HEADING_CLASSES: Record<number, string> = {
	1: "text-3xl font-bold leading-tight mt-0 mb-3",
	2: "text-2xl font-semibold leading-snug mt-6 mb-2",
	3: "text-xl font-semibold leading-snug mt-5 mb-2",
	4: "text-base font-semibold leading-normal mt-4 mb-2",
	5: "text-base font-semibold leading-normal mt-4 mb-2",
	6: "text-base font-semibold leading-normal mt-4 mb-2",
};

const StyledHeading = Heading.extend({
	renderHTML({ node, HTMLAttributes }) {
		const level = node.attrs.level as number;
		const classes = HEADING_CLASSES[level] || HEADING_CLASSES[1];
		return [`h${level}`, { ...HTMLAttributes, class: classes }, 0];
	},
});

const KeyboardHandler = Extension.create({
	name: "keyboardHandler",
	addKeyboardShortcuts() {
		return {
			Tab: ({ editor }) => {
				if (editor.commands.sinkListItem("listItem")) return true;
				if (editor.commands.sinkListItem("taskItem")) return true;
				// Not in a list - consume event to prevent browser focus navigation
				return true;
			},
			"Shift-Tab": ({ editor }) => {
				if (editor.commands.liftListItem("listItem")) return true;
				if (editor.commands.liftListItem("taskItem")) return true;
				return true;
			},
			Escape: ({ editor }) => {
				editor.commands.blur();
				return true;
			},
		};
	},
});

interface MarkdownEditorProps {
	content: string;
	onSave?: (markdown: string) => void;
	onChange?: (markdown: string) => void;
	placeholder?: string;
	autoFocus?: boolean;
	className?: string;
	editorClassName?: string;
	onModEnter?: () => void;
	/** If provided, enables @-mention file search for the editor. */
	searchFiles?: FileMentionSearchFn;
}

function getMarkdown(editor: Editor | null): string {
	const storage = editor?.storage as
		| Record<string, { getMarkdown?: () => string }>
		| undefined;
	return storage?.markdown?.getMarkdown?.() ?? "";
}

function isMarkdownTable(text: string): boolean {
	const lines = text
		.trim()
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

	if (lines.length < 2 || !lines[0]?.includes("|")) {
		return false;
	}

	return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(lines[1]);
}

export function MarkdownEditor({
	content,
	onSave,
	onChange,
	placeholder = "Add description...",
	autoFocus = false,
	className,
	editorClassName,
	onModEnter,
	searchFiles,
}: MarkdownEditorProps) {
	// useEditor captures extensions on first render, so searchFiles gets frozen
	// at its initial (likely stale, since projectId resolves in an effect) value.
	// Thread through a ref so the extension reads the live callback each fire.
	const searchFilesRef = useRef(searchFiles);
	searchFilesRef.current = searchFiles;
	const editorRef = useRef<Editor | null>(null);

	const { getUrlAction } = useInlineLinkActions();

	const editor = useEditor({
		autofocus: autoFocus ? "end" : false,
		extensions: [
			Document,
			Text,
			Paragraph.configure({
				HTMLAttributes: { class: "mt-0 mb-3 leading-relaxed" },
			}),
			StyledHeading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
			Bold.configure({
				HTMLAttributes: { class: "font-semibold" },
			}),
			Italic.configure({
				HTMLAttributes: { class: "italic" },
			}),
			Strike.configure({
				HTMLAttributes: { class: "line-through" },
			}),
			Underline.configure({
				HTMLAttributes: { class: "underline" },
			}),
			Code.configure({
				HTMLAttributes: {
					class: "font-mono text-sm px-1 py-0.5 rounded bg-muted",
				},
			}),
			CodeBlockLowlight.extend({
				addNodeView() {
					return ReactNodeViewRenderer(CodeBlockView);
				},
			}).configure({
				lowlight,
				HTMLAttributes: {
					class:
						"my-3 p-3 rounded-md bg-muted overflow-x-auto font-mono text-sm",
				},
			}),
			BulletList.configure({
				HTMLAttributes: {
					class: "task-markdown-list mt-0 pl-6",
				},
			}),
			OrderedList.configure({
				HTMLAttributes: { class: "mt-0 mb-3 pl-6 list-decimal" },
			}),
			ListItem.configure({
				HTMLAttributes: {},
			}),
			TaskList.configure({
				HTMLAttributes: { class: "mt-0 mb-3 pl-0 list-none" },
			}),
			TaskItem.configure({
				HTMLAttributes: { class: "flex items-start gap-2 mb-1" },
				nested: true,
			}),
			Blockquote.configure({
				HTMLAttributes: {
					class: "my-3 pl-4 border-l-2 border-border text-muted-foreground",
				},
			}),
			HorizontalRule.configure({
				HTMLAttributes: { class: "my-6 border-none border-t border-border" },
			}),
			HardBreak,
			History,
			Link.configure({
				openOnClick: false,
				HTMLAttributes: { class: "text-primary underline" },
			}),
			LinearImage.configure({
				HTMLAttributes: { class: "max-w-full h-auto rounded-md my-3" },
			}),
			TableKit.configure({
				table: {
					resizable: false,
					cellMinWidth: 192,
					HTMLAttributes: {
						class: "markdown-table my-4 min-w-full border-collapse",
					},
				},
				tableHeader: {
					HTMLAttributes: {
						class:
							"bg-muted px-4 py-2 text-left text-sm font-semibold align-top",
					},
				},
				tableCell: {
					HTMLAttributes: {
						class: "border-t border-border px-4 py-2 text-sm align-top",
					},
				},
			}),
			Placeholder.configure({
				placeholder: ({ node }) => {
					if (node.type.name === "paragraph") {
						return placeholder;
					}
					return "";
				},
				showOnlyCurrent: false,
				emptyNodeClass:
					"first:before:text-muted-foreground first:before:float-left first:before:h-0 first:before:pointer-events-none first:before:content-[attr(data-placeholder)]",
			}),
			Markdown.configure({
				html: true,
				transformPastedText: true,
				transformCopiedText: true,
			}),
			SlashCommand,
			EmojiSuggestion,
			FileMentionNode,
			FileMentionSuggestion.configure({
				searchFiles: (query) =>
					searchFilesRef.current?.(query) ?? Promise.resolve([]),
			}),
			KeyboardHandler,
		],
		content,
		editorProps: {
			attributes: {
				class: cn("focus:outline-none min-h-[100px]", editorClassName),
			},
			handleKeyDown: (_, event) => {
				if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
					onModEnter?.();
					return true;
				}
				return false;
			},
			handlePaste: (_, event) => {
				const text = event.clipboardData?.getData("text/plain") ?? "";
				const currentEditor = editorRef.current;
				if (!currentEditor || !isMarkdownTable(text)) {
					return false;
				}

				event.preventDefault();
				return currentEditor.commands.insertContentAt(
					{
						from: currentEditor.state.selection.from,
						to: currentEditor.state.selection.to,
					},
					text,
				);
			},
			handleClickOn: (_view, _pos, _node, _nodePos, event) => {
				const target = event.target as HTMLElement | null;
				const anchor = target?.closest?.("a") as HTMLAnchorElement | null;
				if (!anchor) return false;
				const href = anchor.getAttribute("href");
				if (!href) return false;
				// No pane context here, so "pane" and "external" both route to the
				// system browser. Null means do nothing — fall through to ProseMirror
				// so the user can still click into the link to place a cursor.
				if (getUrlAction(event) === null) return false;
				event.preventDefault();
				electronTrpcClient.external.openUrl.mutate(href).catch((error) => {
					console.error("[MarkdownEditor] Failed to open URL:", href, error);
				});
				return true;
			},
		},
		onUpdate: ({ editor }) => {
			onChange?.(getMarkdown(editor));
		},
		onBlur: ({ editor }) => {
			onSave?.(getMarkdown(editor));
		},
	});
	editorRef.current = editor;

	useEffect(() => {
		if (!editor || editor.isFocused) return;

		const currentMarkdown = getMarkdown(editor);
		if (currentMarkdown === content) return;

		editor.commands.setContent(content, { emitUpdate: false });
	}, [content, editor]);

	return (
		<div className={cn("w-full", className)}>
			{editor && (
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
			<EditorContent
				editor={editor}
				className="w-full flex-1 min-h-0 flex flex-col [&>.ProseMirror]:flex-1 [&>.ProseMirror]:min-h-0"
			/>
		</div>
	);
}
