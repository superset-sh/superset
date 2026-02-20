import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HiOutlineArrowPath, HiOutlineCpuChip } from "react-icons/hi2";
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

export function ResourceConsumption() {
	const [open, setOpen] = useState(false);
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

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="no-drag flex items-center gap-1.5 h-6 px-1.5 rounded border border-border/60 bg-secondary/50 hover:bg-secondary hover:border-border transition-all duration-150 ease-out focus:outline-none focus:ring-1 focus:ring-ring"
					aria-label="Resource consumption"
				>
					<HiOutlineCpuChip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
					{snapshot && (
						<span className="text-xs text-muted-foreground font-medium">
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
							<MetricBadge label="CPU" value={formatCpu(snapshot.totalCpu)} />
							<MetricBadge
								label="Memory"
								value={formatMemory(snapshot.totalMemory)}
							/>
						</div>
					)}
				</div>

				<div className="max-h-64 overflow-y-auto">
					{snapshot && (
						<div className="px-3 py-2 border-b border-border/50">
							<div className="flex items-center justify-between">
								<span className="text-xs font-medium">Superset App</span>
								<span className="text-xs text-muted-foreground">
									{formatMemory(snapshot.app.memory)}
								</span>
							</div>
						</div>
					)}

					{snapshot?.workspaces.map((ws) => (
						<div
							key={ws.workspaceId}
							className="border-b border-border/50 last:border-b-0"
						>
							<button
								type="button"
								onClick={() => navigateToWorkspace(ws.workspaceId)}
								className="w-full px-3 py-2 flex items-center justify-between hover:bg-muted/50 transition-colors"
							>
								<span className="text-xs font-medium truncate max-w-40">
									{ws.workspaceName}
								</span>
								<div className="flex items-center gap-3 text-xs text-muted-foreground">
									<span>{formatCpu(ws.cpu)}</span>
									<span>{formatMemory(ws.memory)}</span>
								</div>
							</button>

							{ws.sessions.map((session) => (
								<button
									type="button"
									key={session.sessionId}
									onClick={() => navigateToPane(ws.workspaceId, session.paneId)}
									className="w-full px-3 py-1.5 pl-6 flex items-center justify-between bg-muted/30 hover:bg-muted/60 transition-colors"
								>
									<span className="text-[11px] text-muted-foreground truncate max-w-32">
										{getPaneName(session.paneId)}
									</span>
									<div className="flex items-center gap-3 text-[11px] text-muted-foreground">
										<span>{formatCpu(session.cpu)}</span>
										<span>{formatMemory(session.memory)}</span>
									</div>
								</button>
							))}
						</div>
					))}

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

function MetricBadge({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center gap-1.5">
			<span className="text-xs text-muted-foreground">{label}</span>
			<span className="text-sm font-medium">{value}</span>
		</div>
	);
}
