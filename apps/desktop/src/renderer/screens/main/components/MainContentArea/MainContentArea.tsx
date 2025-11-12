import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from "@superset/ui/resizable";
import type { ImperativePanelHandle } from "react-resizable-panels";
import type { Tab, Workspace, Worktree } from "shared/types";
import type { AppMode } from "../../types";
import TabContent from "../MainContent/TabContent";
import TabGroup from "../MainContent/TabGroup";
import { PlaceholderState } from "../PlaceholderState";
import { PlanView } from "../PlanView";
import { Sidebar } from "../Sidebar";
import { DiffTab } from "../TabContent/components/DiffTab";

interface MainContentAreaProps {
    mode: AppMode;
    loading: boolean;
    error: string | null;
    currentWorkspace: Workspace | null;
    selectedWorktree: Worktree | undefined;
    selectedTab: Tab | undefined;
    parentGroupTab: Tab | undefined;
    selectedWorktreeId: string | null;
    selectedTabId: string | null;
    workspaces: Workspace[] | null;
    isSidebarOpen: boolean;
    sidebarPanelRef: React.RefObject<ImperativePanelHandle | null>;
    onSidebarCollapse: () => void;
    onSidebarExpand: () => void;
    onTabSelect: (worktreeId: string, tabId: string) => void;
    onWorktreeCreated: () => Promise<void>;
    onWorkspaceSelect: (workspaceId: string) => Promise<void>;
    onUpdateWorktree: (worktreeId: string, updatedWorktree: Worktree) => void;
    onTabFocus: (tabId: string) => void;
    onTabCreated: (worktreeId: string, tab: Tab) => void;
    onShowDiff: (worktreeId: string) => Promise<void>;
}

export function MainContentArea({
    mode,
    loading,
    error,
    currentWorkspace,
    selectedWorktree,
    selectedTab,
    parentGroupTab,
    selectedWorktreeId,
    selectedTabId,
    workspaces,
    isSidebarOpen,
    sidebarPanelRef,
    onSidebarCollapse,
    onSidebarExpand,
    onTabSelect,
    onWorktreeCreated,
    onWorkspaceSelect,
    onUpdateWorktree,
    onTabFocus,
    onTabCreated,
    onShowDiff,
}: MainContentAreaProps) {
    if (mode === "plan") {
        return (
            <PlanView
                currentWorkspace={currentWorkspace}
                selectedWorktreeId={selectedWorktreeId}
                onTabSelect={onTabSelect}
                onTabCreated={onTabCreated}
            />
        );
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
                onCollapse={onSidebarCollapse}
                onExpand={onSidebarExpand}
            >
                {isSidebarOpen && workspaces && (
                    <Sidebar
                        workspaces={workspaces}
                        currentWorkspace={currentWorkspace}
                        onTabSelect={onTabSelect}
                        onWorktreeCreated={onWorktreeCreated}
                        onWorkspaceSelect={onWorkspaceSelect}
                        onUpdateWorktree={onUpdateWorktree}
                        selectedTabId={selectedTabId ?? undefined}
                        selectedWorktreeId={selectedWorktreeId}
                        onCollapse={() => {
                            const panel = sidebarPanelRef.current;
                            if (panel && !panel.isCollapsed()) {
                                panel.collapse();
                            }
                        }}
                        onShowDiff={onShowDiff}
                    />
                )}
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Main content panel */}
            <ResizablePanel defaultSize={80} minSize={30}>
                {loading ||
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
                    <TabGroup
                        key={`${parentGroupTab.id}-${JSON.stringify(parentGroupTab.mosaicTree)}-${parentGroupTab.tabs?.length}`}
                        groupTab={parentGroupTab}
                        workingDirectory={
                            selectedWorktree.path || currentWorkspace.repoPath
                        }
                        workspaceId={currentWorkspace.id}
                        worktreeId={selectedWorktreeId ?? undefined}
                        selectedTabId={selectedTabId ?? undefined}
                        onTabFocus={onTabFocus}
                        workspaceName={currentWorkspace.name}
                        mainBranch={currentWorkspace.branch}
                    />
                ) : selectedTab.type === "group" ? (
                    // Selected tab is a group tab → display its mosaic layout
                    <TabGroup
                        key={`${selectedTab.id}-${JSON.stringify(selectedTab.mosaicTree)}-${selectedTab.tabs?.length}`}
                        groupTab={selectedTab}
                        workingDirectory={
                            selectedWorktree.path || currentWorkspace.repoPath
                        }
                        workspaceId={currentWorkspace.id}
                        worktreeId={selectedWorktreeId ?? undefined}
                        selectedTabId={selectedTabId ?? undefined}
                        onTabFocus={onTabFocus}
                        workspaceName={currentWorkspace.name}
                        mainBranch={currentWorkspace.branch}
                    />
                ) : selectedTab.type === "diff" ? (
                    // Diff tab → display diff view
                    <div className="w-full h-full">
                        <DiffTab
                            tab={selectedTab}
                            workspaceId={currentWorkspace.id}
                            worktreeId={selectedWorktreeId ?? ""}
                            worktree={selectedWorktree}
                            workspaceName={currentWorkspace.name}
                            mainBranch={currentWorkspace.branch}
                        />
                    </div>
                ) : (
                    // Base level tab (terminal, preview, etc.) → display full width/height
                    <div className="w-full h-full p-2 bg-[#1e1e1e]">
                        <TabContent
                            tab={selectedTab}
                            workingDirectory={
                                selectedWorktree.path || currentWorkspace.repoPath
                            }
                            workspaceId={currentWorkspace.id}
                            worktreeId={selectedWorktreeId ?? undefined}
                            worktree={selectedWorktree}
                            groupTabId="" // No parent group
                            selectedTabId={selectedTabId ?? undefined}
                            onTabFocus={onTabFocus}
                            workspaceName={currentWorkspace.name}
                            mainBranch={currentWorkspace.branch}
                        />
                    </div>
                )}
            </ResizablePanel>
        </ResizablePanelGroup>
    );
}
