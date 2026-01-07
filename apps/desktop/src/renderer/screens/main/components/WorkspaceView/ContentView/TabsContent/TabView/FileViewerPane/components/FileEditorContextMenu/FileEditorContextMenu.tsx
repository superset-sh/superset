import type * as Monaco from "monaco-editor";
import { type MutableRefObject, type ReactNode, useCallback } from "react";
import type { Tab } from "renderer/stores/tabs/types";
import { EditorContextMenu, useEditorActions } from "../../../../../components";

interface FileEditorContextMenuProps {
	children: ReactNode;
	editorRef: MutableRefObject<Monaco.editor.IStandaloneCodeEditor | null>;
	filePath: string;
	onSplitHorizontal: () => void;
	onSplitVertical: () => void;
	onClosePane: () => void;
	currentTabId: string;
	availableTabs: Tab[];
	onMoveToTab: (tabId: string) => void;
	onMoveToNewTab: () => void;
}

export function FileEditorContextMenu({
	children,
	editorRef,
	filePath,
	onSplitHorizontal,
	onSplitVertical,
	onClosePane,
	currentTabId,
	availableTabs,
	onMoveToTab,
	onMoveToNewTab,
}: FileEditorContextMenuProps) {
	const getEditor = useCallback(() => editorRef.current, [editorRef]);

	const editorActions = useEditorActions({
		getEditor,
		filePath,
		editable: true,
	});

	return (
		<EditorContextMenu
			editorActions={editorActions}
			paneActions={{
				onSplitHorizontal,
				onSplitVertical,
				onClosePane,
				currentTabId,
				availableTabs,
				onMoveToTab,
				onMoveToNewTab,
			}}
		>
			{children}
		</EditorContextMenu>
	);
}
