import { useMemo } from "react";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { ChangesView, type FileContextMenuProps } from "./ChangesView";

export function Sidebar() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const workspaceId = activeWorkspace?.id;
	const worktreePath = activeWorkspace?.worktreePath;

	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);
	const addTab = useTabsStore((s) => s.addTab);
	const splitPaneHorizontal = useTabsStore((s) => s.splitPaneHorizontal);
	const splitPaneVertical = useTabsStore((s) => s.splitPaneVertical);
	const tabs = useTabsStore((s) => s.tabs);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);

	const openInApp = trpc.external.openInApp.useMutation();

	// Get the current tab and available tabs for the workspace
	const currentTabId = workspaceId ? (activeTabIds[workspaceId] ?? "") : "";
	const workspaceTabs = useMemo(
		() => tabs.filter((t) => t.workspaceId === workspaceId),
		[tabs, workspaceId],
	);

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

	// Context menu props for file items (without discard - that's added in ChangesView)
	const contextMenuProps:
		| Omit<FileContextMenuProps, "onDiscardChanges">
		| undefined = useMemo(
		() =>
			workspaceId && worktreePath
				? {
						currentTabId,
						availableTabs: workspaceTabs,
						onOpenInSplitHorizontal: (file: ChangedFile) => {
							// Add the file viewer pane, then split
							const paneId = addFileViewerPane(workspaceId, {
								filePath: file.path,
								oldPath: file.oldPath,
								isPinned: true,
							});
							if (paneId) {
								splitPaneHorizontal(currentTabId, paneId);
							}
						},
						onOpenInSplitVertical: (file: ChangedFile) => {
							const paneId = addFileViewerPane(workspaceId, {
								filePath: file.path,
								oldPath: file.oldPath,
								isPinned: true,
							});
							if (paneId) {
								splitPaneVertical(currentTabId, paneId);
							}
						},
						onOpenInApp: (file: ChangedFile) => {
							const fullPath = `${worktreePath}/${file.path}`;
							openInApp.mutate({ path: fullPath, app: "cursor" });
						},
						onOpenInNewTab: (file: ChangedFile) => {
							// Create a new tab - it will become active automatically
							addTab(workspaceId);
							// Add the file viewer pane to the new active tab
							addFileViewerPane(workspaceId, {
								filePath: file.path,
								oldPath: file.oldPath,
								isPinned: true,
							});
						},
						onMoveToTab: (file: ChangedFile, tabId: string) => {
							// Switch to the target tab and add the file viewer pane
							useTabsStore.getState().setActiveTab(workspaceId, tabId);
							addFileViewerPane(workspaceId, {
								filePath: file.path,
								oldPath: file.oldPath,
								isPinned: true,
							});
						},
					}
				: undefined,
		[
			workspaceId,
			worktreePath,
			currentTabId,
			workspaceTabs,
			addFileViewerPane,
			addTab,
			splitPaneHorizontal,
			splitPaneVertical,
			openInApp,
		],
	);

	return (
		<aside className="h-full flex flex-col overflow-hidden">
			<ChangesView
				onFileOpen={handleFileOpen}
				onFileOpenPinned={handleFileOpenPinned}
				contextMenuProps={contextMenuProps}
			/>
		</aside>
	);
}
