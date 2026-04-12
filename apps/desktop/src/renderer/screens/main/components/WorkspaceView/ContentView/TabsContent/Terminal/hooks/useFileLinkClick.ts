import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { DetectedLink } from "renderer/lib/terminal/links";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import { useTabsStore } from "renderer/stores/tabs/store";

export interface UseFileLinkClickOptions {
	workspaceId: string;
	workspaceCwd: string | null | undefined;
}

export interface UseFileLinkClickReturn {
	handleFileLinkClick: (event: MouseEvent, link: DetectedLink) => void;
}

export function useFileLinkClick({
	workspaceId,
	workspaceCwd,
}: UseFileLinkClickOptions): UseFileLinkClickReturn {
	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);

	const { data: terminalLinkBehavior } =
		electronTrpc.settings.getTerminalLinkBehavior.useQuery();

	const handleFileLinkClick = useCallback(
		(_event: MouseEvent, link: DetectedLink) => {
			const { resolvedPath, row: line, col: column, isDirectory } = link;
			const behavior = terminalLinkBehavior ?? "file-viewer";

			const openInExternalEditor = () => {
				trpcClient.external.openFileInEditor
					.mutate({
						path: resolvedPath,
						line,
						column,
						cwd: workspaceCwd ?? undefined,
					})
					.catch((error) => {
						console.error(
							"[Terminal] Failed to open file in editor:",
							resolvedPath,
							error,
						);
						const errorMessage =
							error instanceof Error ? error.message : String(error);
						toast.error("Failed to open file in editor", {
							description: errorMessage,
						});
					});
			};

			if (behavior !== "file-viewer" || isDirectory) {
				openInExternalEditor();
				return;
			}

			if (!workspaceCwd || resolvedPath === workspaceCwd) {
				if (!workspaceCwd) openInExternalEditor();
				return;
			}

			addFileViewerPane(workspaceId, {
				filePath: resolvedPath,
				line,
				column,
			});
		},
		[terminalLinkBehavior, workspaceId, workspaceCwd, addFileViewerPane],
	);

	return {
		handleFileLinkClick,
	};
}
