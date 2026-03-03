import "highlight.js/styles/github-dark.css";
import "./task-markdown.css";

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
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Text } from "@tiptap/extension-text";
import { Underline } from "@tiptap/extension-underline";
import { EditorContent, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import { common, createLowlight } from "lowlight";
import { Markdown } from "tiptap-markdown";

import { CodeBlockView } from "./components/CodeBlockView";
import { SlashCommand } from "./components/SlashCommand";

const lowlight = createLowlight(common);

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

interface TaskMarkdownRendererProps {
	content: string;
	onSave: (markdown: string) => void;
}

export function TaskMarkdownRenderer({
	content,
	onSave,
}: TaskMarkdownRendererProps) {
	const editor = useEditor({
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
			Image.configure({
				HTMLAttributes: { class: "max-w-full h-auto rounded-md my-3" },
			}),
			Placeholder.configure({
				placeholder: ({ node }) => {
					if (node.type.name === "paragraph") {
						return "Add description...";
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
			KeyboardHandler,
		],
		content,
		editorProps: {
			attributes: {
				class: "focus:outline-none min-h-[100px]",
			},
		},
		onBlur: ({ editor }) => {
			const storage = editor.storage as unknown as Record<
				string,
				{ getMarkdown?: () => string }
			>;
			const markdown = storage.markdown?.getMarkdown?.() ?? "";
			onSave(markdown);
		},
	});

	return (
		<div className="w-full">
			<EditorContent editor={editor} className="w-full" />
		</div>
	);
}
