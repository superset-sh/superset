import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { ChangesView } from "./ChangesView";

export function Sidebar() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const workspaceId = activeWorkspace?.id;
	const worktreePath = activeWorkspace?.worktreePath;

	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);
	const trpcUtils = trpc.useUtils();

	// Invalidate file content queries to ensure fresh data when clicking a file
	const invalidateFileContent = (filePath: string) => {
		if (!worktreePath) return;
		void trpcUtils.changes.readWorkingFile.invalidate({
			worktreePath,
			filePath,
		});
		void trpcUtils.changes.getFileContents.invalidate({
			worktreePath,
			filePath,
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
