import { useParams } from "@tanstack/react-router";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { SidebarMode, useSidebarStore } from "renderer/stores/sidebar-state";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { useScrollContext } from "../ChangesContent";
import { ChangesView } from "./ChangesView";

export function Sidebar() {
	const { workspaceId } = useParams({ strict: false });
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	const worktreePath = workspace?.worktreePath;
	const { currentMode } = useSidebarStore();
	const isExpanded = currentMode === SidebarMode.Changes;

	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);
	const trpcUtils = electronTrpc.useUtils();
	const { scrollToFile } = useScrollContext();

	const invalidateFileContent = useCallback(
		(filePath: string) => {
			if (!worktreePath) return;

			Promise.all([
				trpcUtils.changes.readWorkingFile.invalidate({
					worktreePath,
					filePath,
				}),
				trpcUtils.changes.getFileContents.invalidate({
					worktreePath,
					filePath,
				}),
			]).catch((error) => {
				console.error(
					"[Sidebar/invalidateFileContent] Failed to invalidate file content queries:",
					{ worktreePath, filePath, error },
				);
			});
		},
		[worktreePath, trpcUtils],
	);

	const handleFileOpenPane = useCallback(
		(file: ChangedFile, category: ChangeCategory, commitHash?: string) => {
			if (!workspaceId || !worktreePath) return;
			addFileViewerPane(workspaceId, {
				filePath: file.path,
				diffCategory: category,
				commitHash,
				oldPath: file.oldPath,
			});
			invalidateFileContent(file.path);
		},
		[workspaceId, worktreePath, addFileViewerPane, invalidateFileContent],
	);

	const handleFileScrollTo = useCallback(
		(file: ChangedFile, category: ChangeCategory, commitHash?: string) => {
			scrollToFile(file, category, commitHash);
		},
		[scrollToFile],
	);

	const handleFileOpen =
		workspaceId && worktreePath
			? isExpanded
				? handleFileScrollTo
				: handleFileOpenPane
			: undefined;

	return (
		<aside className="h-full flex flex-col overflow-hidden">
			<ChangesView onFileOpen={handleFileOpen} isExpandedView={isExpanded} />
		</aside>
	);
}
