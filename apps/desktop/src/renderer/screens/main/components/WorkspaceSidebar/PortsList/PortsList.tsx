import { COMPANY } from "@superset/shared/constants";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useEffect, useMemo, useRef } from "react";
import { LuChevronRight, LuCircleHelp, LuRadioTower } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import { usePortsStore } from "renderer/stores";
import type { MergedPort } from "shared/types";
import { STROKE_WIDTH } from "../constants";
import { MergedPortBadge } from "./components/MergedPortBadge";
import { mergePorts } from "./utils";

const PORTS_DOCS_URL = `https://${COMPANY.DOMAIN}/ports`;

interface MergedWorkspaceGroup {
	workspaceId: string;
	workspaceName: string;
	isCurrentWorkspace: boolean;
	ports: MergedPort[];
}

export function PortsList() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const { data: allWorkspaces } = trpc.workspaces.getAll.useQuery();
	const ports = usePortsStore((s) => s.ports);
	const setPorts = usePortsStore((s) => s.setPorts);
	const addPort = usePortsStore((s) => s.addPort);
	const removePort = usePortsStore((s) => s.removePort);
	const isCollapsed = usePortsStore((s) => s.isListCollapsed);
	const toggleCollapsed = usePortsStore((s) => s.toggleListCollapsed);

	const utils = trpc.useUtils();

	const { data: allStaticPortsData } = trpc.ports.getAllStatic.useQuery();

	trpc.ports.subscribeStatic.useSubscription(
		{ workspaceId: activeWorkspace?.id ?? "" },
		{
			enabled: !!activeWorkspace?.id,
			onData: () => {
				utils.ports.getAllStatic.invalidate();
			},
		},
	);

	const { data: initialPorts } = trpc.ports.getAll.useQuery();

	useEffect(() => {
		if (initialPorts) {
			setPorts(initialPorts);
		}
	}, [initialPorts, setPorts]);

	trpc.ports.subscribe.useSubscription(undefined, {
		onData: (event) => {
			if (event.type === "add") {
				addPort(event.port);
			} else if (event.type === "remove") {
				removePort(event.port.paneId, event.port.port);
			}
		},
	});

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

	// Prevent showing duplicate error toasts on re-renders
	const shownErrorsRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		const errors = allStaticPortsData?.errors ?? [];
		for (const { workspaceId, error } of errors) {
			const errorKey = `${workspaceId}:${error}`;
			if (!shownErrorsRef.current.has(errorKey)) {
				shownErrorsRef.current.add(errorKey);
				const workspaceName =
					workspaceNames[workspaceId] || "Unknown workspace";
				toast.error(`Failed to load ports.json in ${workspaceName}`, {
					description: error,
				});
			}
		}
	}, [allStaticPortsData?.errors, workspaceNames]);

	const allWorkspaceIds = useMemo(() => {
		const ids = new Set<string>();

		for (const port of allStaticPortsData?.ports ?? []) {
			ids.add(port.workspaceId);
		}

		for (const port of ports) {
			ids.add(port.workspaceId);
		}

		return Array.from(ids);
	}, [allStaticPortsData?.ports, ports]);

	const workspacePortGroups = useMemo(() => {
		const allStaticPorts = allStaticPortsData?.ports ?? [];

		const groups = allWorkspaceIds.map((workspaceId) => {
			const staticPortsForWorkspace = allStaticPorts.filter(
				(p) => p.workspaceId === workspaceId,
			);

			const merged = mergePorts({
				staticPorts: staticPortsForWorkspace,
				dynamicPorts: ports,
				workspaceId,
			});

			return {
				workspaceId,
				workspaceName: workspaceNames[workspaceId] || "Unknown",
				isCurrentWorkspace: workspaceId === activeWorkspace?.id,
				ports: merged,
			};
		});

		groups.sort((a, b) => {
			if (a.isCurrentWorkspace && !b.isCurrentWorkspace) return -1;
			if (!a.isCurrentWorkspace && b.isCurrentWorkspace) return 1;
			return a.workspaceName.localeCompare(b.workspaceName);
		});

		return groups;
	}, [
		allWorkspaceIds,
		allStaticPortsData?.ports,
		ports,
		workspaceNames,
		activeWorkspace?.id,
	]);

	const totalPortCount = workspacePortGroups.reduce(
		(sum, g) => sum + g.ports.length,
		0,
	);

	if (totalPortCount === 0) {
		return null;
	}

	const handleOpenPortsDocs = (e: React.MouseEvent) => {
		e.stopPropagation();
		window.open(PORTS_DOCS_URL, "_blank");
	};

	return (
		<div className="mt-3 pt-3 border-t border-border/40">
			<div className="group text-[11px] uppercase tracking-wider text-muted-foreground/70 px-3 pb-2 font-medium flex items-center gap-1.5 w-full hover:text-muted-foreground transition-colors">
				<button
					type="button"
					aria-expanded={!isCollapsed}
					onClick={toggleCollapsed}
					className="flex items-center gap-1.5 focus-visible:text-muted-foreground focus-visible:outline-none"
				>
					<LuChevronRight
						className={`size-3 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
						strokeWidth={STROKE_WIDTH}
					/>
					<LuRadioTower className="size-3" strokeWidth={STROKE_WIDTH} />
					Ports
				</button>

				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleOpenPortsDocs}
							className="ml-auto p-0.5 rounded hover:bg-muted/50 opacity-0 group-hover:opacity-100 transition-opacity"
						>
							<LuCircleHelp className="size-3" strokeWidth={STROKE_WIDTH} />
						</button>
					</TooltipTrigger>
					<TooltipContent side="top" sideOffset={4}>
						<p className="text-xs">Learn about static port configuration</p>
					</TooltipContent>
				</Tooltip>
				<span className="text-[10px] font-normal">{totalPortCount}</span>
			</div>
			{!isCollapsed && (
				<div className="space-y-2 max-h-72 overflow-y-auto pb-1 hide-scrollbar">
					{workspacePortGroups.map((group) => (
						<MergedWorkspacePortGroup key={group.workspaceId} group={group} />
					))}
				</div>
			)}
		</div>
	);
}

interface MergedWorkspacePortGroupProps {
	group: MergedWorkspaceGroup;
}

function MergedWorkspacePortGroup({ group }: MergedWorkspacePortGroupProps) {
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
					<MergedPortBadge
						key={port.port}
						port={port}
						isCurrentWorkspace={group.isCurrentWorkspace}
					/>
				))}
			</div>
		</div>
	);
}
