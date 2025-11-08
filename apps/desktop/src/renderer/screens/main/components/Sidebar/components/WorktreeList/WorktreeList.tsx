import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { GitCompare, Monitor, Plus } from "lucide-react";
import type { Workspace, Worktree } from "shared/types";
import { WorkspacePortIndicator } from "../WorkspacePortIndicator";
import { WorktreeItem } from "./components/WorktreeItem";

interface WorktreeListProps {
	currentWorkspace: Workspace | null;
	expandedWorktrees: Set<string>;
	onToggleWorktree: (worktreeId: string) => void;
	onTabSelect: (worktreeId: string, tabId: string) => void;
	onReload: () => void;
	onUpdateWorktree: (worktreeId: string, updatedWorktree: Worktree) => void;
	selectedTabId: string | undefined;
	onCloneWorktree: (worktreeId: string, branch: string) => void;
	onShowDiff?: (worktreeId: string) => void;
	selectedWorktreeId?: string | null;
	showWorkspaceHeader?: boolean;
}

export function WorktreeList({
	currentWorkspace,
	expandedWorktrees,
	onToggleWorktree,
	onTabSelect,
	onReload,
	onUpdateWorktree,
	selectedTabId,
	onCloneWorktree,
	onShowDiff,
	selectedWorktreeId,
	showWorkspaceHeader = false,
}: WorktreeListProps) {
	if (!currentWorkspace) {
		return (
			<div className="text-sm text-gray-500 px-3 py-2">No workspace open</div>
		);
	}

	if (!currentWorkspace.worktrees || currentWorkspace.worktrees.length === 0) {
		return (
			<div className="text-sm text-gray-500 px-3 py-2">
				No worktrees yet. Create one to get started.
			</div>
		);
	}

	// Check if workspace has port forwarding configured
	const hasPortForwarding =
		currentWorkspace.ports && currentWorkspace.ports.length > 0;

	// Get main branch from workspace config, fallback to 'main'
	const mainBranch = currentWorkspace.branch || "main";

	const handleAddTerminal = async () => {
		if (!currentWorkspace || !selectedWorktreeId) return;

		try {
			const result = await window.ipcRenderer.invoke("tab-create", {
				workspaceId: currentWorkspace.id,
				worktreeId: selectedWorktreeId,
				name: "New Terminal",
				type: "terminal",
			});

			if (result.success) {
				const newTabId = result.tab?.id;
				if (newTabId) {
					onTabSelect(selectedWorktreeId, newTabId);
				}
				onReload();
			}
		} catch (error) {
			console.error("Error creating terminal:", error);
		}
	};

	const handleAddPreview = async () => {
		if (!currentWorkspace || !selectedWorktreeId) return;

		try {
			const worktree = currentWorkspace.worktrees.find(
				(wt) => wt.id === selectedWorktreeId,
			);
			const previewTabs =
				worktree?.tabs?.filter((tab) => tab.type === "preview") || [];
			const previewNumber = previewTabs.length + 1;

			const result = await window.ipcRenderer.invoke("tab-create", {
				workspaceId: currentWorkspace.id,
				worktreeId: selectedWorktreeId,
				name: `Preview ${previewNumber}`,
				type: "preview",
			});

			if (result.success) {
				const newTabId = result.tab?.id;
				if (newTabId) {
					onTabSelect(selectedWorktreeId, newTabId);
				}
				onReload();
			}
		} catch (error) {
			console.error("Error creating preview:", error);
		}
	};

	const handleShowDiff = () => {
		if (onShowDiff && selectedWorktreeId) {
			onShowDiff(selectedWorktreeId);
		}
	};

	return (
		<>
			{/* Workspace Header - more minimal */}
			{showWorkspaceHeader && currentWorkspace && (
				<div className="px-3 pt-2 pb-1.5">
					<WorkspacePortIndicator workspace={currentWorkspace} />
				</div>
			)}

			{/* Action Buttons - more subtle, inline */}
			{selectedWorktreeId && (
				<div className="px-3 pb-1.5 flex items-center justify-center gap-1.5">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={handleAddTerminal}
								className="h-6 w-6 hover:bg-neutral-800/60 text-neutral-400 hover:text-neutral-200"
							>
								<Plus size={14} />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<p className="text-xs">New Terminal</p>
						</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={handleAddPreview}
								className="h-6 w-6 hover:bg-neutral-800/60 text-neutral-400 hover:text-neutral-200"
							>
								<Monitor size={14} />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							<p className="text-xs">New Preview</p>
						</TooltipContent>
					</Tooltip>

					{onShowDiff && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={handleShowDiff}
									className="h-6 w-6 hover:bg-neutral-800/60 text-neutral-400 hover:text-neutral-200"
								>
									<GitCompare size={14} />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								<p className="text-xs">View Changes</p>
							</TooltipContent>
						</Tooltip>
					)}
				</div>
			)}

			{currentWorkspace.worktrees.map((worktree) => (
				<WorktreeItem
					key={worktree.id}
					worktree={worktree}
					workspaceId={currentWorkspace.id}
					activeWorktreeId={currentWorkspace.activeWorktreeId}
					mainBranch={mainBranch}
					isExpanded={expandedWorktrees.has(worktree.id)}
					onToggle={onToggleWorktree}
					onTabSelect={onTabSelect}
					onReload={onReload}
					onUpdateWorktree={(updatedWorktree) =>
						onUpdateWorktree(worktree.id, updatedWorktree)
					}
					selectedTabId={selectedTabId}
					hasPortForwarding={hasPortForwarding}
					onCloneWorktree={() => onCloneWorktree(worktree.id, worktree.branch)}
				/>
			))}
		</>
	);
}
