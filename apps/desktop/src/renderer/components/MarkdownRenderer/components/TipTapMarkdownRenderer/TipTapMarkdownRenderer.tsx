import { cn } from "@superset/ui/utils";
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
import { EditorContent, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import { common, createLowlight } from "lowlight";
import { useEffect, useRef } from "react";
import { useMarkdownStyle } from "renderer/stores";
import { Markdown } from "tiptap-markdown";
import { defaultConfig } from "../../styles/default/config";
import { tufteConfig } from "../../styles/tufte/config";
import { SelectionContextMenu } from "../SelectionContextMenu";
import { ReadOnlyCodeBlockView } from "./components/ReadOnlyCodeBlockView";
import { ReadOnlySafeImageView } from "./components/ReadOnlySafeImageView";

const lowlight = createLowlight(common);

const styleConfigs = {
	default: defaultConfig,
	tufte: tufteConfig,
} as const;

interface TipTapMarkdownRendererProps {
	content: string;
	style?: keyof typeof styleConfigs;
	className?: string;
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

export function TipTapMarkdownRenderer({
	content,
	style: styleProp,
	className,
}: TipTapMarkdownRendererProps) {
	const globalStyle = useMarkdownStyle();
	const style = styleProp ?? globalStyle;
	const config = styleConfigs[style];
	const articleRef = useRef<HTMLElement | null>(null);
	const editor = useEditor({
		immediatelyRender: false,
		editable: false,
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
					class: "px-1.5 py-0.5 rounded bg-muted font-mono text-sm",
				},
			}),
			ReadOnlyCodeBlock.configure({
				lowlight,
			}),
			BulletList,
			OrderedList,
			ListItem,
			TaskList.configure({
				HTMLAttributes: { class: "pl-0 list-none" },
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
				openOnClick: true,
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
		],
		content,
		editorProps: {
			attributes: {
				class: "focus:outline-none",
			},
		},
	});

	useEffect(() => {
		if (!editor) {
			return;
		}

		const storage = editor.storage as unknown as Record<
			string,
			{ getMarkdown?: () => string }
		>;
		const currentMarkdown = storage.markdown?.getMarkdown?.() ?? "";
		if (currentMarkdown === content) {
			return;
		}

		editor.commands.setContent(content);
	}, [content, editor]);

	return (
		<SelectionContextMenu selectAllContainerRef={articleRef}>
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
		</SelectionContextMenu>
	);
}
