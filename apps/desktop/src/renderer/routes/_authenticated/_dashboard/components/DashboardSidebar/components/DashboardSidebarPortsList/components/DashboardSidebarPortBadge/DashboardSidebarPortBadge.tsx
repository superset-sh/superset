import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { LuExternalLink, LuX } from "react-icons/lu";
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
	const { killPort } = useDashboardSidebarPortKill();
	const canOpenInBrowser = port.hostType === "local-device";

	const handleWorkspaceClick = () => {
		void navigateToV2Workspace(port.workspaceId, navigate);
	};

	const handleOpenInBrowser = () => {
		if (!canOpenInBrowser) return;
		openUrl.mutate(`http://localhost:${port.port}`);
	};

	const handleClose = () => {
		void killPort(port);
	};

	const displayContent = port.label ? (
		<>
			{port.label}{" "}
			<span className="font-mono font-normal text-muted-foreground">
				{port.port}
			</span>
		</>
	) : (
		<span className="font-mono text-muted-foreground">{port.port}</span>
	);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className="group relative mb-1 inline-flex items-center gap-1 rounded-md bg-primary/10 text-xs text-primary transition-colors hover:bg-primary/20">
					<button
						type="button"
						onClick={handleWorkspaceClick}
						className="rounded-md px-2 py-1 font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					>
						{displayContent}
					</button>
					{canOpenInBrowser && (
						<button
							type="button"
							onClick={handleOpenInBrowser}
							aria-label={`Open ${port.label || `port ${port.port}`} in browser`}
							className="text-muted-foreground opacity-0 transition-opacity hover:text-primary focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
						>
							<LuExternalLink className="size-3.5" strokeWidth={STROKE_WIDTH} />
						</button>
					)}
					<button
						type="button"
						onClick={handleClose}
						aria-label={`Close ${port.label || `port ${port.port}`}`}
						className="pr-1 text-muted-foreground opacity-0 transition-opacity hover:text-primary focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
					>
						<LuX className="size-3.5" strokeWidth={STROKE_WIDTH} />
					</button>
				</div>
			</TooltipTrigger>
			<TooltipContent side="top" sideOffset={6} showArrow={false}>
				<div className="space-y-1 text-xs">
					{port.label && <div className="font-medium">{port.label}</div>}
					<div
						className={`font-mono ${port.label ? "text-muted-foreground" : "font-medium"}`}
					>
						localhost:{port.port}
					</div>
					<div className="text-muted-foreground">
						{port.hostType === "local-device" ? "Local device" : "Remote host"}
					</div>
					{(port.processName || port.pid != null) && (
						<div className="text-muted-foreground">
							{port.processName}
							{port.pid != null && ` (pid ${port.pid})`}
						</div>
					)}
					<div className="text-[10px] text-muted-foreground/70">
						Click to open workspace
					</div>
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
