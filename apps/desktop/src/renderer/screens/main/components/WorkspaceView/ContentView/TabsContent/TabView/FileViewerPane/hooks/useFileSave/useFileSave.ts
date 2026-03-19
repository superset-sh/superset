import { type MutableRefObject, useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { ChangeCategory } from "shared/changes-types";

const MAX_FILE_SIZE = 2 * 1024 * 1024;

export type FileSaveResult =
	| { status: "saved" }
	| {
			status: "conflict";
			currentContent: string | null;
	  };

interface UseFileSaveParams {
	workspaceId?: string;
	filePath: string;
	paneId: string;
	diffCategory?: ChangeCategory;
	getCurrentContent: () => string;
	hasLoadedOriginalContentRef: MutableRefObject<boolean>;
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
	getCurrentContent,
	hasLoadedOriginalContentRef,
	originalContentRef,
	originalDiffContentRef,
	draftContentRef,
	revisionRef,
	setIsDirty,
}: UseFileSaveParams) {
	const utils = electronTrpc.useUtils();

	const writeFileMutation = electronTrpc.filesystem.writeFile.useMutation();

	const handleSaveFile = useCallback(
		async (options?: {
			force?: boolean;
		}): Promise<FileSaveResult | undefined> => {
			if (!filePath || !workspaceId) return;

			const content = getCurrentContent();
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

			const currentContent = getCurrentContent();
			const hasUnsavedChanges = currentContent !== content;

			originalContentRef.current = content;
			hasLoadedOriginalContentRef.current = true;
			setIsDirty(hasUnsavedChanges);
			if (!hasUnsavedChanges) {
				draftContentRef.current = null;
			} else if (hasUnsavedChanges) {
				draftContentRef.current = currentContent;
			}
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
			diffCategory,
			draftContentRef,
			filePath,
			getCurrentContent,
			hasLoadedOriginalContentRef,
			originalContentRef,
			originalDiffContentRef,
			paneId,
			revisionRef,
			setIsDirty,
			utils,
			workspaceId,
			writeFileMutation,
		],
	);

	return {
		handleSaveFile,
		isSaving: writeFileMutation.isPending,
	};
}
