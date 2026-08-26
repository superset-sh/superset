import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import {
	HiOutlineBarsArrowDown,
	HiOutlineChevronDown,
	HiOutlineChevronRight,
} from "react-icons/hi2";
import { LuRefreshCw } from "react-icons/lu";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { UsageSeverityBadge } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/ResourceConsumption/components/UsageSeverityBadge";
import { useResourceNavigation } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/ResourceConsumption/hooks/useResourceNavigation";
import { useResourceSnapshot } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/ResourceConsumption/hooks/useResourceSnapshot";
import type {
	ResourceMetricsSnapshot,
	SortOption,
} from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/ResourceConsumption/types";
import {
	formatCpu,
	formatMemory,
	formatPercent,
} from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/ResourceConsumption/utils/formatters";
import {
	getTrackedHostMemorySeverity,
	getUsageSeverity,
} from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/ResourceConsumption/utils/resourceSeverity";
import {
	groupWorkspacesByProject,
	sortProjectGroups,
	sortWorkspaces,
} from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/ResourceConsumption/utils/workspaceGrouping";
import { ResourceSparkline } from "./components/ResourceSparkline";
import { useResourceSampleBuffer } from "./hooks/useResourceSampleBuffer";

const SORT_LABELS: Record<SortOption, string> = {
	memory: "Memory",
	cpu: "CPU",
	name: "Name",
	sidebar: "Sidebar order",
};

const CPU_COL = "w-20 shrink-0 text-right tabular-nums tracking-tight";
const MEM_COL = "w-24 shrink-0 text-right tabular-nums tracking-tight";
const BAR_COL = "hidden w-32 shrink-0 md:block";

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex min-w-0 flex-col">
			<span className="truncate text-[10px] text-muted-foreground">
				{label}
			</span>
			<span className="text-sm font-medium tabular-nums">{value}</span>
		</div>
	);
}

/** Horizontal bar showing `value` as a share of the tracked total. */
function MemoryShareBar({ value, max }: { value: number; max: number }) {
	const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
	return (
		<div className="h-1 w-full overflow-hidden rounded-full bg-muted">
			<div
				className="h-full rounded-full bg-foreground/40 transition-[width] duration-300"
				style={{ width: `${value > 0 ? Math.max(percent, 2) : 0}%` }}
			/>
		</div>
	);
}

function MetricCells({
	cpu,
	memory,
	trackedMemory,
	muted,
}: {
	cpu: number;
	memory: number;
	trackedMemory: number;
	muted?: boolean;
}) {
	return (
		<>
			<span
				className={cn(
					CPU_COL,
					muted ? "text-xs text-muted-foreground/80" : "text-[13px]",
				)}
			>
				{formatCpu(cpu)}
			</span>
			<span
				className={cn(
					MEM_COL,
					muted ? "text-xs text-muted-foreground/80" : "text-[13px]",
				)}
			>
				{formatMemory(memory)}
			</span>
			<span className={BAR_COL}>
				<MemoryShareBar value={memory} max={trackedMemory} />
			</span>
		</>
	);
}

function MemoryLegendItem({
	colorClass,
	label,
	value,
}: {
	colorClass: string;
	label: string;
	value: string;
}) {
	return (
		<span className="flex items-center gap-1.5">
			<span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", colorClass)} />
			<span>{label}</span>
			<span className="tabular-nums text-foreground/80">{value}</span>
		</span>
	);
}

function SystemOverview({ snapshot }: { snapshot: ResourceMetricsSnapshot }) {
	const { host } = snapshot;
	const trackedSharePercent =
		host.totalMemory > 0 ? (snapshot.totalMemory / host.totalMemory) * 100 : 0;
	const shareSeverity = getTrackedHostMemorySeverity(trackedSharePercent);
	const trackedBarColorClass =
		shareSeverity === "high"
			? "bg-red-500/80"
			: shareSeverity === "elevated"
				? "bg-amber-500/80"
				: "bg-foreground/60";

	// Composition of physical RAM: Superset's tracked processes, everything
	// else on the machine, and free — segments of one bar (hosting-dashboard
	// disk-bar pattern) instead of a lone share fill.
	const otherUsedMemory = Math.max(0, host.usedMemory - snapshot.totalMemory);
	const freeMemory = Math.max(0, host.totalMemory - host.usedMemory);
	const percentOfTotal = (value: number) =>
		host.totalMemory > 0
			? Math.min(100, Math.max(0, (value / host.totalMemory) * 100))
			: 0;

	return (
		<div className="flex flex-col gap-2">
			<div className="grid grid-cols-3 gap-x-4 gap-y-1 border-y py-2 md:grid-cols-6">
				<Stat label="Superset CPU" value={formatCpu(snapshot.totalCpu)} />
				<Stat
					label="Superset memory"
					value={formatMemory(snapshot.totalMemory)}
				/>
				<Stat
					label="System RAM share"
					value={formatPercent(trackedSharePercent)}
				/>
				<Stat
					label="System memory"
					value={`${formatMemory(host.usedMemory)} · ${formatPercent(host.memoryUsagePercent)}`}
				/>
				<Stat label="CPU cores" value={String(host.cpuCoreCount)} />
				<Stat label="Load (1 m)" value={host.loadAverage1m.toFixed(2)} />
			</div>
			<div
				role="img"
				className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-muted/60"
				aria-label={`System RAM: Superset ${formatMemory(snapshot.totalMemory)}, other apps ${formatMemory(otherUsedMemory)}, free ${formatMemory(freeMemory)}`}
			>
				<div
					className={cn(
						"h-full transition-[width] duration-300",
						trackedBarColorClass,
					)}
					style={{ width: `${percentOfTotal(snapshot.totalMemory)}%` }}
				/>
				<div
					className="h-full bg-muted-foreground/40 transition-[width] duration-300"
					style={{ width: `${percentOfTotal(otherUsedMemory)}%` }}
				/>
			</div>
			<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
				<MemoryLegendItem
					colorClass={trackedBarColorClass}
					label="Superset"
					value={formatMemory(snapshot.totalMemory)}
				/>
				<MemoryLegendItem
					colorClass="bg-muted-foreground/40"
					label="Other apps"
					value={formatMemory(otherUsedMemory)}
				/>
				<MemoryLegendItem
					colorClass="bg-muted/60"
					label="Free"
					value={formatMemory(freeMemory)}
				/>
			</div>
		</div>
	);
}

function toggleSetMember(previous: Set<string>, member: string): Set<string> {
	const next = new Set(previous);
	if (next.has(member)) {
		next.delete(member);
	} else {
		next.add(member);
	}
	return next;
}

export function UsageResourcesPage() {
	const isV2 = useIsV2CloudEnabled();
	const surface = isV2 ? "v2" : "v1";
	const [sortOption, setSortOption] = useState<SortOption>("memory");
	const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(
		new Set(),
	);
	const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<Set<string>>(
		new Set(),
	);

	const {
		snapshot,
		refetch,
		isFetching,
		sidebarProjectOrder,
		sidebarWorkspaceOrder,
	} = useResourceSnapshot(surface);

	const { getPaneName, navigateToWorkspace, navigateToPane } =
		useResourceNavigation({ surface, onNavigate: () => {} });

	const samples = useResourceSampleBuffer(snapshot);

	const trackedMemory = snapshot?.totalMemory ?? 0;
	const totalUsage = {
		cpu: snapshot?.totalCpu ?? 0,
		memory: snapshot?.totalMemory ?? 0,
	};

	const projectGroups = snapshot
		? sortProjectGroups(
				groupWorkspacesByProject(snapshot.workspaces),
				sortOption,
				sidebarProjectOrder,
			).map((group) => ({
				...group,
				workspaces: sortWorkspaces(
					group.workspaces,
					sortOption,
					sidebarWorkspaceOrder,
				),
			}))
		: [];
	const projectTotals = projectGroups.reduce(
		(acc, project) => ({
			cpu: acc.cpu + project.cpu,
			memory: acc.memory + project.memory,
		}),
		{ cpu: 0, memory: 0 },
	);

	return (
		<div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-3 px-6 py-4">
			<div className="flex items-center gap-2">
				<span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
					<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
					Live · local machine · every 2 s
				</span>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
							aria-label="Sort workspaces"
						>
							<HiOutlineBarsArrowDown className="h-3.5 w-3.5" />
							<span>{SORT_LABELS[sortOption]}</span>
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-40">
						<DropdownMenuRadioGroup
							value={sortOption}
							onValueChange={(value) => setSortOption(value as SortOption)}
						>
							<DropdownMenuRadioItem value="memory">
								Memory
							</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="cpu">CPU</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="sidebar">
								Sidebar order
							</DropdownMenuRadioItem>
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
				<Button
					variant="ghost"
					size="icon"
					className="size-6"
					disabled={isFetching}
					onClick={() => refetch()}
					aria-label="Refresh metrics"
				>
					<LuRefreshCw className={cn("size-3", isFetching && "animate-spin")} />
				</Button>
			</div>

			{!snapshot ? (
				<div className="py-4 text-center text-xs text-muted-foreground">
					Measuring resource usage…
				</div>
			) : (
				<>
					<SystemOverview snapshot={snapshot} />

					<div className="grid gap-3 sm:grid-cols-2">
						<ResourceSparkline
							label="Superset CPU · last 5 min"
							current={formatCpu(snapshot.totalCpu)}
							color="var(--chart-1)"
							samples={samples}
							getValue={(sample) => sample.cpu}
							formatValue={formatCpu}
						/>
						<ResourceSparkline
							label="Superset memory · last 5 min"
							current={formatMemory(snapshot.totalMemory)}
							color="var(--chart-2)"
							samples={samples}
							getValue={(sample) => sample.memory}
							formatValue={formatMemory}
						/>
					</div>

					<div className="overflow-hidden rounded-lg border">
						<div className="flex items-center gap-3 border-b bg-muted/30 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
							<span className="min-w-0 flex-1">Process</span>
							<span className={CPU_COL}>CPU</span>
							<span className={MEM_COL}>Memory</span>
							<span className={cn(BAR_COL, "normal-case tracking-normal")}>
								Memory share
							</span>
						</div>

						{/* Superset app processes */}
						<div className="flex items-center gap-3 px-3 py-2">
							<div className="flex min-w-0 flex-1 items-center gap-1.5">
								<span className="truncate text-[13px] font-medium">
									Superset app
								</span>
								<UsageSeverityBadge
									severity={getUsageSeverity(snapshot.app, totalUsage)}
								/>
							</div>
							<MetricCells
								cpu={snapshot.app.cpu}
								memory={snapshot.app.memory}
								trackedMemory={trackedMemory}
							/>
						</div>
						{(
							[
								{ label: "Main", values: snapshot.app.main },
								{ label: "Renderer", values: snapshot.app.renderer },
								{ label: "Other", values: snapshot.app.other },
							] as const
						)
							.filter(
								({ label, values }) =>
									label !== "Other" || values.cpu > 0 || values.memory > 0,
							)
							.map(({ label, values }) => (
								<div
									key={label}
									className="flex items-center gap-3 px-3 py-1 pl-9"
								>
									<div className="flex min-w-0 flex-1 items-center gap-1.5">
										<span className="truncate text-xs text-muted-foreground">
											{label}
										</span>
										<UsageSeverityBadge
											severity={getUsageSeverity(values, snapshot.app)}
										/>
									</div>
									<MetricCells
										cpu={values.cpu}
										memory={values.memory}
										trackedMemory={trackedMemory}
										muted
									/>
								</div>
							))}

						{/* Workspaces, grouped by project */}
						{projectGroups.map((project) => {
							const isProjectCollapsed = collapsedProjects.has(
								project.projectId,
							);
							return (
								<div key={project.projectId} className="border-t">
									<button
										type="button"
										onClick={() =>
											setCollapsedProjects((prev) =>
												toggleSetMember(prev, project.projectId),
											)
										}
										className="group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-foreground/[0.04]"
										aria-label={
											isProjectCollapsed ? "Expand project" : "Collapse project"
										}
									>
										<div className="flex min-w-0 flex-1 items-center gap-1">
											<span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground/70 transition-colors group-hover:text-muted-foreground">
												{isProjectCollapsed ? (
													<HiOutlineChevronRight className="h-3 w-3" />
												) : (
													<HiOutlineChevronDown className="h-3 w-3" />
												)}
											</span>
											<span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
												{project.projectName}
											</span>
											<UsageSeverityBadge
												severity={getUsageSeverity(project, projectTotals)}
											/>
										</div>
										<MetricCells
											cpu={project.cpu}
											memory={project.memory}
											trackedMemory={trackedMemory}
										/>
									</button>

									{!isProjectCollapsed &&
										project.workspaces.map((workspace) => {
											const isCollapsed = collapsedWorkspaces.has(
												workspace.workspaceId,
											);
											const hasSessions = workspace.sessions.length > 0;

											return (
												<div key={workspace.workspaceId}>
													<div className="group flex items-center transition-colors hover:bg-foreground/[0.04]">
														{hasSessions ? (
															<button
																type="button"
																onClick={() =>
																	setCollapsedWorkspaces((prev) =>
																		toggleSetMember(
																			prev,
																			workspace.workspaceId,
																		),
																	)
																}
																className="ml-5 flex h-8 w-5 shrink-0 items-center justify-center text-muted-foreground/60 transition-colors hover:text-muted-foreground"
																aria-label={
																	isCollapsed
																		? "Expand workspace"
																		: "Collapse workspace"
																}
															>
																{isCollapsed ? (
																	<HiOutlineChevronRight className="h-3 w-3" />
																) : (
																	<HiOutlineChevronDown className="h-3 w-3" />
																)}
															</button>
														) : (
															<span className="ml-5 h-8 w-5 shrink-0" />
														)}
														<button
															type="button"
															onClick={() =>
																navigateToWorkspace(workspace.workspaceId)
															}
															className="flex min-w-0 flex-1 items-center gap-3 py-1.5 pl-1 pr-3 text-left"
														>
															<div className="flex min-w-0 flex-1 items-center gap-1.5">
																<span className="min-w-0 truncate text-[13px]">
																	{workspace.workspaceName}
																</span>
																<UsageSeverityBadge
																	severity={getUsageSeverity(
																		workspace,
																		project,
																	)}
																/>
															</div>
															<MetricCells
																cpu={workspace.cpu}
																memory={workspace.memory}
																trackedMemory={trackedMemory}
															/>
														</button>
													</div>

													{!isCollapsed &&
														workspace.sessions.map((session) => (
															<button
																type="button"
																key={session.sessionId}
																onClick={() =>
																	navigateToPane(
																		workspace.workspaceId,
																		session.paneId,
																	)
																}
																className="flex w-full items-center gap-3 py-1 pl-12 pr-3 text-left transition-colors hover:bg-foreground/[0.04]"
															>
																<div className="flex min-w-0 flex-1 items-center gap-1.5">
																	<span className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
																	<span className="min-w-0 truncate text-xs text-muted-foreground">
																		{getPaneName(session)}
																	</span>
																	<UsageSeverityBadge
																		severity={getUsageSeverity(
																			session,
																			workspace,
																		)}
																	/>
																</div>
																<MetricCells
																	cpu={session.cpu}
																	memory={session.memory}
																	trackedMemory={trackedMemory}
																	muted
																/>
															</button>
														))}
												</div>
											);
										})}
								</div>
							);
						})}

						{projectGroups.length === 0 && (
							<div className="border-t px-3 py-6 text-center text-xs text-muted-foreground">
								No active terminal sessions
							</div>
						)}
					</div>
				</>
			)}
		</div>
	);
}
