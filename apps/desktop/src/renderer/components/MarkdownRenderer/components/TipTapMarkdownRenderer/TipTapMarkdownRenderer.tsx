import "highlight.js/styles/github-dark.css";

import { cn } from "@superset/ui/utils";
import { type Editor, EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { type MutableRefObject, useEffect, useRef } from "react";
import { useInlineLinkActions } from "renderer/hooks/useV2UserPreferences";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useMarkdownStyle } from "renderer/stores";
import { defaultConfig } from "../../styles/default/config";
import { tufteConfig } from "../../styles/tufte/config";
import { SelectionContextMenu } from "../SelectionContextMenu";
import { BubbleMenuToolbar } from "./components/BubbleMenuToolbar";
import { createMarkdownExtensions } from "./createMarkdownExtensions";
import { resolveClickedExternalHref } from "./utils/resolveClickedExternalHref";

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
	const { getUrlAction } = useInlineLinkActions();
	const getUrlActionRef = useRef(getUrlAction);

	onChangeRef.current = onChange;
	onSaveRef.current = onSave;
	getUrlActionRef.current = getUrlAction;

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
			handleClick: (_view, _pos, event) => {
				const href = resolveClickedExternalHref(event.target);
				if (!href) return false;
				// Defer to user preference: plain click tier is null by default, so
				// a normal click falls through to ProseMirror (cursor placement).
				// Cmd/Ctrl+click opens the URL in the system browser (#3644).
				if (getUrlActionRef.current(event) === null) return false;
				event.preventDefault();
				electronTrpcClient.external.openUrl.mutate(href).catch((error) => {
					console.error(
						"[TipTapMarkdownRenderer] Failed to open URL:",
						href,
						error,
					);
				});
				return true;
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

		editor.setEditable(editable, false);
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
