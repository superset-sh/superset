import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { LuExternalLink, LuX } from "react-icons/lu";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { EnrichedPort } from "shared/types";
import { STROKE_WIDTH } from "../../../constants";
import { useKillPort } from "../../hooks/useKillPort";

interface MergedPortBadgeProps {
	port: EnrichedPort;
}

export function MergedPortBadge({ port }: MergedPortBadgeProps) {
	const navigate = useNavigate();
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const addBrowserTab = useTabsStore((s) => s.addBrowserTab);
	const { killPort } = useKillPort();

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

	const canJumpToTerminal = !!port.paneId;

	const handleClick = () => {
		if (!port.paneId) return;

		const pane = useTabsStore.getState().panes[port.paneId];
		if (!pane) return;

		navigateToWorkspace(port.workspaceId, navigate);
		setActiveTab(port.workspaceId, pane.tabId);
		setFocusedPane(pane.tabId, port.paneId);
	};

	const handleOpenInBrowser = () => {
		navigateToWorkspace(port.workspaceId, navigate);
		addBrowserTab(port.workspaceId, `http://localhost:${port.port}`);
	};

	const handleClose = () => {
		killPort(port);
	};

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className="group relative inline-flex items-center gap-1 rounded-md text-xs transition-colors mb-1 bg-primary/10 text-primary hover:bg-primary/20">
					<button
						type="button"
						onClick={handleClick}
						disabled={!canJumpToTerminal}
						className={`font-medium px-2 py-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md ${!canJumpToTerminal ? "cursor-default" : ""}`}
					>
						{displayContent}
					</button>
					<button
						type="button"
						onClick={handleOpenInBrowser}
						aria-label={`Open ${port.label || `port ${port.port}`} in browser`}
						className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary focus-visible:opacity-100 focus-visible:outline-none"
					>
						<LuExternalLink className="size-3.5" strokeWidth={STROKE_WIDTH} />
					</button>
					<button
						type="button"
						onClick={handleClose}
						aria-label={`Close ${port.label || `port ${port.port}`}`}
						className="opacity-0 group-hover:opacity-100 pr-1 transition-opacity text-muted-foreground hover:text-primary focus-visible:opacity-100 focus-visible:outline-none"
					>
						<LuX className="size-3.5" strokeWidth={STROKE_WIDTH} />
					</button>
				</div>
			</TooltipTrigger>
			<TooltipContent side="top" sideOffset={6} showArrow={false}>
				<div className="text-xs space-y-1">
					{port.label && <div className="font-medium">{port.label}</div>}
					<div
						className={`font-mono ${port.label ? "text-muted-foreground" : "font-medium"}`}
					>
						localhost:{port.port}
					</div>
					{(port.processName || port.pid != null) && (
						<div className="text-muted-foreground">
							{port.processName}
							{port.pid != null && ` (pid ${port.pid})`}
						</div>
					)}
					{canJumpToTerminal && (
						<div className="text-muted-foreground/70 text-[10px]">
							Click to open workspace
						</div>
					)}
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
