import { toast } from "@superset/ui/sonner";
import { useCallback, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import { useTabsStore } from "renderer/stores/tabs/store";
import { normalizeFilePath } from "../normalizeFilePath";

export interface UseTerminalFileLinksOptions {
	workspaceId: string;
	/** Ref to workspace CWD (use ref to avoid terminal recreation) */
	workspaceCwdRef: React.RefObject<string | null | undefined>;
}

export interface UseTerminalFileLinksResult {
	/** Handler for file link clicks in terminal */
	handleFileLinkClick: (path: string, line?: number, column?: number) => void;
	/** Ref to handleFileLinkClick for use in terminal instance creation */
	handleFileLinkClickRef: React.RefObject<
		(path: string, line?: number, column?: number) => void
	>;
}

/**
 * Hook to manage terminal file link handling.
 *
 * Encapsulates:
 * - Terminal link behavior setting query
 * - File path normalization for file viewer
 * - External editor fallback
 * - Toast notifications for errors
 */
export function useTerminalFileLinks({
	workspaceId,
	workspaceCwdRef,
}: UseTerminalFileLinksOptions): UseTerminalFileLinksResult {
	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);

	// Query terminal link behavior setting
	const { data: terminalLinkBehavior } =
		electronTrpc.settings.getTerminalLinkBehavior.useQuery();

	const handleFileLinkClick = useCallback(
		(path: string, line?: number, column?: number) => {
			const behavior = terminalLinkBehavior ?? "external-editor";
			const workspaceCwd = workspaceCwdRef.current;

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

				// Normalize path for file viewer
				const normalized = normalizeFilePath(path, workspaceCwd);

				if (normalized.type === "absolute-outside-workspace") {
					toast.warning("File is outside the workspace", {
						description:
							"Switch to 'External editor' in Settings to open this file",
					});
					return;
				}

				const filePath =
					normalized.type === "workspace-root" ? "." : normalized.path;
				addFileViewerPane(workspaceId, { filePath, line, column });
			} else {
				openInExternalEditor();
			}
		},
		[terminalLinkBehavior, workspaceId, workspaceCwdRef, addFileViewerPane],
	);

	// Ref to avoid terminal recreation when callback changes
	const handleFileLinkClickRef = useRef(handleFileLinkClick);
	handleFileLinkClickRef.current = handleFileLinkClick;

	return {
		handleFileLinkClick,
		handleFileLinkClickRef,
	};
}
