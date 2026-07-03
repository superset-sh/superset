import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { LuExternalLink, LuLoaderCircle, LuX } from "react-icons/lu";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import { useDashboardSidebarPortKill } from "../../hooks/useDashboardSidebarPortKill";
import type { DashboardSidebarPort } from "../../hooks/useDashboardSidebarPortsData";

interface DashboardSidebarPortBadgeProps {
	port: DashboardSidebarPort;
}

export function DashboardSidebarPortBadge({
	port,
}: DashboardSidebarPortBadgeProps) {
	const navigate = useNavigate();
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const { isPending, killPort } = useDashboardSidebarPortKill();
	const { preferences } = useV2UserPreferences();
	const canOpenInBrowser = port.hostType === "local-device";
	const hostLabel =
		port.hostType === "local-device" ? "Local device" : "Remote host";

	const handleWorkspaceClick = () => {
		void navigateToV2Workspace(port.workspaceId, navigate, {
			search: {
				terminalId: port.terminalId,
				focusRequestId: crypto.randomUUID(),
			},
		});
	};

	const handleOpenInBrowser = () => {
		if (!canOpenInBrowser) return;

		// Where the port opens is configurable under Settings → Links → Ports.
		const url = `http://localhost:${port.port}`;
		if (preferences.portOpenAction === "external") {
			if (openUrl.isPending) return;
			openUrl.mutate(url);
			return;
		}

		void navigateToV2Workspace(port.workspaceId, navigate, {
			search: {
				openUrl: url,
				openUrlTarget:
					preferences.portOpenAction === "newTab" ? "new-tab" : "current-tab",
				openUrlRequestId: crypto.randomUUID(),
			},
		});
	};

	const handleClose = () => {
		if (isPending) return;
		void killPort(port);
	};

	return (
		<ContextMenu>
			<Tooltip delayDuration={700}>
				<ContextMenuTrigger asChild>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleWorkspaceClick}
							disabled={isPending}
							aria-busy={isPending}
							className={cn(
								"flex max-w-40 min-w-0 shrink-0 items-center gap-1 rounded px-1.5 py-0.5",
								"bg-muted/60 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
								"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
								isPending && "opacity-70",
							)}
						>
							{port.label ? (
								<>
									<span className="min-w-0 truncate">{port.label}</span>
									<span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/60">
										{port.port}
									</span>
								</>
							) : (
								<span className="font-mono tabular-nums">{port.port}</span>
							)}
							{isPending && (
								<LuLoaderCircle
									className="size-3 shrink-0 animate-spin"
									strokeWidth={STROKE_WIDTH}
								/>
							)}
						</button>
					</TooltipTrigger>
				</ContextMenuTrigger>
				<TooltipContent side="top" sideOffset={6} showArrow={false}>
					<div className="space-y-1 text-xs">
						{port.label && <div className="font-medium">{port.label}</div>}
						<div
							className={`font-mono ${port.label ? "text-background/70" : "font-medium"}`}
						>
							localhost:{port.port}
						</div>
						<div className="text-background/70">{hostLabel}</div>
						{(port.processName || port.pid != null) && (
							<div className="text-background/70">
								{port.processName}
								{port.pid != null && ` (pid ${port.pid})`}
							</div>
						)}
						{!canOpenInBrowser && (
							<div className="text-[10px] text-background/60">
								Browser open unavailable from this device
							</div>
						)}
						<div className="text-[10px] text-background/60">
							Click to open workspace · Right-click for actions
						</div>
					</div>
				</TooltipContent>
			</Tooltip>
			<ContextMenuContent>
				{canOpenInBrowser && (
					<ContextMenuItem
						onSelect={handleOpenInBrowser}
						disabled={openUrl.isPending}
					>
						<LuExternalLink className="size-4 mr-2" />
						Open in Browser
					</ContextMenuItem>
				)}
				<ContextMenuItem onSelect={handleClose} disabled={isPending}>
					<LuX className="size-4 mr-2" />
					Close Port
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
