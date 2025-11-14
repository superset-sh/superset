import { useState } from "react";
import { AppFrame } from "./components/AppFrame";
import { Background } from "./components/Background";
import { AddTaskModal } from "./components/Layout/AddTaskModal";
import { TaskTabs } from "./components/Layout/TaskTabs";
import { MainContentArea } from "./components/MainContentArea";
import { SidebarOverlay } from "./components/SidebarOverlay";
import { WorkspaceSelectionModal } from "./components/WorkspaceSelectionModal";
import { MOCK_TASKS } from "./constants";
import {
	useSidebar,
	useTabs,
	useTasks,
	useWorkspace,
	useWorktrees,
} from "./hooks";
import type { AppMode } from "./types";
import { enrichWorktreesWithTasks } from "./utils";

export function MainScreen() {
	const [mode, setMode] = useState<AppMode>("edit");

	// Tab management (needs to be initialized first for workspace hook)
	const [selectedWorktreeId, setSelectedWorktreeId] = useState<string | null>(
		null,
	);
	const [selectedTabId, setSelectedTabId] = useState<string | null>(null);

	// Workspace management
	const {
		workspaces,
		currentWorkspace,
		setCurrentWorkspace,
		setWorkspaces,
		loading,
		error,
		showWorkspaceSelection,
		loadAllWorkspaces,
		handleWorkspaceSelect,
		handleWorkspaceSelectFromModal,
		handleCreateWorkspaceFromModal,
	} = useWorkspace({
		setSelectedWorktreeId,
		setSelectedTabId,
	});

	// Tab management
	const {
		selectedWorktree,
		selectedTab,
		parentGroupTab,
		handleTabCreated,
		handleTabSelect,
		handleTabFocus,
	} = useTabs({
		currentWorkspace,
		setCurrentWorkspace,
		selectedWorktreeId,
		setSelectedWorktreeId,
		selectedTabId,
		setSelectedTabId,
	});

	// Sidebar management
	const {
		sidebarPanelRef,
		isSidebarOpen,
		setIsSidebarOpen,
		showSidebarOverlay,
		setShowSidebarOverlay,
		handleCollapseSidebar,
		handleExpandSidebar,
	} = useSidebar();

	// Worktree operations
	const {
		handleWorktreeCreated,
		handleUpdateWorktree,
		handleCreatePR,
		handleMergePR,
		handleDeleteWorktree,
	} = useWorktrees({
		currentWorkspace,
		setCurrentWorkspace,
		setWorkspaces,
		loadAllWorkspaces,
		selectedWorktreeId,
		setSelectedWorktreeId,
		setSelectedTabId,
	});

	// Task management
	const {
		isAddTaskModalOpen,
		addTaskModalInitialMode,
		branches,
		isCreatingWorktree,
		setupStatus,
		setupOutput,
		pendingWorktrees,
		openTasks,
		handleOpenAddTaskModal,
		handleCloseAddTaskModal,
		handleSelectTask,
		handleCreateTask,
	} = useTasks({
		currentWorkspace,
		setSelectedWorktreeId,
		handleTabSelect,
		handleWorktreeCreated,
	});

	return (
		<>
			<Background />

			{/* Hover trigger area when sidebar is hidden */}
			{!isSidebarOpen && (
				<button
					type="button"
					className="fixed left-0 top-0 bottom-0 w-2 z-50"
					onMouseEnter={() => setShowSidebarOverlay(true)}
					aria-label="Show sidebar"
				/>
			)}

			{/* Sidebar overlay when hidden and hovering */}
			<SidebarOverlay
				isVisible={showSidebarOverlay}
				workspaces={workspaces}
				currentWorkspace={currentWorkspace}
				onMouseLeave={() => setShowSidebarOverlay(false)}
				onTabSelect={handleTabSelect}
				onWorktreeCreated={handleWorktreeCreated}
				onWorkspaceSelect={handleWorkspaceSelect}
				onUpdateWorktree={handleUpdateWorktree}
				selectedTabId={selectedTabId ?? undefined}
				selectedWorktreeId={selectedWorktreeId}
			/>

			<AppFrame>
				<div className="flex flex-col h-full w-full">
					{/* Worktree tabs at the top - each tab represents a worktree */}
					<TaskTabs
						onCollapseSidebar={handleCollapseSidebar}
						onExpandSidebar={handleExpandSidebar}
						isSidebarOpen={isSidebarOpen}
						onAddTask={handleOpenAddTaskModal}
						onCreatePR={() => handleCreatePR(selectedWorktreeId)}
						onMergePR={() => handleMergePR(selectedWorktreeId)}
						worktrees={enrichWorktreesWithTasks(
							currentWorkspace?.worktrees || [],
							pendingWorktrees,
						)}
						selectedWorktreeId={selectedWorktreeId}
						onWorktreeSelect={(worktreeId) => {
							// Don't allow selecting pending worktrees
							if (worktreeId.startsWith("pending-")) return;

							setSelectedWorktreeId(worktreeId);
							// Select first tab in the worktree
							const worktree = currentWorkspace?.worktrees?.find(
								(wt) => wt.id === worktreeId,
							);
							if (worktree?.tabs && worktree.tabs.length > 0) {
								handleTabSelect(worktreeId, worktree.tabs[0].id);
							}
						}}
						onDeleteWorktree={handleDeleteWorktree}
						workspaceId={currentWorkspace?.id}
						mode={mode}
						onModeChange={setMode}
					/>

					{/* Main content area - conditionally render based on mode */}
					<div className="flex-1 overflow-hidden p-2 gap-2">
						<MainContentArea
							mode={mode}
							loading={loading}
							error={error}
							currentWorkspace={currentWorkspace}
							selectedWorktree={selectedWorktree}
							selectedTab={selectedTab}
							parentGroupTab={parentGroupTab}
							selectedWorktreeId={selectedWorktreeId}
							selectedTabId={selectedTabId}
							workspaces={workspaces}
							isSidebarOpen={isSidebarOpen}
							sidebarPanelRef={sidebarPanelRef}
							onSidebarCollapse={() => setIsSidebarOpen(false)}
							onSidebarExpand={() => setIsSidebarOpen(true)}
							onTabSelect={handleTabSelect}
							onWorktreeCreated={handleWorktreeCreated}
							onWorkspaceSelect={handleWorkspaceSelect}
							onUpdateWorktree={handleUpdateWorktree}
							onTabFocus={handleTabFocus}
							onTabCreated={handleTabCreated}
						/>
					</div>
				</div>
			</AppFrame>

			{/* Open Task Modal */}
			<AddTaskModal
				isOpen={isAddTaskModalOpen}
				onClose={handleCloseAddTaskModal}
				tasks={MOCK_TASKS}
				openTasks={openTasks}
				onSelectTask={handleSelectTask}
				onCreateTask={handleCreateTask}
				initialMode={addTaskModalInitialMode}
				branches={branches}
				worktrees={currentWorkspace?.worktrees || []}
				isCreating={isCreatingWorktree}
				setupStatus={setupStatus}
				setupOutput={setupOutput}
			/>

			{/* Workspace Selection Modal */}
			{workspaces && (
				<WorkspaceSelectionModal
					isOpen={showWorkspaceSelection}
					workspaces={workspaces}
					onSelectWorkspace={handleWorkspaceSelectFromModal}
					onCreateWorkspace={handleCreateWorkspaceFromModal}
				/>
			)}
		</>
	);
}
