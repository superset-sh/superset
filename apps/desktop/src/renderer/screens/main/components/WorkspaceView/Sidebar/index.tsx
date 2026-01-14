import { useParams } from "@tanstack/react-router";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { ChangesView } from "./ChangesView";

export function Sidebar() {
	const { workspaceId } = useParams({ strict: false });
	const { data: workspace } = trpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	const worktreePath = workspace?.worktreePath;

	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);
	const trpcUtils = trpc.useUtils();

	// Invalidate file content queries to ensure fresh data when clicking a file
	const invalidateFileContent = (filePath: string) => {
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
	};

	// Single click - opens in preview mode (can be replaced by next single click)
	const handleFileOpen =
		workspaceId && worktreePath
			? (file: ChangedFile, category: ChangeCategory, commitHash?: string) => {
					addFileViewerPane(workspaceId, {
						filePath: file.path,
						diffCategory: category,
						commitHash,
						oldPath: file.oldPath,
						isPinned: false,
					});
					invalidateFileContent(file.path);
				}
			: undefined;

	// Double click - opens pinned (permanent, won't be replaced)
	const handleFileOpenPinned =
		workspaceId && worktreePath
			? (file: ChangedFile, category: ChangeCategory, commitHash?: string) => {
					addFileViewerPane(workspaceId, {
						filePath: file.path,
						diffCategory: category,
						commitHash,
						oldPath: file.oldPath,
						isPinned: true,
					});
					invalidateFileContent(file.path);
				}
			: undefined;

	return (
		<aside className="h-full flex flex-col overflow-hidden">
			<ChangesView
				onFileOpen={handleFileOpen}
				onFileOpenPinned={handleFileOpenPinned}
			/>
		</aside>
	);
}
