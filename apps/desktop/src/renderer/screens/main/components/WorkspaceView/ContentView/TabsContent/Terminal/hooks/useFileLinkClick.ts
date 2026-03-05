import { toast } from "@superset/ui/sonner";
import { resolve } from "pathe";
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

/**
 * Hook to handle file link clicks in the terminal.
 *
 * Based on the terminal link behavior setting, opens files either in:
 * - Built-in file viewer pane (default)
 * - External editor (VS Code, etc.)
 */
export function useFileLinkClick({
	workspaceId,
	workspaceCwd,
}: UseFileLinkClickOptions): UseFileLinkClickReturn {
	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);

	// Query terminal link behavior setting
	const { data: terminalLinkBehavior } =
		electronTrpc.settings.getTerminalLinkBehavior.useQuery();

	const handleFileLinkClick = useCallback(
		(path: string, line?: number, column?: number) => {
			const behavior = terminalLinkBehavior ?? "external-editor";

			// Helper to open in external editor
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

			if (behavior === "file-viewer") {
				// If workspaceCwd is not loaded yet, fall back to external editor
				if (!workspaceCwd) {
					console.warn(
						"[Terminal] workspaceCwd not loaded, falling back to external editor",
					);
					openInExternalEditor();
					return;
				}

				// Resolve relative paths to absolute using workspace cwd
				const filePath = resolve(workspaceCwd, path);
				addFileViewerPane(workspaceId, {
					filePath,
					line,
					column,
				});
			} else {
				openInExternalEditor();
			}
		},
		[terminalLinkBehavior, workspaceId, workspaceCwd, addFileViewerPane],
	);

	return {
		handleFileLinkClick,
	};
}
