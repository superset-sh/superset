import type * as Monaco from "monaco-editor";
import { type MutableRefObject, useCallback, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { ChangeCategory } from "shared/changes-types";

interface UseFileSaveParams {
	worktreePath: string;
	filePath: string;
	paneId: string;
	diffCategory?: ChangeCategory;
	editorRef: MutableRefObject<Monaco.editor.IStandaloneCodeEditor | null>;
	originalContentRef: MutableRefObject<string>;
	originalDiffContentRef: MutableRefObject<string>;
	draftContentRef: MutableRefObject<string | null>;
	setIsDirty: (dirty: boolean) => void;
	/** Nested repo path for multi-repo support (if different from worktreePath) */
	repoPath?: string;
}

export function useFileSave({
	worktreePath,
	filePath,
	paneId,
	diffCategory,
	editorRef,
	originalContentRef,
	originalDiffContentRef,
	draftContentRef,
	setIsDirty,
	repoPath,
}: UseFileSaveParams) {
	const savingFromRawRef = useRef(false);
	const savingDiffContentRef = useRef<string | null>(null);
	const utils = electronTrpc.useUtils();

	const saveFileMutation = electronTrpc.changes.saveFile.useMutation({
		onSuccess: () => {
			setIsDirty(false);
			if (editorRef.current) {
				originalContentRef.current = editorRef.current.getValue();
			}
			if (savingDiffContentRef.current !== null) {
				originalDiffContentRef.current = savingDiffContentRef.current;
				savingDiffContentRef.current = null;
			}
			if (savingFromRawRef.current) {
				draftContentRef.current = null;
			}
			savingFromRawRef.current = false;

			utils.changes.readWorkingFile.invalidate();
			utils.changes.getFileContents.invalidate();
			utils.changes.getStatus.invalidate();

			if (diffCategory === "staged") {
				const panes = useTabsStore.getState().panes;
				const currentPane = panes[paneId];
				if (currentPane?.fileViewer) {
					useTabsStore.setState({
						panes: {
							...panes,
							[paneId]: {
								...currentPane,
								fileViewer: {
									...currentPane.fileViewer,
									diffCategory: "unstaged",
								},
							},
						},
					});
				}
			}
		},
	});

	const handleSaveRaw = useCallback(async () => {
		if (!editorRef.current || !filePath || !worktreePath) return;
		savingFromRawRef.current = true;
		await saveFileMutation.mutateAsync({
			worktreePath,
			filePath,
			content: editorRef.current.getValue(),
			repoPath,
		});
	}, [worktreePath, filePath, saveFileMutation, editorRef, repoPath]);

	const handleSaveDiff = useCallback(
		async (content: string) => {
			if (!filePath || !worktreePath) return;
			savingFromRawRef.current = false;
			savingDiffContentRef.current = content;
			await saveFileMutation.mutateAsync({
				worktreePath,
				filePath,
				content,
				repoPath,
			});
		},
		[worktreePath, filePath, saveFileMutation, repoPath],
	);

	return {
		handleSaveRaw,
		handleSaveDiff,
		isSaving: saveFileMutation.isPending,
	};
}
