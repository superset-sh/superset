import { cn } from "@superset/ui/lib/utils";
import { HiOutlineChevronDown, HiOutlineChevronRight } from "react-icons/hi2";
import type { SortOption, WorkspaceMetrics } from "../../types";
import { formatCpu, formatMemory } from "../../utils/formatters";
import { getUsageSeverity } from "../../utils/resourceSeverity";
import { UsageSeverityBadge } from "../UsageSeverityBadge";

const METRIC_COLS = "flex items-center shrink-0 tabular-nums tracking-tight";
const CPU_COL = "w-12 text-right";
const MEM_COL = "w-16 text-right";

interface ProjectResourceGroup {
	projectId: string;
	projectName: string;
	cpu: number;
	memory: number;
	workspaces: WorkspaceMetrics[];
}

interface WorkspaceResourceSectionProps {
	workspaces: WorkspaceMetrics[];
	sortOption: SortOption;
	sidebarProjectOrder: string[];
	sidebarWorkspaceOrder: string[];
	collapsedProjects: Set<string>;
	toggleProject: (projectId: string) => void;
	collapsedWorkspaces: Set<string>;
	toggleWorkspace: (workspaceId: string) => void;
	navigateToWorkspace: (workspaceId: string) => void;
	navigateToPane: (workspaceId: string, paneId: string) => void;
	getPaneName: (session: WorkspaceMetrics["sessions"][number]) => string;
}

function groupWorkspacesByProject(
	workspaces: WorkspaceMetrics[],
): ProjectResourceGroup[] {
	const projectMap = new Map<string, ProjectResourceGroup>();

	for (const workspace of workspaces) {
		const projectId = workspace.projectId || "unknown";
		const projectName = workspace.projectName || "Unknown Project";
		let group = projectMap.get(projectId);
		if (!group) {
			group = {
				projectId,
				projectName,
				cpu: 0,
				memory: 0,
				workspaces: [],
			};
			projectMap.set(projectId, group);
		}

		group.cpu += workspace.cpu;
		group.memory += workspace.memory;
		group.workspaces.push(workspace);
	}

	return [...projectMap.values()];
}

function sortWorkspaces(
	workspaces: WorkspaceMetrics[],
	sortOption: SortOption,
	sidebarWorkspaceOrder: string[],
): WorkspaceMetrics[] {
	const sorted = [...workspaces];
	switch (sortOption) {
		case "memory":
			sorted.sort((a, b) => b.memory - a.memory);
			break;
		case "cpu":
			sorted.sort((a, b) => b.cpu - a.cpu);
			break;
		case "name":
			sorted.sort((a, b) => a.workspaceName.localeCompare(b.workspaceName));
			break;
		case "sidebar": {
			const orderMap = new Map(
				sidebarWorkspaceOrder.map((id, index) => [id, index]),
			);
			sorted.sort(
				(a, b) =>
					(orderMap.get(a.workspaceId) ?? Number.MAX_SAFE_INTEGER) -
					(orderMap.get(b.workspaceId) ?? Number.MAX_SAFE_INTEGER),
			);
			break;
		}
	}
	return sorted;
}

function sortProjectGroups(
	groups: ProjectResourceGroup[],
	sortOption: SortOption,
	sidebarProjectOrder: string[],
): ProjectResourceGroup[] {
	const sorted = [...groups];
	switch (sortOption) {
		case "memory":
			sorted.sort((a, b) => b.memory - a.memory);
			break;
		case "cpu":
			sorted.sort((a, b) => b.cpu - a.cpu);
			break;
		case "name":
			sorted.sort((a, b) => a.projectName.localeCompare(b.projectName));
			break;
		case "sidebar": {
			const orderMap = new Map(
				sidebarProjectOrder.map((id, index) => [id, index]),
			);
			sorted.sort(
				(a, b) =>
					(orderMap.get(a.projectId) ?? Number.MAX_SAFE_INTEGER) -
					(orderMap.get(b.projectId) ?? Number.MAX_SAFE_INTEGER),
			);
			break;
		}
	}
	return sorted;
}

function getProjectTotals(projects: ProjectResourceGroup[]) {
	return projects.reduce(
		(acc, project) => ({
			cpu: acc.cpu + project.cpu,
			memory: acc.memory + project.memory,
		}),
		{ cpu: 0, memory: 0 },
	);
}

export function WorkspaceResourceSection({
	workspaces,
	sortOption,
	sidebarProjectOrder,
	sidebarWorkspaceOrder,
	collapsedProjects,
	toggleProject,
	collapsedWorkspaces,
	toggleWorkspace,
	navigateToWorkspace,
	navigateToPane,
	getPaneName,
}: WorkspaceResourceSectionProps) {
	const rawProjectGroups = groupWorkspacesByProject(workspaces);
	const sortedProjectGroups = sortProjectGroups(
		rawProjectGroups,
		sortOption,
		sidebarProjectOrder,
	);
	const projectGroups = sortedProjectGroups.map((group) => ({
		...group,
		workspaces: sortWorkspaces(
			group.workspaces,
			sortOption,
			sidebarWorkspaceOrder,
		),
	}));
	const projectTotals = getProjectTotals(projectGroups);

	return projectGroups.map((project, projectIndex) => {
		const isProjectCollapsed = collapsedProjects.has(project.projectId);
		const projectSeverity = getUsageSeverity(project, projectTotals);

		return (
			<div
				key={project.projectId}
				className={cn("py-1", projectIndex > 0 && "border-t border-border/40")}
			>
				<button
					type="button"
					onClick={() => toggleProject(project.projectId)}
					className="group w-full flex items-center justify-between px-2 py-1.5 hover:bg-foreground/[0.04] transition-colors"
					aria-label={
						isProjectCollapsed ? "Expand project" : "Collapse project"
					}
				>
					<div className="flex items-center gap-1 min-w-0 mr-2">
						<span className="flex items-center justify-center h-4 w-4 shrink-0 text-muted-foreground/70 group-hover:text-muted-foreground transition-colors">
							{isProjectCollapsed ? (
								<HiOutlineChevronRight className="h-3 w-3" />
							) : (
								<HiOutlineChevronDown className="h-3 w-3" />
							)}
						</span>
						<span className="text-[11px] font-semibold uppercase tracking-[0.04em] truncate min-w-0 text-muted-foreground">
							{project.projectName}
						</span>
						<UsageSeverityBadge severity={projectSeverity} />
					</div>
					<div className={cn(METRIC_COLS, "text-[12px] text-foreground/90")}>
						<span className={CPU_COL}>{formatCpu(project.cpu)}</span>
						<span className={MEM_COL}>{formatMemory(project.memory)}</span>
					</div>
				</button>

				{!isProjectCollapsed &&
					project.workspaces.map((workspace) => {
						const isCollapsed = collapsedWorkspaces.has(workspace.workspaceId);
						const workspaceSeverity = getUsageSeverity(workspace, project);
						const hasSessions = workspace.sessions.length > 0;

						return (
							<div key={workspace.workspaceId}>
								<div className="group flex items-center hover:bg-foreground/[0.04] transition-colors">
									{hasSessions ? (
										<button
											type="button"
											onClick={() => toggleWorkspace(workspace.workspaceId)}
											className="flex items-center justify-center h-7 w-5 ml-3.5 shrink-0 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
											aria-label={
												isCollapsed ? "Expand workspace" : "Collapse workspace"
											}
										>
											{isCollapsed ? (
												<HiOutlineChevronRight className="h-3 w-3" />
											) : (
												<HiOutlineChevronDown className="h-3 w-3" />
											)}
										</button>
									) : (
										<span className="h-7 w-5 ml-3.5 shrink-0" />
									)}
									<button
										type="button"
										onClick={() => navigateToWorkspace(workspace.workspaceId)}
										className="flex-1 min-w-0 flex items-center justify-between py-1.5 pr-3.5 pl-1 text-left"
									>
										<div className="flex items-center gap-1.5 min-w-0 mr-2">
											<span className="text-[12px] text-foreground truncate min-w-0">
												{workspace.workspaceName}
											</span>
											<UsageSeverityBadge severity={workspaceSeverity} />
										</div>
										<div
											className={cn(
												METRIC_COLS,
												"text-[12px] text-foreground/85",
											)}
										>
											<span className={CPU_COL}>
												{formatCpu(workspace.cpu)}
											</span>
											<span className={MEM_COL}>
												{formatMemory(workspace.memory)}
											</span>
										</div>
									</button>
								</div>

								{!isCollapsed &&
									workspace.sessions.map((session) => {
										const sessionSeverity = getUsageSeverity(
											session,
											workspace,
										);

										return (
											<button
												type="button"
												key={session.sessionId}
												onClick={() =>
													navigateToPane(workspace.workspaceId, session.paneId)
												}
												className="w-full flex items-center justify-between pl-12 pr-3.5 py-1 hover:bg-foreground/[0.04] transition-colors text-left"
											>
												<div className="flex items-center gap-1.5 min-w-0 mr-2">
													<span className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
													<span className="text-[11px] text-muted-foreground truncate min-w-0">
														{getPaneName(session)}
													</span>
													<UsageSeverityBadge severity={sessionSeverity} />
												</div>
												<div
													className={cn(
														METRIC_COLS,
														"text-[11px] text-muted-foreground/80",
													)}
												>
													<span className={CPU_COL}>
														{formatCpu(session.cpu)}
													</span>
													<span className={MEM_COL}>
														{formatMemory(session.memory)}
													</span>
												</div>
											</button>
										);
									})}
							</div>
						);
					})}
			</div>
		);
	});
}
