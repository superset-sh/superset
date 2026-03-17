import { type MutableRefObject, type ReactNode, useCallback } from "react";
import type { Tab } from "renderer/stores/tabs/types";
import {
	type CodeEditorAdapter,
	EditorContextMenu,
	useEditorActions,
} from "../../../../../components";

interface FileEditorContextMenuProps {
	children: ReactNode;
	editorRef: MutableRefObject<CodeEditorAdapter | null>;
	filePath: string;
	onSplitHorizontal: () => void;
	onSplitVertical: () => void;
	onSplitWithNewChat?: () => void;
	onSplitWithNewBrowser?: () => void;
	onEqualizePaneSplits?: () => void;
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
	onSplitWithNewChat,
	onSplitWithNewBrowser,
	onEqualizePaneSplits,
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
				onSplitWithNewChat,
				onSplitWithNewBrowser,
				onEqualizePaneSplits,
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
