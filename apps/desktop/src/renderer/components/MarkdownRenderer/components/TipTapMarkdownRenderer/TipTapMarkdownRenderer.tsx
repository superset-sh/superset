import "../../../../styles/hljs-github.css";

import { cn } from "@superset/ui/utils";
import { EditorState } from "@tiptap/pm/state";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { type MutableRefObject, useEffect, useRef } from "react";
import { useMarkdownStyle } from "renderer/stores";
import { defaultConfig } from "../../styles/default/config";
import { tufteConfig } from "../../styles/tufte/config";
import { SelectionContextMenu } from "../SelectionContextMenu";
import { BubbleMenuToolbar } from "./components/BubbleMenuToolbar";
import { createMarkdownExtensions } from "./createMarkdownExtensions";
import { createMarkdownMerger } from "./mergeMarkdownEdits";

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
	/**
	 * Emit `onChange` values as the original source patched with the user's
	 * edits (via mergeMarkdownEdits) instead of the serializer's full-document
	 * rewrite. `value` must then always be fed back from those emissions —
	 * a `value` that differs from the last emission is treated as an external
	 * change and resets the editor content and merge baseline.
	 */
	preserveSourceFormatting?: boolean;
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
}: TipTapMarkdownRendererProps) {
	const globalStyle = useMarkdownStyle();
	const style = styleProp ?? globalStyle;
	const config = styleConfigs[style];
	const articleRef = useRef<HTMLElement | null>(null);
	const onChangeRef = useRef(onChange);
	const onSaveRef = useRef(onSave);
	const sourceTrackingRef = useRef<SourceTracking | null>(null);

	onChangeRef.current = onChange;
	onSaveRef.current = onSave;

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

	if (editable) {
		return content;
	}

	return (
		<SelectionContextMenu selectAllContainerRef={articleRef}>
			{content}
		</SelectionContextMenu>
	);
}
