import "../../styles/hljs-github.css";
import "./markdown-editor.css";

import { useLingui } from "@lingui/react/macro";
import { getClipboardFiles } from "@superset/ui/lib/clipboard-files";
import { cn } from "@superset/ui/utils";
import { Extension } from "@tiptap/core";
import { Blockquote } from "@tiptap/extension-blockquote";
import { Bold } from "@tiptap/extension-bold";
import { BulletList } from "@tiptap/extension-bullet-list";
import { Code } from "@tiptap/extension-code";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Document } from "@tiptap/extension-document";
import FileHandler from "@tiptap/extension-file-handler";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Heading } from "@tiptap/extension-heading";
import { History } from "@tiptap/extension-history";
import { HorizontalRule } from "@tiptap/extension-horizontal-rule";
import Image from "@tiptap/extension-image";
import { Italic } from "@tiptap/extension-italic";
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
import { Dropcursor, TrailingNode } from "@tiptap/extensions";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
	type Editor,
	EditorContent,
	ReactNodeViewRenderer,
	useEditor,
} from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { common, createLowlight } from "lowlight";
import { type MutableRefObject, useEffect, useRef } from "react";
import { BubbleMenuToolbar } from "renderer/components/MarkdownRenderer/components/TipTapMarkdownRenderer/components/BubbleMenuToolbar";
import {
	PluginMentionNode,
	type PluginMentionOption,
	restorePluginMentions,
} from "renderer/components/PluginMention";
import { useUrlLinkAction } from "renderer/lib/clickPolicy";
import {
	SafeLink,
	verbatimStringAttributes,
} from "renderer/lib/tiptap/markdown-attributes";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { Markdown } from "tiptap-markdown";
import { CodeBlockView } from "./components/CodeBlockView";
import { EmojiSuggestion } from "./components/EmojiSuggestion";
import {
	FileMentionNode,
	type FileMentionSearchFn,
	FileMentionSuggestion,
} from "./components/FileMention";
import { ImageView } from "./components/ImageView";
import {
	getLinearProxyUrl,
	isLinearImageUrl,
} from "./components/ImageView/utils/linearImage";
import {
	isPluginMentionMenuOpen,
	PluginMentionSuggestion,
} from "./components/PluginMentionSuggestion";
import {
	RecordMentionNode,
	type RecordMentionSearchFn,
	RecordMentionSuggestion,
} from "./components/RecordMention";
import { SlashCommand } from "./components/SlashCommand";

const lowlight = createLowlight(common);

const escapeAttribute = (value: string) =>
	value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

const LinearImage = Image.extend({
	addNodeView() {
		return ReactNodeViewRenderer(ImageView);
	},
	addStorage() {
		return {
			markdown: {
				serialize(
					state: {
						write: (text: string) => void;
						esc: (text: string) => string;
					},
					node: ProseMirrorNode,
				) {
					const { src, alt, title, width } = node.attrs;
					if (width) {
						state.write(
							`<img src="${escapeAttribute(src ?? "")}" alt="${escapeAttribute(alt ?? "")}" width="${Math.round(Number(width))}">`,
						);
						return;
					}
					state.write(
						`![${state.esc(alt ?? "")}](${String(src ?? "").replace(/[()]/g, "\\$&")}${title ? ` "${String(title).replace(/"/g, '\\"')}"` : ""})`,
					);
				},
			},
		};
	},
	addAttributes() {
		return {
			...this.parent?.(),
			...verbatimStringAttributes("alt", "title"),
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
				if (isPluginMentionMenuOpen(editor)) return false;
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
	/** true focuses at the end; "start"/"end" pick the caret position. */
	autoFocus?: boolean | "start" | "end";
	className?: string;
	editorClassName?: string;
	onModEnter?: () => void;
	/**
	 * If provided, plain Enter fires this instead of inserting a newline
	 * (Shift+Enter still breaks the line). Composer-style editors only.
	 */
	onEnterSubmit?: () => void;
	/** If provided, enables @-mention file search for the editor. */
	searchFiles?: FileMentionSearchFn;
	/** If provided (and searchFiles isn't), @ mentions people, tasks, and pull requests. */
	searchMentions?: RecordMentionSearchFn;
	/**
	 * If provided, @ mentions installed plugins; a mention reaches the agent as
	 * `@name`. Composer prompts only — leave searchFiles and searchMentions unset.
	 */
	pluginMentions?: readonly PluginMentionOption[];
	/** If provided, pasted file items (e.g. clipboard images) are forwarded here. */
	onPasteFiles?: (files: File[]) => void;
	/** If provided, files dropped on the editor are forwarded here with the drop position. */
	onDropFiles?: (files: File[], position: number) => void;
	/** Receives the editor so a caller can insert content at the cursor. */
	editorHandle?: MutableRefObject<Editor | null>;
	/** Toggle optional affordances. Each defaults to enabled. */
	features?: {
		slashCommand?: boolean;
		emoji?: boolean;
		fileMention?: boolean;
		bubbleMenu?: boolean;
	};
	/** false renders the content read-only. */
	editable?: boolean;
}

function getMarkdown(editor: Editor | null): string {
	const storage = editor?.storage as
		| Record<string, { getMarkdown?: () => string }>
		| undefined;
	return storage?.markdown?.getMarkdown?.() ?? "";
}

const SIGNED_URL_QUERY =
	/(https?:\/\/[^\s?#)"'<>]+)\?[^\s#)"'<>]*X-Amz-[^\s#)"'<>]*/g;

function withoutUrlSignatures(markdown: string): string {
	return markdown.replace(SIGNED_URL_QUERY, "$1");
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
	placeholder,
	autoFocus = false,
	className,
	editorClassName,
	onModEnter,
	onEnterSubmit,
	searchFiles,
	searchMentions,
	pluginMentions,
	onPasteFiles,
	onDropFiles,
	editorHandle,
	features,
	editable = true,
}: MarkdownEditorProps) {
	const { t } = useLingui();
	const resolvedPlaceholder =
		placeholder ??
		t({
			message: "Add description...",
		});
	const showSlashCommand = features?.slashCommand ?? true;
	const showEmoji = features?.emoji ?? true;
	const showFileMention = features?.fileMention ?? true;
	const showBubbleMenu = features?.bubbleMenu ?? true;
	// useEditor captures extensions on first render, so searchFiles gets frozen
	// at its initial (likely stale, since projectId resolves in an effect) value.
	// Thread through a ref so the extension reads the live callback each fire.
	const searchFilesRef = useRef(searchFiles);
	searchFilesRef.current = searchFiles;
	const searchMentionsRef = useRef(searchMentions);
	searchMentionsRef.current = searchMentions;
	const pluginMentionsRef = useRef(pluginMentions);
	pluginMentionsRef.current = pluginMentions;
	const onPasteFilesRef = useRef(onPasteFiles);
	onPasteFilesRef.current = onPasteFiles;
	const onDropFilesRef = useRef(onDropFiles);
	onDropFilesRef.current = onDropFiles;
	const onModEnterRef = useRef(onModEnter);
	onModEnterRef.current = onModEnter;
	const onEnterSubmitRef = useRef(onEnterSubmit);
	onEnterSubmitRef.current = onEnterSubmit;
	const editorRef = useRef<Editor | null>(null);

	const getUrlAction = useUrlLinkAction("2-tier");

	const editor = useEditor({
		editable,
		autofocus: autoFocus === true ? "end" : autoFocus || false,
		extensions: [
			Document,
			Text,
			Paragraph.configure({
				HTMLAttributes: { class: "my-0 leading-relaxed" },
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
			SafeLink.configure({
				openOnClick: false,
				HTMLAttributes: { class: "text-primary underline" },
			}),
			LinearImage.configure({
				HTMLAttributes: { class: "max-w-full h-auto rounded-md my-3" },
			}),
			Dropcursor.configure({ color: "var(--primary)", width: 2 }),
			TrailingNode,
			...(onDropFilesRef.current
				? [
						FileHandler.configure({
							onDrop: (_editor, files, position) =>
								onDropFilesRef.current?.(files, position),
						}),
					]
				: []),
			TableKit.configure({
				table: {
					resizable: false,
					renderWrapper: true,
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
						return resolvedPlaceholder;
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
			...(showSlashCommand ? [SlashCommand] : []),
			...(showEmoji ? [EmojiSuggestion] : []),
			RecordMentionNode,
			PluginMentionNode.configure({
				resolvePlugin: (name) =>
					pluginMentionsRef.current?.find((plugin) => plugin.name === name) ??
					null,
			}),
			...(pluginMentionsRef.current
				? [
						PluginMentionSuggestion.configure({
							getPlugins: () => pluginMentionsRef.current ?? [],
						}),
					]
				: []),
			...(!showFileMention && searchMentionsRef.current
				? [
						RecordMentionSuggestion.configure({
							searchMentions: (query) =>
								searchMentionsRef.current?.(query) ?? Promise.resolve([]),
						}),
					]
				: []),
			...(showFileMention
				? [
						FileMentionNode,
						FileMentionSuggestion.configure({
							searchFiles: (query) =>
								searchFilesRef.current?.(query) ?? Promise.resolve([]),
						}),
					]
				: []),
			KeyboardHandler,
		],
		content,
		editorProps: {
			attributes: {
				class: cn("focus:outline-none min-h-0", editorClassName),
			},
			handleKeyDown: (_, event) => {
				if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
					onModEnterRef.current?.();
					return true;
				}
				if (
					onEnterSubmitRef.current &&
					event.key === "Enter" &&
					!event.shiftKey &&
					!event.altKey &&
					!isPluginMentionMenuOpen(editorRef.current)
				) {
					onEnterSubmitRef.current();
					return true;
				}
				return false;
			},
			handlePaste: (_, event) => {
				const onPasteFiles = onPasteFilesRef.current;
				const text = event.clipboardData?.getData("text/plain") ?? "";
				if (onPasteFiles) {
					const files = getClipboardFiles(event.clipboardData);
					if (files.length > 0) {
						onPasteFiles(files);
						// Mixed payloads (image plus its alt text) keep both: fall
						// through so the text still lands in the editor.
						if (!text) {
							event.preventDefault();
							return true;
						}
					}
				}
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
				if (getUrlAction(event, href) === null) return false;
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
	if (editorHandle) editorHandle.current = editor;

	useEffect(() => {
		if (editor && editor.isEditable !== editable) editor.setEditable(editable);
	}, [editable, editor]);

	// Content read before the catalog answered kept `@name` as text; the first
	// catalog arrival turns those into chips. Later refreshes leave typing alone.
	const hadPluginMentions = useRef((pluginMentions?.length ?? 0) > 0);
	useEffect(() => {
		if (!editor || hadPluginMentions.current || !pluginMentions?.length) return;
		hadPluginMentions.current = true;
		restorePluginMentions(
			editor,
			(name) => pluginMentions.find((plugin) => plugin.name === name) ?? null,
		);
	}, [editor, pluginMentions]);

	useEffect(() => {
		if (!editor || editor.isFocused) return;

		const currentMarkdown = getMarkdown(editor);
		if (withoutUrlSignatures(currentMarkdown) === withoutUrlSignatures(content))
			return;

		editor.commands.setContent(content, { emitUpdate: false });
	}, [content, editor]);

	return (
		<div className={cn("w-full", className)}>
			{showBubbleMenu && editable && editor && (
				<BubbleMenu
					editor={editor}
					options={{
						placement: "top",
						offset: { mainAxis: 8 },
					}}
					shouldShow={({ editor: e, from, to }) => {
						if (from === to) return false;
						if (e.isActive("codeBlock") || e.isActive("image")) return false;
						return true;
					}}
				>
					<BubbleMenuToolbar editor={editor} />
				</BubbleMenu>
			)}
			<EditorContent
				editor={editor}
				className="w-full flex-1 min-h-0 flex flex-col [&>.ProseMirror]:flex-1"
			/>
		</div>
	);
}
