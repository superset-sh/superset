import { useState } from "react";
import { AppFrame } from "./components/AppFrame";
import { Background } from "./components/Background";
import { AddTaskModal } from "./components/Layout/AddTaskModal";
import { TaskTabs } from "./components/Layout/TaskTabs";
import { MainContentArea } from "./components/MainContentArea";
import { SidebarOverlay } from "./components/SidebarOverlay";
import { WorkspaceSelectionModal } from "./components/WorkspaceSelectionModal";
import {
	useWorkspaceContext,
	useTabContext,
	useSidebarContext,
	useWorktreeOperationsContext,
	useTaskContext,
} from "../../contexts";
import type { AppMode } from "./types";
import { enrichWorktreesWithTasks } from "./utils";

export function MainScreen() {
	const [mode, setMode] = useState<AppMode>("edit");

	// Workspace management
	const {
		workspaces,
		currentWorkspace,
		loading,
		error,
		showWorkspaceSelection,
		handleWorkspaceSelect,
		handleWorkspaceSelectFromModal,
		handleCreateWorkspaceFromModal,
	} = useWorkspaceContext();

	// Tab management
	const {
		selectedWorktreeId,
		setSelectedWorktreeId,
		selectedWorktree,
		selectedTab,
		parentGroupTab,
		handleTabCreated,
		handleTabSelect,
		handleTabFocus,
	} = useTabContext();

	// Sidebar management
	const {
		sidebarPanelRef,
		isSidebarOpen,
		setIsSidebarOpen,
		showSidebarOverlay,
		setShowSidebarOverlay,
		handleCollapseSidebar,
		handleExpandSidebar,
	} = useSidebarContext();

	// Worktree operations
	const {
		handleWorktreeCreated,
		handleUpdateWorktree,
		handleCreatePR,
		handleMergePR,
		handleDeleteWorktree,
	} = useWorktreeOperationsContext();

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
		handleClearStatus,
	} = useTaskContext();

	return (
		<>
			<Background />

			{/* Hover trigger area when sidebar is hidden */}
			{!isSidebarOpen && (
				<button
					type="button"
					className="fixed left-0 top-0 bottom-0 w-2 z-30"
					onMouseEnter={() => setShowSidebarOverlay(true)}
					aria-label="Show sidebar"
				/>
			)}

			{/* Sidebar overlay when hidden and hovering */}
			<SidebarOverlay
				isVisible={showSidebarOverlay}
				onMouseLeave={() => setShowSidebarOverlay(false)}
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
						<MainContentArea mode={mode} />
					</div>
				</div>
			</AppFrame>

			{/* Open Task Modal */}
			<AddTaskModal
				isOpen={isAddTaskModalOpen}
				onClose={handleCloseAddTaskModal}
				openTasks={openTasks}
				onSelectTask={handleSelectTask}
				onCreateTask={handleCreateTask}
				initialMode={addTaskModalInitialMode}
				branches={branches}
				worktrees={currentWorkspace?.worktrees || []}
				isCreating={isCreatingWorktree}
				setupStatus={setupStatus}
				setupOutput={setupOutput}
				onClearStatus={handleClearStatus}
				currentWorkspaceId={currentWorkspace?.id || null}
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
