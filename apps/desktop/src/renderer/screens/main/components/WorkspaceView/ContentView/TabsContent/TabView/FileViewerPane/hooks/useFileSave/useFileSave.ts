import { type MutableRefObject, useCallback, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { ChangeCategory } from "shared/changes-types";
import type { CodeEditorAdapter } from "../../../../../components";

interface UseFileSaveParams {
	worktreePath: string;
	filePath: string;
	paneId: string;
	diffCategory?: ChangeCategory;
	editorRef: MutableRefObject<CodeEditorAdapter | null>;
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
	const utils = electronTrpc.useUtils();

	const saveFileMutation = electronTrpc.changes.saveFile.useMutation({
		onMutate: (variables) => {
			console.debug("[useFileSave] mutate", {
				filePath: variables.filePath,
				contentLength: variables.content.length,
				contentTail: variables.content.slice(-80),
			});
		},
		onSuccess: () => {
			console.debug("[useFileSave] success", {
				filePath,
				editorValueLength: editorRef.current?.getValue().length ?? null,
				editorValueTail: editorRef.current?.getValue().slice(-80) ?? null,
			});
			setIsDirty(false);
			if (editorRef.current) {
				originalContentRef.current = editorRef.current.getValue();
			}
			if (savingFromRawRef.current) {
				draftContentRef.current = null;
			}
			savingFromRawRef.current = false;
			originalDiffContentRef.current = "";

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
		onError: (error, variables) => {
			console.error("[useFileSave] error", {
				filePath: variables.filePath,
				contentLength: variables.content.length,
				contentTail: variables.content.slice(-80),
				error,
			});
		},
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: Reads latest editor/draft refs at save time for debugging
	const handleSaveRaw = useCallback(async () => {
		if (!editorRef.current || !filePath || !worktreePath) return;
		const content = editorRef.current.getValue();
		const draftContent = draftContentRef.current;
		console.debug("[useFileSave] handleSaveRaw", {
			filePath,
			contentLength: content.length,
			contentTail: content.slice(-80),
			draftContentLength: draftContent?.length ?? null,
			draftContentTail: draftContent?.slice(-80) ?? null,
		});
		savingFromRawRef.current = true;
		await saveFileMutation.mutateAsync({
			worktreePath,
			filePath,
			content,
		});
	}, [worktreePath, filePath, saveFileMutation, editorRef]);

	return {
		handleSaveRaw,
		isSaving: saveFileMutation.isPending,
	};
}
