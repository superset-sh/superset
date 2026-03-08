import { ContextMenuItem } from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import { type MutableRefObject, type ReactNode, useCallback } from "react";
import { LuSquarePen } from "react-icons/lu";
import type { Tab } from "renderer/stores/tabs/types";
import {
	type CodeEditorAdapter,
	EditorContextMenu,
	type EditorSelectionLines,
	useEditorActions,
} from "../../../../../components";

interface DiffViewerContextMenuProps {
	children: ReactNode;
	containerRef: MutableRefObject<HTMLDivElement | null>;
	filePath: string;
	getSelectionLines: () => EditorSelectionLines | null;
	onSplitHorizontal: () => void;
	onSplitVertical: () => void;
	onSplitWithNewChat?: () => void;
	onSplitWithNewBrowser?: () => void;
	onClosePane: () => void;
	currentTabId: string;
	availableTabs: Tab[];
	onMoveToTab: (tabId: string) => void;
	onMoveToNewTab: () => void;
	onEditAtLocation: () => void;
}

function isSelectionInsideContainer(
	container: HTMLDivElement,
	selection: Selection,
): boolean {
	if (selection.rangeCount === 0) {
		return false;
	}

	for (let index = 0; index < selection.rangeCount; index += 1) {
		const range = selection.getRangeAt(index);
		if (!container.contains(range.commonAncestorContainer)) {
			return false;
		}
	}

	return true;
}

export function DiffViewerContextMenu({
	children,
	containerRef,
	filePath,
	getSelectionLines,
	onSplitHorizontal,
	onSplitVertical,
	onSplitWithNewChat,
	onSplitWithNewBrowser,
	onClosePane,
	currentTabId,
	availableTabs,
	onMoveToTab,
	onMoveToNewTab,
	onEditAtLocation,
}: DiffViewerContextMenuProps) {
	const getEditor = useCallback((): CodeEditorAdapter | null => {
		const container = containerRef.current;
		if (!container) {
			return null;
		}

		return {
			focus() {
				container.focus();
			},
			getValue() {
				return container.innerText;
			},
			setValue(_value: string) {},
			revealPosition(_line: number, _column?: number) {},
			getSelectionLines,
			selectAll() {
				const selection = window.getSelection();
				if (!selection) return;
				const range = document.createRange();
				range.selectNodeContents(container);
				selection.removeAllRanges();
				selection.addRange(range);
			},
			cut() {},
			copy() {
				const selection = window.getSelection();
				if (!selection || !isSelectionInsideContainer(container, selection)) {
					return;
				}

				const selectedText = selection.toString();
				if (!selectedText) {
					return;
				}

				void navigator.clipboard.writeText(selectedText).catch((error) => {
					console.error(
						"[DiffViewerContextMenu] Failed to copy selection:",
						error,
					);
					toast.error("Failed to copy selection", {
						description: String(error),
					});
				});
			},
			paste() {},
			openFind() {},
			dispose() {},
		};
	}, [containerRef, getSelectionLines]);

	const editorActions = useEditorActions({
		getEditor,
		filePath,
		editable: false,
	});

	return (
		<EditorContextMenu
			editorActions={{
				...editorActions,
				onFind: undefined,
			}}
			leadingItems={
				<ContextMenuItem onSelect={onEditAtLocation}>
					<LuSquarePen className="size-4" />
					Edit Here
				</ContextMenuItem>
			}
			paneActions={{
				onSplitHorizontal,
				onSplitVertical,
				onSplitWithNewChat,
				onSplitWithNewBrowser,
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
