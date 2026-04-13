import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import {
	buildSupersetOpenLink,
	type SupersetLinkProject,
} from "renderer/lib/superset-open-links";
import type { CodeEditorAdapter } from "../CodeEditorAdapter";
import type { EditorActions } from "./EditorContextMenu";

interface UseEditorActionsProps {
	getEditor: () => CodeEditorAdapter | null | undefined;
	filePath: string;
	branch?: string | null;
	worktreePath?: string | null;
	supersetLinkProject?: SupersetLinkProject | null;
	/** If true, includes cut/paste actions (for editable editors) */
	editable?: boolean;
	onGoToDefinition?: () => void;
	/** Optional handler for "Show Reference Graph" context menu action */
	onShowReferenceGraph?: () => void;
}

/**
 * Hook that creates all editor action handlers for the context menu.
 * Shared by editor surfaces that operate through the adapter contract.
 */
export function useEditorActions({
	getEditor,
	filePath,
	branch,
	worktreePath,
	supersetLinkProject,
	editable = true,
	onGoToDefinition,
	onShowReferenceGraph,
}: UseEditorActionsProps): EditorActions {
	const { copyToClipboard } = useCopyToClipboard();

	const handleCut = useCallback(() => {
		const editor = getEditor();
		if (!editor) return;
		editor.cut();
	}, [getEditor]);

	const handleCopy = useCallback(() => {
		const editor = getEditor();
		if (!editor) return;
		editor.copy();
	}, [getEditor]);

	const handlePaste = useCallback(() => {
		const editor = getEditor();
		if (!editor) return;
		editor.paste();
	}, [getEditor]);

	const handleSelectAll = useCallback(() => {
		const editor = getEditor();
		if (!editor) return;
		editor.selectAll();
	}, [getEditor]);

	const handleCopyPath = useCallback(() => {
		copyToClipboard(filePath);
	}, [filePath, copyToClipboard]);

	const handleCopyPathWithLine = useCallback(() => {
		const editor = getEditor();
		if (!editor) {
			copyToClipboard(filePath);
			return;
		}

		const selection = editor.getSelectionLines();
		if (!selection) {
			copyToClipboard(filePath);
			return;
		}

		const { startLine, endLine } = selection;
		const pathWithLine =
			startLine === endLine
				? `${filePath}:${startLine}`
				: `${filePath}:${startLine}-${endLine}`;

		copyToClipboard(pathWithLine);
	}, [filePath, getEditor, copyToClipboard]);

	const handleCopySupersetLink = useCallback(() => {
		if (!supersetLinkProject) {
			toast.error("Superset link is unavailable", {
				description: "Project metadata is still loading.",
			});
			return;
		}

		const link = buildSupersetOpenLink({
			project: supersetLinkProject,
			branch,
			worktreePath,
			filePath,
		});

		if (!link) {
			toast.error("Failed to build Superset link", {
				description: "Repository metadata is incomplete.",
			});
			return;
		}

		void copyToClipboard(link).catch((error) => {
			console.error("[superset-link] Failed to copy link:", error);
			toast.error("Failed to copy Superset link", {
				description: error instanceof Error ? error.message : undefined,
			});
		});
	}, [branch, copyToClipboard, filePath, supersetLinkProject, worktreePath]);

	const handleCopySupersetLinkWithLine = useCallback(() => {
		if (!supersetLinkProject) {
			toast.error("Superset link is unavailable", {
				description: "Project metadata is still loading.",
			});
			return;
		}

		const selection = getEditor()?.getSelectionLines();
		const link = buildSupersetOpenLink({
			project: supersetLinkProject,
			branch,
			worktreePath,
			filePath,
			line: selection?.startLine,
		});

		if (!link) {
			toast.error("Failed to build Superset link", {
				description: "Repository metadata is incomplete.",
			});
			return;
		}

		void copyToClipboard(link).catch((error) => {
			console.error("[superset-link] Failed to copy link:", error);
			toast.error("Failed to copy Superset link", {
				description: error instanceof Error ? error.message : undefined,
			});
		});
	}, [
		branch,
		copyToClipboard,
		filePath,
		getEditor,
		supersetLinkProject,
		worktreePath,
	]);

	const handleFind = useCallback(() => {
		const editor = getEditor();
		if (!editor) return;
		editor.openFind();
	}, [getEditor]);

	return {
		onCut: editable ? handleCut : undefined,
		onCopy: handleCopy,
		onPaste: editable ? handlePaste : undefined,
		onSelectAll: handleSelectAll,
		onCopyPath: handleCopyPath,
		onCopyPathWithLine: handleCopyPathWithLine,
		onCopySupersetLink:
			supersetLinkProject &&
			buildSupersetOpenLink({
				project: supersetLinkProject,
				branch,
				worktreePath,
				filePath,
			})
				? handleCopySupersetLink
				: undefined,
		onCopySupersetLinkWithLine:
			supersetLinkProject &&
			buildSupersetOpenLink({
				project: supersetLinkProject,
				branch,
				worktreePath,
				filePath,
			})
				? handleCopySupersetLinkWithLine
				: undefined,
		onFind: handleFind,
		onGoToDefinition,
		onShowReferenceGraph,
	};
}
