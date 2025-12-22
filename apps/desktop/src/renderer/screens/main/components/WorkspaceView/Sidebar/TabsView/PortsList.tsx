import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useEffect, useMemo, useState } from "react";
import { LuChevronRight, LuExternalLink, LuRadioTower } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import { type DetectedPort, usePortsStore } from "renderer/stores";
import { useTabsStore } from "renderer/stores/tabs/store";

interface WorkspaceGroup {
	workspaceId: string;
	workspaceName: string;
	isCurrentWorkspace: boolean;
	ports: DetectedPort[];
}

export function PortsList() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const { data: allWorkspaces } = trpc.workspaces.getAll.useQuery();
	const ports = usePortsStore((s) => s.ports);
	const setPorts = usePortsStore((s) => s.setPorts);
	const addPort = usePortsStore((s) => s.addPort);
	const removePort = usePortsStore((s) => s.removePort);

	// Fetch initial ports
	const { data: initialPorts } = trpc.ports.getAll.useQuery();

	// Set initial ports when they load
	useEffect(() => {
		if (initialPorts) {
			setPorts(initialPorts);
		}
	}, [initialPorts, setPorts]);

	// Subscribe to port changes
	trpc.ports.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "add") {
				addPort(event.port);
			} else if (event.type === "remove") {
				removePort(event.port.paneId, event.port.port);
			}
		},
	});

	// Create a map of workspace IDs to names
	const workspaceNames = useMemo(() => {
		if (!allWorkspaces) return {};
		return allWorkspaces.reduce(
			(acc, ws) => {
				acc[ws.id] = ws.name;
				return acc;
			},
			{} as Record<string, string>,
		);
	}, [allWorkspaces]);

	// Group ports by workspace, sorted with current workspace first
	const groupedPorts = useMemo(() => {
		const groups: Record<string, DetectedPort[]> = {};

		for (const port of ports) {
			if (!groups[port.workspaceId]) {
				groups[port.workspaceId] = [];
			}
			groups[port.workspaceId].push(port);
		}

		// Sort ports within each group by port number
		for (const workspaceId of Object.keys(groups)) {
			groups[workspaceId].sort((a, b) => a.port - b.port);
		}

		// Convert to array and sort groups (current workspace first)
		const result: WorkspaceGroup[] = Object.entries(groups).map(
			([workspaceId, workspacePorts]) => ({
				workspaceId,
				workspaceName: workspaceNames[workspaceId] || "Unknown",
				isCurrentWorkspace: workspaceId === activeWorkspace?.id,
				ports: workspacePorts,
			}),
		);

		result.sort((a, b) => {
			if (a.isCurrentWorkspace && !b.isCurrentWorkspace) return -1;
			if (!a.isCurrentWorkspace && b.isCurrentWorkspace) return 1;
			return a.workspaceName.localeCompare(b.workspaceName);
		});

		return result;
	}, [ports, activeWorkspace?.id, workspaceNames]);

	const [isCollapsed, setIsCollapsed] = useState(false);

	if (ports.length === 0) {
		return null;
	}

	return (
		<div className="mt-3 pt-3 border-t border-border/40">
			<button
				type="button"
				aria-expanded={!isCollapsed}
				onClick={() => setIsCollapsed(!isCollapsed)}
				className="text-[11px] uppercase tracking-wider text-muted-foreground/70 px-3 pb-2 font-medium flex items-center gap-1.5 w-full hover:text-muted-foreground focus-visible:text-muted-foreground focus-visible:outline-none transition-colors"
			>
				<LuChevronRight
					className={`size-3 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
				/>
				<LuRadioTower className="size-3" />
				Ports
				<span className="text-[10px] ml-auto font-normal">{ports.length}</span>
			</button>
			{!isCollapsed && (
				<div className="space-y-2">
					{groupedPorts.map((group) => (
						<WorkspacePortGroup key={group.workspaceId} group={group} />
					))}
				</div>
			)}
		</div>
	);
}

interface WorkspacePortGroupProps {
	group: WorkspaceGroup;
}

function WorkspacePortGroup({ group }: WorkspacePortGroupProps) {
	const setActiveMutation = trpc.workspaces.setActive.useMutation();
	const utils = trpc.useUtils();

	const handleWorkspaceClick = async () => {
		if (group.isCurrentWorkspace) return;

		await setActiveMutation.mutateAsync({ id: group.workspaceId });
		await utils.workspaces.getActive.invalidate();
	};

	return (
		<div>
			<button
				type="button"
				onClick={handleWorkspaceClick}
				disabled={group.isCurrentWorkspace}
				className={`text-xs px-3 py-1 truncate text-left w-full transition-colors ${
					group.isCurrentWorkspace
						? "text-sidebar-foreground/80"
						: "text-muted-foreground hover:text-sidebar-foreground cursor-pointer"
				}`}
			>
				{group.workspaceName}
			</button>
			<div className="flex flex-wrap gap-1 px-3">
				{group.ports.map((port) => (
					<PortBadge
						key={`${port.paneId}:${port.port}`}
						port={port}
						isCurrentWorkspace={group.isCurrentWorkspace}
					/>
				))}
			</div>
		</div>
	);
}

interface PortBadgeProps {
	port: DetectedPort;
	isCurrentWorkspace: boolean;
}

function PortBadge({ port, isCurrentWorkspace }: PortBadgeProps) {
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const setActiveMutation = trpc.workspaces.setActive.useMutation();
	const utils = trpc.useUtils();

	const handleClick = async () => {
		// If not in current workspace, switch to it first
		if (!isCurrentWorkspace) {
			await setActiveMutation.mutateAsync({ id: port.workspaceId });
			await utils.workspaces.getActive.invalidate();
		}

		// Look up pane after potential workspace switch
		const pane = useTabsStore.getState().panes[port.paneId];
		if (!pane) return;

		// Set the tab as active for this workspace
		setActiveTab(port.workspaceId, pane.tabId);

		// Focus the specific pane
		setFocusedPane(pane.tabId, port.paneId);
	};

	const handleOpenInBrowser = () => {
		window.open(`http://localhost:${port.port}`, "_blank");
	};

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div
					className={`group relative inline-flex items-center gap-1 rounded-md text-xs font-mono transition-colors ${
						isCurrentWorkspace
							? "bg-primary/10 text-primary hover:bg-primary/20"
							: "bg-muted/50 text-muted-foreground hover:bg-muted"
					}`}
				>
					<button
						type="button"
						onClick={handleClick}
						className="font-medium px-2 py-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md"
					>
						{port.port}
					</button>
					<button
						type="button"
						onClick={handleOpenInBrowser}
						aria-label={`Open port ${port.port} in browser`}
						className="opacity-0 group-hover:opacity-100 pr-1.5 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none"
					>
						<LuExternalLink className="size-3" />
					</button>
				</div>
			</TooltipTrigger>
			<TooltipContent side="top" showArrow={false}>
				<div className="text-xs space-y-1">
					<div className="font-medium">localhost:{port.port}</div>
					<div className="text-muted-foreground max-w-[200px] truncate">
						{port.contextLine}
					</div>
					<div className="text-muted-foreground/70 text-[10px]">
						Click to jump to terminal
					</div>
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
