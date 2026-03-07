import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HiOutlineArrowPath, HiOutlineCpuChip } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { AppResourceSection } from "./components/AppResourceSection";
import { MetricBadge } from "./components/MetricBadge";
import { WorkspaceResourceSection } from "./components/WorkspaceResourceSection";
import type { UsageValues } from "./types";
import { formatCpu, formatMemory, formatPercent } from "./utils/formatters";
import { normalizeResourceMetricsSnapshot } from "./utils/normalizeSnapshot";

function getTotalUsage(
	cpu: number | undefined,
	memory: number | undefined,
): UsageValues {
	return {
		cpu: cpu ?? 0,
		memory: memory ?? 0,
	};
}

function getTrackedMemorySharePercent(
	totalMemory: number,
	hostTotalMemory: number,
): number {
	if (hostTotalMemory <= 0) return 0;
	return (totalMemory / hostTotalMemory) * 100;
}

export function ResourceConsumption() {
	const [open, setOpen] = useState(false);
	const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(
		new Set(),
	);
	const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<Set<string>>(
		new Set(),
	);

	const navigate = useNavigate();
	const panes = useTabsStore((state) => state.panes);
	const setActiveTab = useTabsStore((state) => state.setActiveTab);
	const setFocusedPane = useTabsStore((state) => state.setFocusedPane);

	const { data: enabled } =
		electronTrpc.settings.getShowResourceMonitor.useQuery();

	const {
		data: snapshot,
		refetch,
		isFetching,
	} = electronTrpc.resourceMetrics.getSnapshot.useQuery(
		{ mode: open ? "interactive" : "idle" },
		{
			enabled: enabled === true,
			refetchInterval: open ? 2000 : 15000,
		},
	);

	if (!enabled) return null;
	const normalizedSnapshot = normalizeResourceMetricsSnapshot(snapshot);

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

	const toggleProject = (projectId: string) => {
		setCollapsedProjects((prev) => {
			const next = new Set(prev);
			if (next.has(projectId)) {
				next.delete(projectId);
			} else {
				next.add(projectId);
			}
			return next;
		});
	};

	const totalUsage = getTotalUsage(
		normalizedSnapshot?.totalCpu,
		normalizedSnapshot?.totalMemory,
	);

	const trackedMemorySharePercent = normalizedSnapshot
		? getTrackedMemorySharePercent(
				normalizedSnapshot.totalMemory,
				normalizedSnapshot.host.totalMemory,
			)
		: 0;
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="no-drag flex items-center gap-1.5 h-6 px-1.5 rounded border border-border/60 bg-secondary/50 hover:bg-secondary hover:border-border transition-all duration-150 ease-out focus:outline-none focus:ring-1 focus:ring-ring"
					aria-label="Resource consumption"
				>
					<HiOutlineCpuChip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
					{normalizedSnapshot && (
						<span className="text-xs font-medium tabular-nums text-muted-foreground">
							{formatMemory(normalizedSnapshot.totalMemory)}
						</span>
					)}
				</button>
			</PopoverTrigger>

			<PopoverContent align="start" className="w-[26rem] p-0">
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

					{normalizedSnapshot && (
						<div className="mt-2 grid grid-cols-3 gap-2">
							<MetricBadge
								label="CPU"
								value={formatCpu(normalizedSnapshot.totalCpu)}
								tooltip="Sum of CPU used by Superset and monitored terminal process trees. Over 100% means multiple CPU cores are busy. Sustained high values usually cause UI sluggishness and higher battery drain."
							/>
							<MetricBadge
								label="Memory"
								value={formatMemory(normalizedSnapshot.totalMemory)}
								tooltip="Resident memory used by Superset and monitored terminal process trees. If this keeps climbing without dropping, a workspace process may be retaining memory. High values increase swap risk and can cause stutter."
							/>
							<MetricBadge
								label="RAM Share"
								value={formatPercent(trackedMemorySharePercent)}
								tooltip="Percent of total system RAM used by monitored Superset resources only (not all apps). A high share means Superset is a major contributor to system memory pressure; a low share means pressure is likely elsewhere."
							/>
						</div>
					)}
				</div>

				<div className="max-h-[50vh] overflow-y-auto">
					{normalizedSnapshot && (
						<AppResourceSection
							app={normalizedSnapshot.app}
							totalUsage={totalUsage}
						/>
					)}

					{normalizedSnapshot && (
						<WorkspaceResourceSection
							workspaces={normalizedSnapshot.workspaces}
							collapsedProjects={collapsedProjects}
							toggleProject={toggleProject}
							collapsedWorkspaces={collapsedWorkspaces}
							toggleWorkspace={toggleWorkspace}
							navigateToWorkspace={navigateToWorkspace}
							navigateToPane={navigateToPane}
							getPaneName={getPaneName}
						/>
					)}

					{normalizedSnapshot && normalizedSnapshot.workspaces.length === 0 && (
						<div className="px-3 py-4 text-center text-xs text-muted-foreground">
							No active terminal sessions
						</div>
					)}

					{!normalizedSnapshot && (
						<div className="px-3 py-4 text-center text-xs text-muted-foreground">
							Loading...
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
