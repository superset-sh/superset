import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from "@superset/ui/resizable";
import { useState } from "react";
import { useDiffData } from "../../hooks";
import type { AppMode } from "../../types";
import {
	useWorkspaceContext,
	useTabContext,
	useSidebarContext,
	useWorktreeOperationsContext,
} from "../../../../contexts";
import { DiffContentArea } from "../DiffView";
import TabContent from "../MainContent/TabContent";
import TabGroup from "../MainContent/TabGroup";
import { PlaceholderState } from "../PlaceholderState";
import { PlanView } from "../PlanView";
import { Sidebar } from "../Sidebar";
import type { SidebarMode } from "../Sidebar/components/ModeCarousel";

interface MainContentAreaProps {
    mode: AppMode;
}

export function MainContentArea({ mode }: MainContentAreaProps) {
	const {
		workspaces,
		currentWorkspace,
		loading,
		error,
		handleWorkspaceSelect,
	} = useWorkspaceContext();
	const {
		selectedWorktreeId,
		selectedTabId,
		selectedWorktree,
		selectedTab,
		parentGroupTab,
		handleTabFocus,
		handleTabCreated,
	} = useTabContext();
	const {
		isSidebarOpen,
		sidebarPanelRef,
		setIsSidebarOpen,
		handleCollapseSidebar,
		handleExpandSidebar,
	} = useSidebarContext();
	const {
		handleWorktreeCreated,
		handleUpdateWorktree,
	} = useWorktreeOperationsContext();
    const [sidebarMode, setSidebarMode] = useState<SidebarMode>("tabs");
    const [selectedFile, setSelectedFile] = useState<string | null>(null);

    // Fetch diff data when sidebar is in diff mode
    const {
        diffData,
        loading: diffLoading,
        refreshing: diffRefreshing,
        refresh: refreshDiff,
        loadFileContent,
        loadedFiles,
        loadingFiles,
    } = useDiffData({
        workspaceId: currentWorkspace?.id,
        worktreeId: selectedWorktreeId ?? undefined,
        worktreeBranch: selectedWorktree?.branch,
        workspaceName: currentWorkspace?.name,
        enabled: sidebarMode === "changes" && !!selectedWorktreeId,
    });
    if (mode === "plan") {
        return <PlanView />;
    }

    return (
        <ResizablePanelGroup direction="horizontal" autoSaveId="new-layout-panels">
            {/* Sidebar panel with full workspace/worktree management */}
            <ResizablePanel
                ref={sidebarPanelRef}
                defaultSize={20}
                minSize={15}
                maxSize={40}
                collapsible
                onCollapse={handleCollapseSidebar}
                onExpand={handleExpandSidebar}
            >
                {isSidebarOpen && workspaces && (
                    <Sidebar
                        onDiffModeChange={(mode, file) => {
                            setSidebarMode(mode);
                            setSelectedFile(file);
                        }}
                    />
                )}
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Main content panel */}
            <ResizablePanel defaultSize={80} minSize={30}>
                {sidebarMode === "changes" ? (
                    diffLoading ? (
                        <PlaceholderState
                            loading={true}
                            error={null}
                            hasWorkspace={!!currentWorkspace}
                        />
                    ) : diffData ? (
                        // Diff mode - show diff content area
                        <DiffContentArea
                            data={diffData}
                            selectedFile={selectedFile}
                            onFileSelect={setSelectedFile}
                            onRefresh={refreshDiff}
                            isRefreshing={diffRefreshing}
                            loadFileContent={loadFileContent}
                            loadedFiles={loadedFiles}
                            loadingFiles={loadingFiles}
                        />
                    ) : (
                        <PlaceholderState
                            loading={false}
                            error={null}
                            hasWorkspace={!!currentWorkspace}
                        />
                    )
                ) : loading ||
                    error ||
                    !currentWorkspace ||
                    !selectedTab ||
                    !selectedWorktree ? (
                    <PlaceholderState
                        loading={loading}
                        error={error}
                        hasWorkspace={!!currentWorkspace}
                    />
                ) : parentGroupTab ? (
                    // Selected tab is a sub-tab of a group → display the parent group's mosaic
                    <TabGroup groupTab={parentGroupTab} />
                ) : selectedTab.type === "group" ? (
                    // Selected tab is a group tab → display its mosaic layout
                    <TabGroup groupTab={selectedTab} />
                ) : (
                    // Base level tab (terminal, preview, etc.) → display full width/height
                    <div className="w-full h-full p-2 bg-[#1e1e1e] rounded-sm">
                        <TabContent
                            tab={selectedTab}
                            groupTabId="" // No parent group
                        />
                    </div>
                )}
            </ResizablePanel>
        </ResizablePanelGroup>
    );
}
