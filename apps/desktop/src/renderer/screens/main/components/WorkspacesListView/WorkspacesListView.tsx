import { Badge } from "@superset/ui/badge";
import { Input } from "@superset/ui/input";
import { cn } from "@superset/ui/utils";
import { useMemo, useState } from "react";
import { LuArrowRight, LuGitBranch, LuGitFork, LuSearch } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import { useSetActiveWorkspace } from "renderer/react-query/workspaces";
import { useCloseWorkspacesList } from "renderer/stores/app-state";

const GITHUB_STATUS_STALE_TIME = 5 * 60 * 1000; // 5 minutes

interface WorkspaceItem {
	// Unique identifier - either workspace id or worktree id for closed ones
	uniqueId: string;
	// If open, this is the workspace id
	workspaceId: string | null;
	// For closed worktrees, this is the worktree id
	worktreeId: string | null;
	projectId: string;
	projectName: string;
	projectColor: string;
	worktreePath: string;
	type: "worktree" | "branch";
	branch: string;
	name: string;
	lastOpenedAt: number;
	createdAt: number;
	isUnread: boolean;
	isOpen: boolean;
}

interface TimeGroup {
	label: string;
	count: number;
	workspaces: WorkspaceItem[];
}

function getTimeGroupLabel(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const days = Math.floor(diff / (1000 * 60 * 60 * 24));

	if (days === 0) return "Today";
	if (days === 1) return "Yesterday";
	if (days < 7) return `${days} days ago`;
	if (days < 14) return "1 week ago";
	if (days < 21) return "2 weeks ago";
	if (days < 28) return "3 weeks ago";
	if (days < 60) return "1 month ago";
	if (days < 90) return "2 months ago";
	if (days < 180) return "3 months ago";
	if (days < 365) return "6 months ago";
	return "Over a year ago";
}

function getTimeSortKey(timestamp: number): number {
	const now = Date.now();
	const diff = now - timestamp;
	const days = Math.floor(diff / (1000 * 60 * 60 * 24));

	if (days === 0) return 0;
	if (days === 1) return 1;
	if (days < 7) return days;
	if (days < 14) return 7;
	if (days < 21) return 14;
	if (days < 28) return 21;
	if (days < 60) return 30;
	if (days < 90) return 60;
	if (days < 180) return 90;
	if (days < 365) return 180;
	return 365;
}

function formatDate(timestamp: number): string {
	const date = new Date(timestamp);
	return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function WorkspacesListView() {
	const [searchQuery, setSearchQuery] = useState("");
	const utils = trpc.useUtils();

	// Fetch all data
	const { data: groups = [] } = trpc.workspaces.getAllGrouped.useQuery();
	const { data: allProjects = [] } = trpc.projects.getRecents.useQuery();
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();

	// Fetch worktrees for all projects
	const worktreeQueries = trpc.useQueries((t) =>
		allProjects.map((project) =>
			t.workspaces.getWorktreesByProject({ projectId: project.id }),
		),
	);

	const setActiveWorkspace = useSetActiveWorkspace();
	const openWorktree = trpc.workspaces.openWorktree.useMutation({
		onSuccess: () => {
			utils.workspaces.getAllGrouped.invalidate();
			utils.workspaces.getActive.invalidate();
			closeWorkspacesList();
		},
	});
	const closeWorkspacesList = useCloseWorkspacesList();

	// Combine open workspaces and closed worktrees into a single list
	const allItems = useMemo<WorkspaceItem[]>(() => {
		const items: WorkspaceItem[] = [];
		const seenWorktreeIds = new Set<string>();

		// First, add all open workspaces from groups
		for (const group of groups) {
			for (const ws of group.workspaces) {
				items.push({
					uniqueId: ws.id,
					workspaceId: ws.id,
					worktreeId: null,
					projectId: ws.projectId,
					projectName: group.project.name,
					projectColor: group.project.color,
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

		// Track which worktrees are already open
		for (const query of worktreeQueries) {
			if (query.data) {
				for (const wt of query.data) {
					if (wt.hasActiveWorkspace) {
						seenWorktreeIds.add(wt.id);
					}
				}
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
					projectColor: project.color,
					worktreePath: wt.path,
					type: "worktree",
					branch: wt.branch,
					name: wt.branch, // Use branch name for closed worktrees
					lastOpenedAt: wt.createdAt, // Use createdAt for closed worktrees
					createdAt: wt.createdAt,
					isUnread: false,
					isOpen: false,
				});
			}
		}

		return items;
	}, [groups, allProjects, worktreeQueries]);

	// Filter workspaces by search query
	const filteredWorkspaces = useMemo(() => {
		if (!searchQuery.trim()) return allItems;
		const query = searchQuery.toLowerCase();
		return allItems.filter(
			(ws) =>
				ws.name.toLowerCase().includes(query) ||
				ws.projectName.toLowerCase().includes(query) ||
				ws.branch.toLowerCase().includes(query),
		);
	}, [allItems, searchQuery]);

	// Group workspaces by time period
	const timeGroups = useMemo<TimeGroup[]>(() => {
		const groupsMap = new Map<string, WorkspaceItem[]>();

		for (const ws of filteredWorkspaces) {
			const label = getTimeGroupLabel(ws.lastOpenedAt);
			if (!groupsMap.has(label)) {
				groupsMap.set(label, []);
			}
			groupsMap.get(label)?.push(ws);
		}

		// Sort groups by time (most recent first)
		const sortedGroups = Array.from(groupsMap.entries())
			.map(([label, workspaces]) => ({
				label,
				count: workspaces.length,
				workspaces: workspaces.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt),
			}))
			.sort((a, b) => {
				const aTime = a.workspaces[0]?.lastOpenedAt ?? 0;
				const bTime = b.workspaces[0]?.lastOpenedAt ?? 0;
				// Lower sort key = more recent, so ascending order puts recent first
				return getTimeSortKey(aTime) - getTimeSortKey(bTime);
			});

		return sortedGroups;
	}, [filteredWorkspaces]);

	const handleItemClick = (item: WorkspaceItem) => {
		if (item.isOpen && item.workspaceId) {
			// Open workspace - just switch to it
			setActiveWorkspace.mutate({ id: item.workspaceId });
			closeWorkspacesList();
		} else if (!item.isOpen && item.worktreeId) {
			// Closed worktree - open it
			openWorktree.mutate({ worktreeId: item.worktreeId });
		}
	};

	return (
		<div className="flex-1 flex flex-col bg-background overflow-hidden">
			{/* Search header */}
			<div className="p-4 border-b border-border">
				<div className="relative">
					<LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
					<Input
						type="text"
						placeholder="Filter workspaces..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="pl-9"
					/>
				</div>
			</div>

			{/* Workspaces list */}
			<div className="flex-1 overflow-y-auto">
				{timeGroups.map((group) => (
					<div key={group.label}>
						{/* Time group header */}
						<div className="sticky top-0 bg-background/95 backdrop-blur-sm px-4 py-2 border-b border-border">
							<span className="text-xs font-medium text-muted-foreground">
								{group.label}
							</span>
							<span className="text-xs text-muted-foreground/60 ml-2">
								{group.count}
							</span>
						</div>

						{/* Workspaces in this group */}
						{group.workspaces.map((ws) => (
							<WorkspaceRow
								key={ws.uniqueId}
								workspace={ws}
								isActive={activeWorkspace?.id === ws.workspaceId}
								onClick={() => handleItemClick(ws)}
								isOpening={
									openWorktree.isPending &&
									openWorktree.variables?.worktreeId === ws.worktreeId
								}
							/>
						))}
					</div>
				))}

				{filteredWorkspaces.length === 0 && (
					<div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
						{searchQuery
							? "No workspaces match your search"
							: "No workspaces yet"}
					</div>
				)}
			</div>
		</div>
	);
}

interface WorkspaceRowProps {
	workspace: WorkspaceItem;
	isActive: boolean;
	onClick: () => void;
	isOpening?: boolean;
}

function WorkspaceRow({
	workspace,
	isActive,
	onClick,
	isOpening,
}: WorkspaceRowProps) {
	const isBranch = workspace.type === "branch";
	const [hasHovered, setHasHovered] = useState(false);

	// Lazy-load GitHub status on hover to avoid N+1 queries
	const { data: githubStatus } = trpc.workspaces.getGitHubStatus.useQuery(
		{ workspaceId: workspace.workspaceId ?? "" },
		{
			enabled:
				hasHovered && workspace.type === "worktree" && !!workspace.workspaceId,
			staleTime: GITHUB_STATUS_STALE_TIME,
		},
	);

	const pr = githubStatus?.pr;
	const showDiffStats = pr && (pr.additions > 0 || pr.deletions > 0);

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={isOpening}
			onMouseEnter={() => !hasHovered && setHasHovered(true)}
			className={cn(
				"flex items-center gap-3 w-full px-4 py-2.5 text-left",
				"hover:bg-muted/50 transition-colors group",
				isActive && "bg-muted",
				!workspace.isOpen && "opacity-60",
				isOpening && "opacity-50 cursor-wait",
			)}
		>
			{/* Status indicator */}
			<div className="relative shrink-0">
				{/* Icon */}
				<div
					className={cn(
						"flex items-center justify-center size-6 rounded",
						isBranch ? "bg-primary/10" : "bg-muted",
					)}
				>
					{isBranch ? (
						<LuGitBranch className="size-3.5 text-primary" />
					) : (
						<LuGitFork className="size-3.5 text-muted-foreground" />
					)}
				</div>
				{/* Open/Closed indicator dot */}
				<div
					className={cn(
						"absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background",
						workspace.isOpen ? "bg-emerald-500" : "bg-muted-foreground/40",
					)}
				/>
			</div>

			{/* Project name */}
			<span className="text-sm text-muted-foreground shrink-0">
				{workspace.projectName}
			</span>

			{/* Chevron separator */}
			<span className="text-muted-foreground/50 shrink-0">{">"}</span>

			{/* Workspace/branch name */}
			<span
				className={cn(
					"text-sm flex-1 truncate",
					isActive ? "text-foreground font-medium" : "text-muted-foreground",
				)}
			>
				{workspace.name}
			</span>

			{/* Closed badge */}
			{!workspace.isOpen && (
				<Badge
					variant="secondary"
					className="text-[10px] px-1.5 py-0 h-4 shrink-0"
				>
					Closed
				</Badge>
			)}

			{/* Diff stats */}
			{showDiffStats && (
				<div className="flex items-center gap-1 text-[10px] font-mono shrink-0">
					<span className="text-emerald-500">+{pr.additions}</span>
					<span className="text-destructive-foreground">-{pr.deletions}</span>
				</div>
			)}

			{/* Unread indicator */}
			{workspace.isUnread && (
				<span className="relative flex size-2 shrink-0">
					<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
					<span className="relative inline-flex size-2 rounded-full bg-red-500" />
				</span>
			)}

			{/* Date */}
			<span className="text-xs text-muted-foreground/60 shrink-0">
				{formatDate(workspace.lastOpenedAt)}
			</span>

			{/* Action button - visible on hover */}
			<div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-muted-foreground shrink-0">
				{isOpening ? (
					<span>Opening...</span>
				) : workspace.isOpen ? (
					<>
						<span>Go to</span>
						<LuArrowRight className="size-3" />
					</>
				) : (
					<>
						<span>Open</span>
						<LuArrowRight className="size-3" />
					</>
				)}
			</div>
		</button>
	);
}
