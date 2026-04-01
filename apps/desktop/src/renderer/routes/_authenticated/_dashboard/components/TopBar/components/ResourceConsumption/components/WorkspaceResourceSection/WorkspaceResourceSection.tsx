import { cn } from "@superset/ui/lib/utils";
import { HiOutlineChevronDown, HiOutlineChevronRight } from "react-icons/hi2";
import type { SortOption, WorkspaceMetrics } from "../../types";
import { formatCpu, formatMemory } from "../../utils/formatters";
import {
	getUsageClasses,
	getUsageSeverity,
} from "../../utils/resourceSeverity";
import { UsageSeverityBadge } from "../UsageSeverityBadge";

const METRIC_COLS = "flex items-center shrink-0 tabular-nums";
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
	getPaneName: (paneId: string) => string;
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

	return projectGroups.map((project) => {
		const isProjectCollapsed = collapsedProjects.has(project.projectId);
		const projectSeverity = getUsageSeverity(project, projectTotals);
		const projectClasses = getUsageClasses(projectSeverity);

		return (
			<div
				key={project.projectId}
				className="border-b border-border/50 last:border-b-0"
			>
				<div className={cn("flex items-center", projectClasses.rowClass)}>
					<button
						type="button"
						onClick={() => toggleProject(project.projectId)}
						className={cn(
							"pl-2 py-2 pr-0.5 transition-colors",
							projectClasses.hoverClass,
						)}
						aria-label={
							isProjectCollapsed ? "Expand project" : "Collapse project"
						}
					>
						{isProjectCollapsed ? (
							<HiOutlineChevronRight className="h-3 w-3 text-muted-foreground" />
						) : (
							<HiOutlineChevronDown className="h-3 w-3 text-muted-foreground" />
						)}
					</button>
					<div className="flex-1 min-w-0 py-2 pr-3 flex items-center justify-between">
						<div className="flex items-center gap-1.5 min-w-0 mr-2">
							<span
								className={cn(
									"text-[11px] font-semibold uppercase tracking-wide truncate min-w-0",
									projectClasses.labelClass || "text-muted-foreground",
								)}
							>
								{project.projectName}
							</span>
							<UsageSeverityBadge severity={projectSeverity} />
						</div>
						<div
							className={cn(METRIC_COLS, "text-xs", projectClasses.metricClass)}
						>
							<span className={CPU_COL}>{formatCpu(project.cpu)}</span>
							<span className={MEM_COL}>{formatMemory(project.memory)}</span>
						</div>
					</div>
				</div>

				{!isProjectCollapsed && (
					<div className="border-t border-border/30">
						{project.workspaces.map((workspace) => {
							const isCollapsed = collapsedWorkspaces.has(
								workspace.workspaceId,
							);
							const workspaceSeverity = getUsageSeverity(workspace, project);
							const workspaceClasses = getUsageClasses(workspaceSeverity, true);

							return (
								<div
									key={workspace.workspaceId}
									className="border-b border-border/20 last:border-b-0"
								>
									<div
										className={cn(
											"flex items-center ml-2",
											workspaceClasses.rowClass,
										)}
									>
										{workspace.sessions.length > 0 && (
											<button
												type="button"
												onClick={() => toggleWorkspace(workspace.workspaceId)}
												className={cn(
													"pl-2 py-2 pr-0.5 transition-colors",
													workspaceClasses.hoverClass,
												)}
												aria-label={
													isCollapsed
														? "Expand workspace"
														: "Collapse workspace"
												}
											>
												{isCollapsed ? (
													<HiOutlineChevronRight className="h-3 w-3 text-muted-foreground" />
												) : (
													<HiOutlineChevronDown className="h-3 w-3 text-muted-foreground" />
												)}
											</button>
										)}
										<button
											type="button"
											onClick={() => navigateToWorkspace(workspace.workspaceId)}
											className={cn(
												"flex-1 min-w-0 py-2 pr-3 flex items-center justify-between transition-colors",
												workspace.sessions.length > 0 ? "pl-1" : "pl-3",
												workspaceClasses.hoverClass,
											)}
										>
											<div className="flex items-center gap-1.5 min-w-0 mr-2">
												<span
													className={cn(
														"text-xs font-medium truncate min-w-0",
														workspaceClasses.labelClass,
													)}
												>
													{workspace.workspaceName}
												</span>
												<UsageSeverityBadge severity={workspaceSeverity} />
											</div>
											<div
												className={cn(
													METRIC_COLS,
													"text-xs",
													workspaceClasses.metricClass,
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
											const sessionClasses = getUsageClasses(
												sessionSeverity,
												true,
											);

											return (
												<button
													type="button"
													key={session.sessionId}
													onClick={() =>
														navigateToPane(
															workspace.workspaceId,
															session.paneId,
														)
													}
													className={cn(
														"w-full px-3 py-1.5 pl-10 flex items-center justify-between transition-colors",
														sessionClasses.rowClass,
														sessionClasses.hoverClass,
													)}
												>
													<span
														className={cn(
															"text-[11px] text-muted-foreground truncate min-w-0 mr-2",
															sessionClasses.labelClass,
														)}
													>
														{getPaneName(session.paneId)}
													</span>
													<div
														className={cn(
															METRIC_COLS,
															"text-[11px]",
															sessionClasses.metricClass,
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
				)}
			</div>
		);
	});
}
