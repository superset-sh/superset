import { trpc } from "renderer/lib/trpc";
import { SidebarMode, useSidebarStore } from "renderer/stores/sidebar-state";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useWorkspaceViewModeStore } from "renderer/stores/workspace-view-mode";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import { DEFAULT_GROUP_TABS_POSITION } from "shared/constants";
import { ChangesView } from "./ChangesView";
import { ModeCarousel } from "./ModeCarousel";
import { TabsView } from "./TabsView";

// Stable reference to avoid ModeCarousel effect churn
const SIDEBAR_MODES: SidebarMode[] = [SidebarMode.Tabs, SidebarMode.Changes];

export function Sidebar() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const workspaceId = activeWorkspace?.id;

	// Subscribe to the actual data, not just the getter function
	const viewModeByWorkspaceId = useWorkspaceViewModeStore(
		(s) => s.viewModeByWorkspaceId,
	);

	const viewMode = workspaceId
		? (viewModeByWorkspaceId[workspaceId] ?? "workbench")
		: "workbench";

	// Get group tabs position setting
	const { data: groupTabsPosition } =
		trpc.settings.getGroupTabsPosition.useQuery();
	const effectivePosition = groupTabsPosition ?? DEFAULT_GROUP_TABS_POSITION;

	// Sidebar mode carousel state
	const { currentMode, setMode, isResizing } = useSidebarStore();

	const addFileViewerPane = useTabsStore((s) => s.addFileViewerPane);

	// In Workbench mode, open files in FileViewerPane
	const handleFileOpen =
		viewMode === "workbench" && workspaceId
			? (file: ChangedFile, category: ChangeCategory, commitHash?: string) => {
					addFileViewerPane(workspaceId, {
						filePath: file.path,
						diffCategory: category,
						commitHash,
						oldPath: file.oldPath,
					});
				}
			: undefined;

	// CRITICAL: Review mode ALWAYS shows ChangesView only, regardless of setting
	// This ensures the file list is always available for review
	if (viewMode === "review") {
		return (
			<aside className="h-full flex flex-col overflow-hidden">
				<ChangesView />
			</aside>
		);
	}

	// Workbench mode with groups in content header: only show ChangesView
	if (effectivePosition === "content-header") {
		return (
			<aside className="h-full flex flex-col overflow-hidden">
				<ChangesView onFileOpen={handleFileOpen} />
			</aside>
		);
	}

	// Workbench mode with groups in sidebar: show ModeCarousel with Tabs/Changes
	return (
		<aside className="h-full flex flex-col overflow-hidden">
			<ModeCarousel
				modes={SIDEBAR_MODES}
				currentMode={currentMode}
				onModeSelect={setMode}
				isDragging={isResizing}
			>
				{(mode) => {
					if (mode === SidebarMode.Changes) {
						return <ChangesView onFileOpen={handleFileOpen} />;
					}
					return <TabsView />;
				}}
			</ModeCarousel>
		</aside>
	);
}
