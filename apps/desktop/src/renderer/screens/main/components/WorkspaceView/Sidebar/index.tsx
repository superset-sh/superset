import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { ChangesView } from "./ChangesView";

export function Sidebar() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const workspaceId = activeWorkspace?.id;

	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);

	// Single click - opens in preview mode (can be replaced by next single click)
	const handleFileOpen = workspaceId
		? (file: ChangedFile, category: ChangeCategory, commitHash?: string) => {
				addFileViewerPane(workspaceId, {
					filePath: file.path,
					diffCategory: category,
					commitHash,
					oldPath: file.oldPath,
					isPinned: false,
				});
			}
		: undefined;

	// Double click - opens pinned (permanent, won't be replaced)
	const handleFileOpenPinned = workspaceId
		? (file: ChangedFile, category: ChangeCategory, commitHash?: string) => {
				addFileViewerPane(workspaceId, {
					filePath: file.path,
					diffCategory: category,
					commitHash,
					oldPath: file.oldPath,
					isPinned: true,
				});
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
