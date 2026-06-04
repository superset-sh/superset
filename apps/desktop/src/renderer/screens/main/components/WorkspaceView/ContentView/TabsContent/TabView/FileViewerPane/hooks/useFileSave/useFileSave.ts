import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { invalidateFileSaveQueries } from "renderer/lib/invalidate-file-save-queries";
import type { EditorSaveResult } from "renderer/stores/editor-state/types";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { ChangeCategory } from "shared/changes-types";

const MAX_FILE_SIZE = 2 * 1024 * 1024;

interface UseFileSaveParams {
	workspaceId?: string;
	filePath: string;
	paneId: string;
	diffCategory?: ChangeCategory;
	getCurrentContent: () => string;
	getRevision: () => string | null;
	onSaveSuccess: (input: {
		savedContent: string;
		currentContent: string;
		revision: string;
	}) => void;
}

export function useFileSave({
	workspaceId,
	filePath,
	paneId,
	diffCategory,
	getCurrentContent,
	getRevision,
	onSaveSuccess,
}: UseFileSaveParams) {
	const utils = electronTrpc.useUtils();

	const writeFileMutation = electronTrpc.filesystem.writeFile.useMutation();

	const handleSaveFile = useCallback(
		async (options?: {
			force?: boolean;
		}): Promise<EditorSaveResult | undefined> => {
			if (!filePath || !workspaceId) return;

			const content = getCurrentContent();
			const precondition =
				options?.force || !getRevision()
					? undefined
					: { ifMatch: getRevision() as string };

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

			const currentContent = getCurrentContent();
			onSaveSuccess({
				savedContent: content,
				currentContent,
				revision: result.revision,
			});

			invalidateFileSaveQueries({
				workspaceId,
				filePath,
			});

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
			filePath,
			getCurrentContent,
			getRevision,
			onSaveSuccess,
			paneId,
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
