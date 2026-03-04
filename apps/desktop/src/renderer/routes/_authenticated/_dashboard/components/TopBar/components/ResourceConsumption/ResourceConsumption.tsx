import { cn } from "@superset/ui/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
	HiOutlineArrowPath,
	HiOutlineChevronDown,
	HiOutlineChevronRight,
	HiOutlineCpuChip,
} from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";

function formatMemory(bytes: number): string {
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatCpu(percent: number): string {
	return `${percent.toFixed(1)}%`;
}

const METRIC_COLS = "flex items-center shrink-0 tabular-nums";
const CPU_COL = "w-12 text-right";
const MEM_COL = "w-16 text-right";
const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

type UsageSeverity = "normal" | "elevated" | "high";

interface UsageValues {
	cpu: number;
	memory: number;
}

function getUsageSeverity(
	values: UsageValues,
	totals: UsageValues,
	options: { includeShare?: boolean } = {},
): UsageSeverity {
	const { includeShare = true } = options;
	const isHighAbsolute = values.cpu >= 90 || values.memory >= 2 * GB;
	if (isHighAbsolute) return "high";

	const isElevatedAbsolute = values.cpu >= 50 || values.memory >= 1 * GB;
	if (isElevatedAbsolute) return "elevated";

	if (!includeShare) return "normal";

	const cpuShare = totals.cpu > 0 ? values.cpu / totals.cpu : 0;
	const memoryShare = totals.memory > 0 ? values.memory / totals.memory : 0;

	const isHighShare =
		(cpuShare >= 0.45 && values.cpu >= 20) ||
		(memoryShare >= 0.45 && values.memory >= 512 * MB);
	if (isHighShare) return "high";

	const isElevatedShare =
		(cpuShare >= 0.25 && values.cpu >= 10) ||
		(memoryShare >= 0.25 && values.memory >= 256 * MB);
	if (isElevatedShare) return "elevated";

	return "normal";
}

function getUsageClasses(severity: UsageSeverity, nested = false) {
	const normalRowClass = nested ? "bg-muted/30" : "";
	const normalHoverClass = nested ? "hover:bg-muted/60" : "hover:bg-muted/50";

	if (severity === "high") {
		return {
			rowClass: nested ? "bg-destructive/10" : "bg-destructive/5",
			hoverClass: nested
				? "hover:bg-destructive/15"
				: "hover:bg-destructive/10",
			labelClass: "text-destructive",
			metricClass: "text-destructive",
		};
	}

	if (severity === "elevated") {
		return {
			rowClass: nested ? "bg-amber-500/10" : "bg-amber-500/5",
			hoverClass: nested ? "hover:bg-amber-500/15" : "hover:bg-amber-500/10",
			labelClass: "text-amber-700 dark:text-amber-300",
			metricClass: "text-amber-700 dark:text-amber-300",
		};
	}

	return {
		rowClass: normalRowClass,
		hoverClass: normalHoverClass,
		labelClass: "",
		metricClass: "text-muted-foreground",
	};
}

export function ResourceConsumption() {
	const [open, setOpen] = useState(false);
	const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<Set<string>>(
		new Set(),
	);
	const navigate = useNavigate();
	const panes = useTabsStore((s) => s.panes);
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);

	const { data: enabled } =
		electronTrpc.settings.getShowResourceMonitor.useQuery();

	const {
		data: snapshot,
		refetch,
		isFetching,
	} = electronTrpc.resourceMetrics.getSnapshot.useQuery(undefined, {
		enabled: enabled === true,
		refetchInterval: open ? 2000 : false,
	});

	if (!enabled) return null;

	const getPaneName = (paneId: string): string => {
		const pane = panes[paneId];
		return pane?.name || `Pane ${paneId.slice(0, 6)}`;
	};

	const navigateToWorkspace = (workspaceId: string) => {
		navigate({ to: `/workspace/${workspaceId}` });
		setOpen(false);
	};

	const navigateToPane = (workspaceId: string, paneId: string) => {
		const pane = panes[paneId];
		if (pane) {
			setActiveTab(workspaceId, pane.tabId);
			setFocusedPane(pane.tabId, paneId);
		}
		navigate({ to: `/workspace/${workspaceId}` });
		setOpen(false);
	};

	const toggleWorkspace = (workspaceId: string) => {
		setCollapsedWorkspaces((prev) => {
			const next = new Set(prev);
			if (next.has(workspaceId)) {
				next.delete(workspaceId);
			} else {
				next.add(workspaceId);
			}
			return next;
		});
	};

	const totalUsage = snapshot
		? { cpu: snapshot.totalCpu, memory: snapshot.totalMemory }
		: { cpu: 0, memory: 0 };
	const totalSeverity = getUsageSeverity(totalUsage, totalUsage, {
		includeShare: false,
	});
	const totalUsageClasses = getUsageClasses(totalSeverity);

	const workspaceTotals = snapshot
		? snapshot.workspaces.reduce(
				(acc, ws) => ({
					cpu: acc.cpu + ws.cpu,
					memory: acc.memory + ws.memory,
				}),
				{ cpu: 0, memory: 0 },
			)
		: { cpu: 0, memory: 0 };
	const appSeverity = snapshot
		? getUsageSeverity(snapshot.app, totalUsage)
		: "normal";
	const appClasses = getUsageClasses(appSeverity);
	const mainSeverity = snapshot
		? getUsageSeverity(snapshot.app.main, snapshot.app)
		: "normal";
	const mainClasses = getUsageClasses(mainSeverity, true);
	const rendererSeverity = snapshot
		? getUsageSeverity(snapshot.app.renderer, snapshot.app)
		: "normal";
	const rendererClasses = getUsageClasses(rendererSeverity, true);
	const otherSeverity = snapshot
		? getUsageSeverity(snapshot.app.other, snapshot.app)
		: "normal";
	const otherClasses = getUsageClasses(otherSeverity, true);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"no-drag flex items-center gap-1.5 h-6 px-1.5 rounded border border-border/60 bg-secondary/50 hover:bg-secondary hover:border-border transition-all duration-150 ease-out focus:outline-none focus:ring-1 focus:ring-ring",
						totalSeverity === "elevated" &&
							"border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15",
						totalSeverity === "high" &&
							"border-destructive/30 bg-destructive/10 hover:bg-destructive/15",
					)}
					aria-label="Resource consumption"
				>
					<HiOutlineCpuChip
						className={cn(
							"h-3.5 w-3.5 shrink-0",
							totalUsageClasses.metricClass,
						)}
					/>
					{snapshot && (
						<span
							className={cn(
								"text-xs font-medium tabular-nums",
								totalUsageClasses.metricClass,
							)}
						>
							{formatMemory(snapshot.totalMemory)}
						</span>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-80 p-0">
				<div className="p-3 border-b border-border">
					<div className="flex items-center justify-between">
						<h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
							Resource Usage
						</h4>
						<button
							type="button"
							onClick={() => refetch()}
							className="p-0.5 rounded hover:bg-muted transition-colors"
							aria-label="Refresh metrics"
						>
							<HiOutlineArrowPath
								className={`h-3.5 w-3.5 text-muted-foreground ${isFetching ? "animate-spin" : ""}`}
							/>
						</button>
					</div>
					{snapshot && (
						<div className="mt-2 flex items-center gap-4">
							<MetricBadge
								label="CPU"
								value={formatCpu(snapshot.totalCpu)}
								severity={totalSeverity}
							/>
							<MetricBadge
								label="Memory"
								value={formatMemory(snapshot.totalMemory)}
								severity={totalSeverity}
							/>
						</div>
					)}
				</div>

				<div className="max-h-[50vh] overflow-y-auto">
					{snapshot && (
						<div className="border-b border-border/50">
							<div
								className={cn(
									"px-3 py-2 flex items-center justify-between",
									appClasses.rowClass,
								)}
							>
								<div className="flex items-center gap-1.5 min-w-0 mr-2">
									<span
										className={cn(
											"text-xs font-medium min-w-0 truncate",
											appClasses.labelClass,
										)}
									>
										Superset App
									</span>
									<UsageSeverityBadge severity={appSeverity} />
								</div>
								<div
									className={cn(METRIC_COLS, "text-xs", appClasses.metricClass)}
								>
									<span className={CPU_COL}>{formatCpu(snapshot.app.cpu)}</span>
									<span className={MEM_COL}>
										{formatMemory(snapshot.app.memory)}
									</span>
								</div>
							</div>
							<div
								className={cn(
									"px-3 py-1.5 pl-6 flex items-center justify-between",
									mainClasses.rowClass,
								)}
							>
								<span
									className={cn(
										"text-[11px] text-muted-foreground min-w-0 truncate",
										mainClasses.labelClass,
									)}
								>
									Main
								</span>
								<div
									className={cn(
										METRIC_COLS,
										"text-[11px]",
										mainClasses.metricClass,
									)}
								>
									<span className={CPU_COL}>
										{formatCpu(snapshot.app.main.cpu)}
									</span>
									<span className={MEM_COL}>
										{formatMemory(snapshot.app.main.memory)}
									</span>
								</div>
							</div>
							<div
								className={cn(
									"px-3 py-1.5 pl-6 flex items-center justify-between",
									rendererClasses.rowClass,
								)}
							>
								<span
									className={cn(
										"text-[11px] text-muted-foreground min-w-0 truncate",
										rendererClasses.labelClass,
									)}
								>
									Renderer
								</span>
								<div
									className={cn(
										METRIC_COLS,
										"text-[11px]",
										rendererClasses.metricClass,
									)}
								>
									<span className={CPU_COL}>
										{formatCpu(snapshot.app.renderer.cpu)}
									</span>
									<span className={MEM_COL}>
										{formatMemory(snapshot.app.renderer.memory)}
									</span>
								</div>
							</div>
							{(snapshot.app.other.cpu > 0 ||
								snapshot.app.other.memory > 0) && (
								<div
									className={cn(
										"px-3 py-1.5 pl-6 flex items-center justify-between",
										otherClasses.rowClass,
									)}
								>
									<span
										className={cn(
											"text-[11px] text-muted-foreground min-w-0 truncate",
											otherClasses.labelClass,
										)}
									>
										Other
									</span>
									<div
										className={cn(
											METRIC_COLS,
											"text-[11px]",
											otherClasses.metricClass,
										)}
									>
										<span className={CPU_COL}>
											{formatCpu(snapshot.app.other.cpu)}
										</span>
										<span className={MEM_COL}>
											{formatMemory(snapshot.app.other.memory)}
										</span>
									</div>
								</div>
							)}
						</div>
					)}

					{snapshot?.workspaces.map((ws) => {
						const isCollapsed = collapsedWorkspaces.has(ws.workspaceId);
						const workspaceSeverity = getUsageSeverity(ws, workspaceTotals);
						const workspaceClasses = getUsageClasses(workspaceSeverity);
						return (
							<div
								key={ws.workspaceId}
								className="border-b border-border/50 last:border-b-0"
							>
								<div
									className={cn("flex items-center", workspaceClasses.rowClass)}
								>
									{ws.sessions.length > 0 && (
										<button
											type="button"
											onClick={() => toggleWorkspace(ws.workspaceId)}
											className={cn(
												"pl-2 py-2 pr-0.5 transition-colors",
												workspaceClasses.hoverClass,
											)}
											aria-label={
												isCollapsed ? "Expand workspace" : "Collapse workspace"
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
										onClick={() => navigateToWorkspace(ws.workspaceId)}
										className={cn(
											"flex-1 min-w-0 py-2 pr-3 flex items-center justify-between transition-colors",
											ws.sessions.length > 0 ? "pl-1" : "pl-3",
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
												{ws.workspaceName}
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
											<span className={CPU_COL}>{formatCpu(ws.cpu)}</span>
											<span className={MEM_COL}>{formatMemory(ws.memory)}</span>
										</div>
									</button>
								</div>

								{!isCollapsed &&
									ws.sessions.map((session) => {
										const sessionSeverity = getUsageSeverity(session, ws);
										const sessionClasses = getUsageClasses(
											sessionSeverity,
											true,
										);

										return (
											<button
												type="button"
												key={session.sessionId}
												onClick={() =>
													navigateToPane(ws.workspaceId, session.paneId)
												}
												className={cn(
													"w-full px-3 py-1.5 pl-6 flex items-center justify-between transition-colors",
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

					{snapshot && snapshot.workspaces.length === 0 && (
						<div className="px-3 py-4 text-center text-xs text-muted-foreground">
							No active terminal sessions
						</div>
					)}

					{!snapshot && (
						<div className="px-3 py-4 text-center text-xs text-muted-foreground">
							Loading...
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}

function UsageSeverityBadge({ severity }: { severity: UsageSeverity }) {
	if (severity === "normal") return null;

	return (
		<span
			className={cn(
				"rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
				severity === "high" && "bg-destructive/15 text-destructive",
				severity === "elevated" &&
					"bg-amber-500/15 text-amber-700 dark:text-amber-300",
			)}
		>
			{severity === "high" ? "High" : "Elevated"}
		</span>
	);
}

function MetricBadge({
	label,
	value,
	severity = "normal",
}: {
	label: string;
	value: string;
	severity?: UsageSeverity;
}) {
	const classes = getUsageClasses(severity);

	return (
		<div className="flex items-center gap-1.5">
			<span className="text-xs text-muted-foreground">{label}</span>
			<span
				className={cn("text-sm font-medium tabular-nums", classes.metricClass)}
			>
				{value}
			</span>
		</div>
	);
}
