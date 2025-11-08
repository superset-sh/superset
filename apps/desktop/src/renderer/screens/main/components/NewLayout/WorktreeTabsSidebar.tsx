import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { type MotionValue, useMotionValue } from "framer-motion";
import { Monitor, Plus, Terminal as TerminalIcon, X } from "lucide-react";
import type React from "react";
import type { Tab, Workspace, Worktree } from "shared/types";
import { WorkspaceCarousel } from "../Sidebar/components/WorkspaceCarousel";
import { WorkspaceSwitcher } from "../Sidebar/components/WorkspaceSwitcher";

interface WorktreeTabsSidebarProps {
	worktree: Worktree | null;
	selectedTabId: string | null;
	onTabSelect: (tabId: string) => void;
	onTabClose: (tabId: string) => void;
	onCreateTerminal: () => void;
	onCreatePreview: () => void;
	workspaceId: string | null;
	// New props for workspace carousel
	workspaces?: Workspace[];
	currentWorkspace?: Workspace | null;
	onWorkspaceSelect?: (workspaceId: string) => void;
	onAddWorkspace?: () => void;
	onRemoveWorkspace?: (workspaceId: string, workspaceName: string) => void;
}

export const WorktreeTabsSidebar: React.FC<WorktreeTabsSidebarProps> = ({
	worktree,
	selectedTabId,
	onTabSelect,
	onTabClose,
	onCreateTerminal,
	onCreatePreview,
	workspaceId,
	workspaces,
	currentWorkspace,
	onWorkspaceSelect,
	onAddWorkspace,
	onRemoveWorkspace,
}) => {
	const scrollProgress = useMotionValue(0);

	if (!worktree || !workspaceId) {
		return (
			<div className="flex flex-col h-full p-4 text-neutral-400 text-sm">
				<p>No worktree selected</p>
			</div>
		);
	}

	const tabs = worktree.tabs || [];

	// Check if workspace carousel should be shown
	const showWorkspaceCarousel =
		workspaces &&
		workspaces.length > 1 &&
		currentWorkspace &&
		onWorkspaceSelect &&
		onAddWorkspace &&
		onRemoveWorkspace;

	// Helper to get icon for tab type
	const getTabIcon = (tab: Tab) => {
		switch (tab.type) {
			case "terminal":
				return <TerminalIcon size={14} />;
			case "preview":
				return <Monitor size={14} />;
			case "diff":
				return <Monitor size={14} />;
			default:
				return <TerminalIcon size={14} />;
		}
	};

	// Flatten tabs recursively (handle group tabs)
	const flattenTabs = (tabs: Tab[], level = 0): Array<{ tab: Tab; level: number }> => {
		const result: Array<{ tab: Tab; level: number }> = [];
		for (const tab of tabs) {
			result.push({ tab, level });
			if (tab.type === "group" && tab.tabs) {
				result.push(...flattenTabs(tab.tabs, level + 1));
			}
		}
		return result;
	};

	const flatTabs = flattenTabs(tabs);

	const renderSidebarContent = (workspace: Workspace | null, isActive: boolean) => {
		if (!workspace) return null;

		// Find the worktree for this workspace
		const workspaceWorktree = workspace.worktrees?.[0] || null;
		const workspaceTabs = workspaceWorktree?.tabs || [];
		const workspaceFlatTabs = flattenTabs(workspaceTabs);

		return (
			<>
				{/* Header with actions */}
				<div className="flex items-center justify-between p-3 border-b border-neutral-800">
					<h3 className="text-sm font-medium text-neutral-300">Tabs</h3>
					<div className="flex items-center gap-1">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={onCreateTerminal}
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
									onClick={onCreatePreview}
									className="h-6 w-6 hover:bg-neutral-800/60 text-neutral-400 hover:text-neutral-200"
								>
									<Monitor size={14} />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								<p className="text-xs">New Preview</p>
							</TooltipContent>
						</Tooltip>
					</div>
				</div>

				{/* Tab list */}
				<div className="flex-1 overflow-y-auto">
					{workspaceFlatTabs.length === 0 ? (
						<div className="p-4 text-sm text-neutral-500">
							No tabs yet. Create a terminal or preview to get started.
						</div>
					) : (
						<div className="p-2">
							{workspaceFlatTabs.map(({ tab, level }) => (
								<button
									key={tab.id}
									type="button"
									onClick={() => onTabSelect(tab.id)}
									className={`
										w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-sm transition-colors group
										${
											selectedTabId === tab.id
												? "bg-neutral-800 text-neutral-100"
												: "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50"
										}
									`}
									style={{ paddingLeft: `${12 + level * 16}px` }}
								>
									<div className="flex items-center gap-2 min-w-0">
										{getTabIcon(tab)}
										<span className="truncate">{tab.name}</span>
									</div>
									{tab.type !== "group" && (
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												onTabClose(tab.id);
											}}
											className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
										>
											<X size={14} />
										</button>
									)}
								</button>
							))}
						</div>
					)}
				</div>
			</>
		);
	};

	return (
		<div className="flex flex-col h-full select-none text-neutral-300 text-sm">
			{/* Workspace Switcher - only show if multiple workspaces */}
			{showWorkspaceCarousel && workspaces && currentWorkspace && onWorkspaceSelect && onAddWorkspace && onRemoveWorkspace && (
				<WorkspaceSwitcher
					workspaces={workspaces}
					currentWorkspaceId={currentWorkspace.id}
					onWorkspaceSelect={onWorkspaceSelect}
					onAddWorkspace={onAddWorkspace}
					onRemoveWorkspace={onRemoveWorkspace}
					scrollProgress={scrollProgress}
				/>
			)}

			{/* Workspace Carousel - horizontal scroll between workspaces */}
			{showWorkspaceCarousel && workspaces && currentWorkspace && onWorkspaceSelect ? (
				<WorkspaceCarousel
					workspaces={workspaces}
					currentWorkspace={currentWorkspace}
					onWorkspaceSelect={onWorkspaceSelect}
					onScrollProgress={(progress: MotionValue<number>) => {
						// Update scroll progress for the switcher
						scrollProgress.set(progress.get());
					}}
				>
					{renderSidebarContent}
				</WorkspaceCarousel>
			) : (
				// Single workspace - no carousel needed
				renderSidebarContent(currentWorkspace || null, true)
			)}
		</div>
	);
};
