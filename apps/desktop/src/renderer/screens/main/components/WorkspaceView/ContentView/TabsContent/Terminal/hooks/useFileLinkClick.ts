import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { useFileOpenMode } from "renderer/hooks/useFileOpenMode";
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
	const fileOpenMode = useFileOpenMode();

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
				// This prevents confusing errors when the workspace is still initializing
				if (!workspaceCwd) {
					console.warn(
						"[Terminal] workspaceCwd not loaded, falling back to external editor",
					);
					openInExternalEditor();
					return;
				}

				// Normalize absolute paths to worktree-relative paths for file viewer
				// File viewer expects relative paths, but terminal links can be absolute
				let filePath = path;
				// Use path boundary check to avoid incorrect prefix stripping
				// e.g., /repo vs /repo-other should not match
				if (path === workspaceCwd) {
					filePath = ".";
				} else if (path.startsWith(`${workspaceCwd}/`)) {
					filePath = path.slice(workspaceCwd.length + 1);
				} else if (path.startsWith("/")) {
					// Absolute path outside workspace - show warning and don't attempt to open
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
					openInNewTab: fileOpenMode === "new-tab",
				});
			} else {
				openInExternalEditor();
			}
		},
		[
			terminalLinkBehavior,
			workspaceId,
			workspaceCwd,
			addFileViewerPane,
			fileOpenMode,
		],
	);

	return {
		handleFileLinkClick,
	};
}
