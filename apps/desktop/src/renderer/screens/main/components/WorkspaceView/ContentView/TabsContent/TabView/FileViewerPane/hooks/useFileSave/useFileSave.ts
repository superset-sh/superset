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
		onSuccess: (_data, variables) => {
			const savedContent = variables.content;
			const currentEditorValue = editorRef.current?.getValue() ?? savedContent;
			const hasUnsavedChanges = currentEditorValue !== savedContent;

			console.debug("[useFileSave] success", {
				filePath,
				savedContentLength: savedContent.length,
				savedContentTail: savedContent.slice(-80),
				editorValueLength: currentEditorValue.length,
				editorValueTail: currentEditorValue.slice(-80),
				hasUnsavedChanges,
			});

			utils.changes.readWorkingFile.setData(
				{ worktreePath: variables.worktreePath, filePath: variables.filePath },
				{
					ok: true,
					content: savedContent,
					truncated: false,
					byteLength: new TextEncoder().encode(savedContent).length,
				},
			);

			originalContentRef.current = savedContent;
			setIsDirty(hasUnsavedChanges);
			if (savingFromRawRef.current && !hasUnsavedChanges) {
				draftContentRef.current = null;
			} else if (hasUnsavedChanges) {
				draftContentRef.current = currentEditorValue;
			}
			savingFromRawRef.current = false;
			originalDiffContentRef.current = "";

			void utils.changes.readWorkingFile.invalidate();
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
