import "./notes-editor.css";

import { Extension, type Editor as TiptapEditor } from "@tiptap/core";
import { Blockquote } from "@tiptap/extension-blockquote";
import { Bold } from "@tiptap/extension-bold";
import { BulletList } from "@tiptap/extension-bullet-list";
import { Code } from "@tiptap/extension-code";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Document } from "@tiptap/extension-document";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Heading } from "@tiptap/extension-heading";
import { History } from "@tiptap/extension-history";
import { Italic } from "@tiptap/extension-italic";
import { ListItem } from "@tiptap/extension-list-item";
import { OrderedList } from "@tiptap/extension-ordered-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import Placeholder from "@tiptap/extension-placeholder";
import { Strike } from "@tiptap/extension-strike";
import { Text } from "@tiptap/extension-text";
import { EditorContent, useEditor } from "@tiptap/react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { common, createLowlight } from "lowlight";
import { useCallback, useEffect, useRef } from "react";
import {
	LuBold,
	LuCode,
	LuHeading1,
	LuHeading2,
	LuHeading3,
	LuItalic,
	LuList,
	LuListOrdered,
	LuQuote,
	LuStrikethrough,
} from "react-icons/lu";
import type { MosaicBranch } from "react-mosaic-component";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { Markdown } from "tiptap-markdown";
import { BasePaneWindow, PaneToolbarActions } from "../components";

const lowlight = createLowlight(common);

const SAVE_DEBOUNCE_MS = 500;

function getMarkdown(editor: TiptapEditor): string {
	const storage = editor.storage as unknown as Record<
		string,
		{ getMarkdown?: () => string }
	>;
	return storage.markdown?.getMarkdown?.() ?? "";
}

const KeyboardHandler = Extension.create({
	name: "notesKeyboardHandler",
	addKeyboardShortcuts() {
		return {
			Tab: ({ editor }) => {
				if (editor.commands.sinkListItem("listItem")) return true;
				return true;
			},
			"Shift-Tab": ({ editor }) => {
				if (editor.commands.liftListItem("listItem")) return true;
				return true;
			},
		};
	},
});

const toolbarBtnClass =
	"rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground data-[active=true]:text-foreground";

function NotesToolbar({ editor }: { editor: TiptapEditor | null }) {
	if (!editor) return null;

	const toggle = (fn: () => boolean) => (e: React.MouseEvent) => {
		e.preventDefault();
		fn();
	};

	return (
		<div className="flex items-center gap-0.5">
			{/* Aa — text format dropdown */}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button type="button" className={toolbarBtnClass}>
						<span className="text-xs font-semibold leading-none">Aa</span>
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="min-w-36">
					<DropdownMenuItem
						onSelect={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
					>
						<LuHeading1 className="mr-2 size-4" /> Heading 1
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
					>
						<LuHeading2 className="mr-2 size-4" /> Heading 2
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
					>
						<LuHeading3 className="mr-2 size-4" /> Heading 3
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => editor.chain().focus().toggleBold().run()}
					>
						<LuBold className="mr-2 size-4" /> Bold
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => editor.chain().focus().toggleItalic().run()}
					>
						<LuItalic className="mr-2 size-4" /> Italic
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => editor.chain().focus().toggleStrike().run()}
					>
						<LuStrikethrough className="mr-2 size-4" /> Strikethrough
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => editor.chain().focus().toggleCode().run()}
					>
						<LuCode className="mr-2 size-4" /> Inline Code
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => editor.chain().focus().toggleBlockquote().run()}
					>
						<LuQuote className="mr-2 size-4" /> Blockquote
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			{/* Bullet list toggle */}
			<button
				type="button"
				className={toolbarBtnClass}
				data-active={editor.isActive("bulletList")}
				onClick={toggle(() => editor.chain().focus().toggleBulletList().run())}
			>
				<LuList className="size-3.5" />
			</button>

			{/* Ordered list toggle */}
			<button
				type="button"
				className={toolbarBtnClass}
				data-active={editor.isActive("orderedList")}
				onClick={toggle(() => editor.chain().focus().toggleOrderedList().run())}
			>
				<LuListOrdered className="size-3.5" />
			</button>
		</div>
	);
}

interface NotesPaneProps {
	paneId: string;
	path: MosaicBranch[];
	tabId: string;
	worktreePath: string;
	splitPaneAuto: (
		tabId: string,
		sourcePaneId: string,
		dimensions: { width: number; height: number },
		path?: MosaicBranch[],
	) => void;
	removePane: (paneId: string) => void;
	setFocusedPane: (tabId: string, paneId: string) => void;
}

export function NotesPane({
	paneId,
	path,
	tabId,
	worktreePath,
	splitPaneAuto,
	removePane,
	setFocusedPane,
}: NotesPaneProps) {
	const filePath = useTabsStore((s) => s.panes[paneId]?.notes?.filePath) ?? "";
	const writeMutation = electronTrpc.notes.write.useMutation();
	const { data: fileContent, isLoading } = electronTrpc.notes.read.useQuery(
		{ worktreePath, fileName: filePath },
		{ enabled: !!worktreePath && !!filePath },
	);

	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isHydratingRef = useRef(false);
	const hydratedFileRef = useRef<string | null>(null);
	const pendingSaveRef = useRef(false);
	const pendingTargetRef = useRef<{
		worktreePath: string;
		filePath: string;
	} | null>(null);

	const saveToFile = useCallback(
		(target: { worktreePath: string; filePath: string; content: string }) => {
			if (!target.worktreePath || !target.filePath) return;
			writeMutation.mutate({
				worktreePath: target.worktreePath,
				fileName: target.filePath,
				content: target.content,
			});
		},
		[writeMutation],
	);

	const flushPendingSave = useCallback(
		(editorToFlush: TiptapEditor | null) => {
			if (!editorToFlush || !pendingSaveRef.current) return;

			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
				debounceRef.current = null;
			}

			const target = pendingTargetRef.current;
			if (!target) return;

			saveToFile({
				...target,
				content: getMarkdown(editorToFlush),
			});

			pendingSaveRef.current = false;
			pendingTargetRef.current = null;
		},
		[saveToFile],
	);

	const editor = useEditor({
		extensions: [
			Document,
			Text,
			Paragraph.configure({
				HTMLAttributes: { class: "mt-0 mb-2 leading-relaxed" },
			}),
			Heading.configure({ levels: [1, 2, 3, 4, 5, 6] }),
			Bold,
			Italic,
			Strike,
			Code.configure({
				HTMLAttributes: {
					class: "font-mono text-sm px-1 py-0.5 rounded bg-muted",
				},
			}),
			CodeBlockLowlight.configure({
				lowlight,
				HTMLAttributes: {
					class:
						"my-3 p-3 rounded-md bg-muted overflow-x-auto font-mono text-sm",
				},
			}),
			BulletList.configure({
				HTMLAttributes: { class: "notes-list mt-0 pl-6" },
			}),
			OrderedList.configure({
				HTMLAttributes: { class: "mt-0 mb-2 pl-6 list-decimal" },
			}),
			ListItem,
			Blockquote.configure({
				HTMLAttributes: {
					class: "my-3 pl-4 border-l-2 border-border text-muted-foreground",
				},
			}),
			HardBreak,
			History,
			Placeholder.configure({
				placeholder: "Write your notes here...",
				emptyNodeClass:
					"first:before:text-muted-foreground first:before:float-left first:before:h-0 first:before:pointer-events-none first:before:content-[attr(data-placeholder)]",
			}),
			Markdown.configure({
				html: false,
				transformPastedText: true,
				transformCopiedText: true,
			}),
			KeyboardHandler,
		],
		content: "",
		editorProps: {
			attributes: {
				class: "focus:outline-none min-h-full",
			},
		},
		onUpdate: ({ editor }) => {
			if (isHydratingRef.current || !worktreePath || !filePath) return;

			const target = { worktreePath, filePath };
			pendingTargetRef.current = target;
			pendingSaveRef.current = true;

			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}

			debounceRef.current = setTimeout(() => {
				saveToFile({
					...target,
					content: getMarkdown(editor),
				});
				pendingSaveRef.current = false;
				pendingTargetRef.current = null;
				debounceRef.current = null;
			}, SAVE_DEBOUNCE_MS);
		},
	});

	useEffect(() => {
		if (!editor || isLoading || !filePath) return;
		if (hydratedFileRef.current === filePath) return;

		flushPendingSave(editor);

		isHydratingRef.current = true;
		editor.commands.setContent(fileContent ?? "", { emitUpdate: false });
		hydratedFileRef.current = filePath;
		queueMicrotask(() => {
			isHydratingRef.current = false;
		});
	}, [editor, fileContent, filePath, flushPendingSave, isLoading]);

	useEffect(() => {
		return () => {
			flushPendingSave(editor);
		};
	}, [editor, flushPendingSave]);

	return (
		<BasePaneWindow
			paneId={paneId}
			path={path}
			tabId={tabId}
			splitPaneAuto={splitPaneAuto}
			removePane={removePane}
			setFocusedPane={setFocusedPane}
			renderToolbar={(handlers) => (
				<div className="flex h-full w-full items-center justify-between">
					<div className="flex h-full items-center gap-2 px-2">
						<span className="text-xs text-muted-foreground">Notes</span>
						<NotesToolbar editor={editor} />
					</div>
					<PaneToolbarActions
						splitOrientation={handlers.splitOrientation}
						onSplitPane={handlers.onSplitPane}
						onClosePane={handlers.onClosePane}
						closeHotkeyId="CLOSE_TERMINAL"
					/>
				</div>
			)}
		>
			<div className="notes-editor h-full w-full overflow-y-auto p-3 text-sm">
				<EditorContent editor={editor} className="h-full" />
			</div>
		</BasePaneWindow>
	);
}
