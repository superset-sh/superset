import type * as Monaco from "monaco-editor";
import { type MutableRefObject, useCallback, useRef } from "react";
import { trpc } from "renderer/lib/trpc";
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
}: UseFileSaveParams) {
	const savingFromRawRef = useRef(false);
	const savingDiffContentRef = useRef<string | null>(null);
	const utils = trpc.useUtils();

	const saveFileMutation = trpc.changes.saveFile.useMutation({
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
		});
	}, [worktreePath, filePath, saveFileMutation, editorRef]);

	const handleSaveDiff = useCallback(
		async (content: string) => {
			if (!filePath || !worktreePath) return;
			savingFromRawRef.current = false;
			savingDiffContentRef.current = content;
			await saveFileMutation.mutateAsync({
				worktreePath,
				filePath,
				content,
			});
		},
		[worktreePath, filePath, saveFileMutation],
	);

	return {
		handleSaveRaw,
		handleSaveDiff,
		isSaving: saveFileMutation.isPending,
	};
}
