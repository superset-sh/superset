import { type MutableRefObject, useCallback, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { ChangeCategory } from "shared/changes-types";
import type { CodeEditorAdapter } from "../../../../../components";

const MAX_FILE_SIZE = 2 * 1024 * 1024;

interface UseFileSaveParams {
	workspaceId?: string;
	filePath: string;
	paneId: string;
	diffCategory?: ChangeCategory;
	editorRef: MutableRefObject<CodeEditorAdapter | null>;
	originalContentRef: MutableRefObject<string>;
	originalDiffContentRef: MutableRefObject<string>;
	draftContentRef: MutableRefObject<string | null>;
	revisionRef: MutableRefObject<string>;
	setIsDirty: (dirty: boolean) => void;
}

export function useFileSave({
	workspaceId,
	filePath,
	paneId,
	diffCategory,
	editorRef,
	originalContentRef,
	originalDiffContentRef,
	draftContentRef,
	revisionRef,
	setIsDirty,
}: UseFileSaveParams) {
	const savingFromRawRef = useRef(false);
	const utils = electronTrpc.useUtils();

	const writeFileMutation = electronTrpc.filesystem.writeFile.useMutation();

	const handleSaveRaw = useCallback(
		async (options?: { force?: boolean }) => {
			if (!editorRef.current || !filePath || !workspaceId) return;
			savingFromRawRef.current = true;

			const content = editorRef.current.getValue();
			const precondition =
				options?.force || !revisionRef.current
					? undefined
					: { ifMatch: revisionRef.current };

			const result = await writeFileMutation.mutateAsync({
				workspaceId,
				absolutePath: filePath,
				content,
				encoding: "utf-8",
				precondition,
			});

			if (!result.ok) {
				savingFromRawRef.current = false;
				if (result.reason === "conflict") {
					try {
						const currentFile = await utils.filesystem.readFile.fetch({
							workspaceId,
							absolutePath: filePath,
							encoding: "utf-8",
							maxBytes: MAX_FILE_SIZE,
						});
						return {
							status: "conflict" as const,
							currentContent: (currentFile.content as string) ?? null,
						};
					} catch {
						return { status: "conflict" as const, currentContent: null };
					}
				}
				return undefined;
			}

			revisionRef.current = result.revision;

			const currentEditorValue = editorRef.current?.getValue() ?? content;
			const hasUnsavedChanges = currentEditorValue !== content;

			originalContentRef.current = content;
			setIsDirty(hasUnsavedChanges);
			if (savingFromRawRef.current && !hasUnsavedChanges) {
				draftContentRef.current = null;
			} else if (hasUnsavedChanges) {
				draftContentRef.current = currentEditorValue;
			}
			savingFromRawRef.current = false;
			originalDiffContentRef.current = "";

			void utils.filesystem.readFile.invalidate({
				workspaceId,
				absolutePath: filePath,
			});
			utils.changes.getGitFileContents.invalidate();
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

			return { status: "saved" as const };
		},
		[
			filePath,
			workspaceId,
			writeFileMutation,
			editorRef,
			originalContentRef,
			originalDiffContentRef,
			draftContentRef,
			revisionRef,
			setIsDirty,
			utils,
			paneId,
			diffCategory,
		],
	);

	return {
		handleSaveRaw,
		isSaving: writeFileMutation.isPending,
	};
}
