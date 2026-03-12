import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import { useTabsStore } from "renderer/stores/tabs/store";

export interface UseFileLinkClickOptions {
	workspaceId: string;
	workspaceCwd: string | null | undefined;
}

export interface UseFileLinkClickReturn {
	handleFileLinkClick: (path: string, line?: number, column?: number) => void;
}

export function useFileLinkClick({
	workspaceId,
	workspaceCwd,
}: UseFileLinkClickOptions): UseFileLinkClickReturn {
	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);

	const { data: terminalLinkBehavior } =
		electronTrpc.settings.getTerminalLinkBehavior.useQuery();

	const handleFileLinkClick = useCallback(
		(path: string, line?: number, column?: number) => {
			const behavior = terminalLinkBehavior ?? "file-viewer";

			const openInExternalEditor = () => {
				trpcClient.external.openFileInEditor
					.mutate({
						path,
						line,
						column,
						cwd: workspaceCwd ?? undefined,
					})
					.catch((error) => {
						console.error(
							"[Terminal] Failed to open file in editor:",
							path,
							error,
						);
						const errorMessage =
							error instanceof Error ? error.message : String(error);
						toast.error("Failed to open file in editor", {
							description: errorMessage,
						});
					});
			};

			if (behavior !== "file-viewer") {
				openInExternalEditor();
				return;
			}

			if (!workspaceCwd) {
				openInExternalEditor();
				return;
			}

			// Resolve to absolute path on main process (~, relative, file:// all handled)
			// then route based on whether the result is inside the workspace.
			trpcClient.external.resolvePath
				.query({ path, cwd: workspaceCwd })
				.then((filePath) => {
					if (filePath === workspaceCwd) {
						return;
					}

					if (!filePath.startsWith(`${workspaceCwd}/`)) {
						toast.warning("File is outside the workspace", {
							description:
								"Switch to 'External editor' in Settings to open this file",
						});
						return;
					}

					addFileViewerPane(workspaceId, {
						filePath,
						line,
						column,
					});
				})
				.catch((error) => {
					console.error(
						"[Terminal] Failed to resolve path:",
						path,
						error,
					);
					openInExternalEditor();
				});
		},
		[terminalLinkBehavior, workspaceId, workspaceCwd, addFileViewerPane],
	);

	return {
		handleFileLinkClick,
	};
}
