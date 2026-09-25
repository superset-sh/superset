import "../../../../styles/hljs-github.css";

import { cn } from "@superset/ui/utils";
import type { Fragment } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { type MutableRefObject, useEffect, useRef } from "react";
import {
	type LinkAction,
	useInlineUrlPolicy,
	useTerminalUrlPolicy,
} from "renderer/lib/clickPolicy";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useMarkdownStyle } from "renderer/stores";
import { defaultConfig } from "../../styles/default/config";
import { tufteConfig } from "../../styles/tufte/config";
import { SelectionContextMenu } from "../SelectionContextMenu";
import { BubbleMenuToolbar } from "./components/BubbleMenuToolbar";
import { createMarkdownExtensions } from "./createMarkdownExtensions";
import { createMarkdownMerger } from "./mergeMarkdownEdits";
import { resolveLinkClick } from "./resolveLinkClick";

const styleConfigs = {
	default: defaultConfig,
	tufte: tufteConfig,
} as const;

interface MarkdownEditorAdapter {
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
	/**
	 * Emit `onChange` values as the original source patched with the user's
	 * edits (via mergeMarkdownEdits) instead of the serializer's full-document
	 * rewrite. `value` must then always be fed back from those emissions —
	 * a `value` that differs from the last emission is treated as an external
	 * change and resets the editor content and merge baseline.
	 */
	preserveSourceFormatting?: boolean;
	/**
	 * Routes a link click to the host's panes. With it, links follow the 4-tier
	 * URL click policy; without it there is no pane to open into, so any bound
	 * tier opens the system browser, as in MarkdownEditor.
	 */
	onOpenUrl?: (url: string, action: LinkAction) => void;
	onUnboundLinkClick?: (clientX: number, clientY: number) => void;
}

interface SourceTracking {
	/** Serializer output for the loaded source, the merge ancestor. */
	baseline: string;
	/** Last value emitted through onChange, used to detect external changes. */
	lastEmitted: string;
	/** Cached merger over the loaded source (see createMarkdownMerger). */
	merge: (edited: string) => string;
}

function createSourceTracking(editor: Editor, value: string): SourceTracking {
	const baseline = getEditorMarkdown(editor);
	return {
		baseline,
		lastEmitted: value,
		merge: createMarkdownMerger(value, baseline),
	};
}

function getSelectedEditorMarkdown(editor: Editor): string {
	const storage = editor.storage as unknown as Record<
		string,
		{ serializer?: { serialize: (content: Fragment) => string } }
	>;
	const serializer = storage.markdown?.serializer;
	return serializer?.serialize(editor.state.selection.content().content) ?? "";
}

function getEditorMarkdown(editor: Editor): string {
	const storage = editor.storage as unknown as Record<
		string,
		{ getMarkdown?: () => string }
	>;

	return storage.markdown?.getMarkdown?.() ?? "";
}

/**
 * Replaces the editor content with externally-loaded markdown and resets the
 * undo history. Without the reset, undo can cross the reload boundary and
 * resurrect a stale document — which a format-preserving merge would read as
 * the user deleting the externally-added content.
 */
export function applyExternalMarkdown(editor: Editor, value: string): void {
	editor.commands.setContent(value, { emitUpdate: false });
	editor.view.updateState(
		EditorState.create({
			doc: editor.state.doc,
			plugins: editor.state.plugins,
		}),
	);
}

function createMarkdownEditorAdapter(
	editor: Editor,
	onExternalSet?: (value: string) => void,
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
			applyExternalMarkdown(editor, value);
			onExternalSet?.(value);
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
	onSave,
	preserveSourceFormatting = false,
	onOpenUrl,
	onUnboundLinkClick,
}: TipTapMarkdownRendererProps) {
	const globalStyle = useMarkdownStyle();
	const style = styleProp ?? globalStyle;
	const config = styleConfigs[style];
	const articleRef = useRef<HTMLElement | null>(null);
	const onChangeRef = useRef(onChange);
	const onSaveRef = useRef(onSave);
	const sourceTrackingRef = useRef<SourceTracking | null>(null);

	const paneUrlPolicy = useTerminalUrlPolicy();
	const inlineUrlPolicy = useInlineUrlPolicy();
	const linkClickRef = useRef({
		getAction: inlineUrlPolicy.getAction,
		onOpenUrl,
		onUnboundLinkClick,
	});

	onChangeRef.current = onChange;
	onSaveRef.current = onSave;
	linkClickRef.current = {
		getAction: (onOpenUrl ? paneUrlPolicy : inlineUrlPolicy).getAction,
		onOpenUrl,
		onUnboundLinkClick,
	};

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
			handleDOMEvents: {
				// ProseMirror never calls handleClick for a shift-click (it lets the
				// browser extend the selection), so the shift tiers are only
				// reachable from the DOM click.
				click: (_view, event) => {
					const target = event.target as HTMLElement | null;
					if (!target?.closest?.("a")) return false;
					event.preventDefault();
					const link = linkClickRef.current;
					const click = resolveLinkClick(event, link.getAction);
					if (click.kind === "none") return false;
					if (click.kind === "unbound") {
						link.onUnboundLinkClick?.(event.clientX, event.clientY);
						return false;
					}
					if (link.onOpenUrl) {
						link.onOpenUrl(click.url, click.action);
						return true;
					}
					electronTrpcClient.external.openUrl
						.mutate(click.url)
						.catch((error) => {
							console.error(
								"[TipTapMarkdownRenderer] Failed to open URL:",
								click.url,
								error,
							);
						});
					return true;
				},
			},
		},
		onCreate: ({ editor: createdEditor }) => {
			sourceTrackingRef.current = createSourceTracking(createdEditor, value);
		},
		onUpdate: ({ editor: currentEditor }) => {
			const serialized = getEditorMarkdown(currentEditor);
			const tracking = preserveSourceFormatting
				? sourceTrackingRef.current
				: null;
			const emitted = tracking ? tracking.merge(serialized) : serialized;
			if (tracking) {
				tracking.lastEmitted = emitted;
			}
			onChangeRef.current?.(emitted);
		},
	});

	useEffect(() => {
		if (!editor) {
			return;
		}

		const tracking = preserveSourceFormatting
			? sourceTrackingRef.current
			: null;
		const isCurrent = tracking
			? tracking.lastEmitted === value
			: getEditorMarkdown(editor) === value;
		if (isCurrent) {
			return;
		}

		applyExternalMarkdown(editor, value);
		sourceTrackingRef.current = createSourceTracking(editor, value);
	}, [editor, value, preserveSourceFormatting]);

	useEffect(() => {
		if (!editor) {
			return;
		}

		editor.setEditable(editable, false);
	}, [editable, editor]);

	useEffect(() => {
		if (!editorRef || !editor) {
			return;
		}

		const adapter = createMarkdownEditorAdapter(editor, (nextValue) => {
			sourceTrackingRef.current = createSourceTracking(editor, nextValue);
		});
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

	// Radix's trigger calls preventDefault on the contextmenu event, which stops
	// Chromium emitting the webContents event that attachEditContextMenu uses to
	// build the native edit menu. Wrapping an editable view would trade its
	// Paste/Cut/Undo and spellcheck for this menu's copy actions.
	if (editable) {
		return content;
	}

	return (
		<SelectionContextMenu
			getMarkdownSelection={() =>
				editor ? getSelectedEditorMarkdown(editor) : ""
			}
			selectAllContainerRef={articleRef}
		>
			{content}
		</SelectionContextMenu>
	);
}
