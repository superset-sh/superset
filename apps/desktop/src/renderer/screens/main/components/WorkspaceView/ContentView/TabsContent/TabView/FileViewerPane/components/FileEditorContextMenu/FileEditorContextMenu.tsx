import { type MutableRefObject, type ReactNode, useCallback } from "react";
import type { SupersetLinkProject } from "renderer/lib/superset-open-links";
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
	branch?: string | null;
	worktreePath?: string | null;
	supersetLinkProject?: SupersetLinkProject | null;
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
	onGoToDefinition?: () => void;
	onShowReferenceGraph?: () => void;
}

export function FileEditorContextMenu({
	children,
	editorRef,
	filePath,
	branch,
	worktreePath,
	supersetLinkProject,
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
	onGoToDefinition,
	onShowReferenceGraph,
}: FileEditorContextMenuProps) {
	const getEditor = useCallback(() => editorRef.current, [editorRef]);

	const editorActions = useEditorActions({
		getEditor,
		filePath,
		branch,
		worktreePath,
		supersetLinkProject,
		editable: true,
		onGoToDefinition,
		onShowReferenceGraph,
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
