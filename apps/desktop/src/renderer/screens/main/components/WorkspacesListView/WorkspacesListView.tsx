import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LuSearch, LuX } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { FilterMode, ProjectGroup, WorkspaceItem } from "./types";
import { WorkspaceRow } from "./WorkspaceRow";

const FILTER_OPTIONS: { value: FilterMode; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "active", label: "Active" },
	{ value: "closed", label: "Closed" },
];

export function WorkspacesListView() {
	const [searchQuery, setSearchQuery] = useState("");
	const [filterMode, setFilterMode] = useState<FilterMode>("all");
	const navigate = useNavigate();
	const utils = trpc.useUtils();

	// Fetch all data
	const { data: groups = [] } = trpc.workspaces.getAllGrouped.useQuery();
	const { data: allProjects = [] } = trpc.projects.getRecents.useQuery();

	// Fetch worktrees for all projects
	const worktreeQueries = trpc.useQueries((t) =>
		allProjects.map((project) =>
			t.workspaces.getWorktreesByProject({ projectId: project.id }),
		),
	);

	const openWorktree = trpc.workspaces.openWorktree.useMutation({
		onSuccess: (data) => {
			utils.workspaces.getAllGrouped.invalidate();
			// Navigate to the newly opened workspace
			if (data.workspace?.id) {
				navigateToWorkspace(data.workspace.id, navigate);
			}
		},
		onError: (error) => {
			toast.error(`Failed to open workspace: ${error.message}`);
		},
	});

	// Combine open workspaces and closed worktrees into a single list
	const allItems = useMemo<WorkspaceItem[]>(() => {
		const items: WorkspaceItem[] = [];

		// First, add all open workspaces from groups
		for (const group of groups) {
			for (const ws of group.workspaces) {
				items.push({
					uniqueId: ws.id,
					workspaceId: ws.id,
					worktreeId: null,
					projectId: ws.projectId,
					projectName: group.project.name,
					worktreePath: ws.worktreePath,
					type: ws.type,
					branch: ws.branch,
					name: ws.name,
					lastOpenedAt: ws.lastOpenedAt,
					createdAt: ws.createdAt,
					isUnread: ws.isUnread,
					isOpen: true,
				});
			}
		}

		// Add closed worktrees (those without active workspaces)
		for (let i = 0; i < allProjects.length; i++) {
			const project = allProjects[i];
			const worktrees = worktreeQueries[i]?.data;

			if (!worktrees) continue;

			for (const wt of worktrees) {
				// Skip if this worktree has an active workspace
				if (wt.hasActiveWorkspace) continue;

				items.push({
					uniqueId: `wt-${wt.id}`,
					workspaceId: null,
					worktreeId: wt.id,
					projectId: project.id,
					projectName: project.name,
					worktreePath: wt.path,
					type: "worktree",
					branch: wt.branch,
					name: wt.branch,
					lastOpenedAt: wt.createdAt,
					createdAt: wt.createdAt,
					isUnread: false,
					isOpen: false,
				});
			}
		}

		return items;
	}, [groups, allProjects, worktreeQueries]);

	// Filter by search query and filter mode
	const filteredItems = useMemo(() => {
		let items = allItems;

		// Apply filter mode
		if (filterMode === "active") {
			items = items.filter((ws) => ws.isOpen);
		} else if (filterMode === "closed") {
			items = items.filter((ws) => !ws.isOpen);
		}

		// Apply search filter
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			items = items.filter(
				(ws) =>
					ws.name.toLowerCase().includes(query) ||
					ws.projectName.toLowerCase().includes(query) ||
					ws.branch.toLowerCase().includes(query),
			);
		}

		return items;
	}, [allItems, searchQuery, filterMode]);

	// Group by project
	const projectGroups = useMemo<ProjectGroup[]>(() => {
		const groupsMap = new Map<string, ProjectGroup>();

		for (const item of filteredItems) {
			if (!groupsMap.has(item.projectId)) {
				groupsMap.set(item.projectId, {
					projectId: item.projectId,
					projectName: item.projectName,
					workspaces: [],
				});
			}
			groupsMap.get(item.projectId)?.workspaces.push(item);
		}

		// Sort workspaces within each group: active first, then by lastOpenedAt
		for (const group of groupsMap.values()) {
			group.workspaces.sort((a, b) => {
				// Active workspaces first
				if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
				// Then by most recently opened/created
				return b.lastOpenedAt - a.lastOpenedAt;
			});
		}

		// Sort groups by most recent activity
		return Array.from(groupsMap.values()).sort((a, b) => {
			const aRecent = Math.max(...a.workspaces.map((w) => w.lastOpenedAt));
			const bRecent = Math.max(...b.workspaces.map((w) => w.lastOpenedAt));
			return bRecent - aRecent;
		});
	}, [filteredItems]);

	const handleSwitch = (item: WorkspaceItem) => {
		if (item.workspaceId) {
			navigateToWorkspace(item.workspaceId, navigate);
		}
	};

	const handleReopen = (item: WorkspaceItem) => {
		if (item.worktreeId) {
			openWorktree.mutate({ worktreeId: item.worktreeId });
		}
	};

	// Count stats for filter badges
	const activeCount = allItems.filter((w) => w.isOpen).length;
	const closedCount = allItems.filter((w) => !w.isOpen).length;

	return (
		<div className="flex-1 flex flex-col bg-card overflow-hidden">
			{/* Header */}
			<div className="flex items-center gap-3 px-4 py-2 border-b border-border/50">
				{/* Filter toggle */}
				<div className="flex items-center gap-1 bg-background/50 rounded-md p-0.5">
					{FILTER_OPTIONS.map((option) => {
						const count =
							option.value === "all"
								? allItems.length
								: option.value === "active"
									? activeCount
									: closedCount;
						return (
							<button
								key={option.value}
								type="button"
								onClick={() => setFilterMode(option.value)}
								className={cn(
									"px-2 py-1 text-xs rounded-md transition-colors",
									filterMode === option.value
										? "bg-accent text-foreground"
										: "text-foreground/60 hover:text-foreground",
								)}
							>
								{option.label}
								<span className="ml-1 text-foreground/40">{count}</span>
							</button>
						);
					})}
				</div>

				{/* Search */}
				<div className="relative flex-1">
					<LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/50" />
					<Input
						type="text"
						placeholder="Search..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="pl-9 h-8 bg-background/50"
					/>
				</div>

				{/* Close button */}
				<Button
					variant="ghost"
					size="icon"
					onClick={() => navigate({ to: "/workspace" })}
					className="size-7 text-foreground/60 hover:text-foreground shrink-0"
				>
					<LuX className="size-4" />
				</Button>
			</div>

			{/* Workspaces list grouped by project */}
			<div className="flex-1 overflow-y-auto">
				{projectGroups.map((group) => (
					<div key={group.projectId}>
						{/* Project header */}
						<div className="sticky top-0 bg-card/95 backdrop-blur-sm px-4 py-2 border-b border-border/50">
							<span className="text-xs font-medium text-foreground/70">
								{group.projectName}
							</span>
							<span className="text-xs text-foreground/40 ml-2">
								{group.workspaces.length}
							</span>
						</div>

						{/* Workspaces in this project */}
						{group.workspaces.map((ws) => (
							<WorkspaceRow
								key={ws.uniqueId}
								workspace={ws}
								onSwitch={() => handleSwitch(ws)}
								onReopen={() => handleReopen(ws)}
								isOpening={
									openWorktree.isPending &&
									openWorktree.variables?.worktreeId === ws.worktreeId
								}
							/>
						))}
					</div>
				))}

				{filteredItems.length === 0 && (
					<div className="flex items-center justify-center h-32 text-foreground/50 text-sm">
						{searchQuery
							? "No workspaces match your search"
							: filterMode === "active"
								? "No active workspaces"
								: filterMode === "closed"
									? "No closed workspaces"
									: "No workspaces yet"}
					</div>
				)}
			</div>
		</div>
	);
}
