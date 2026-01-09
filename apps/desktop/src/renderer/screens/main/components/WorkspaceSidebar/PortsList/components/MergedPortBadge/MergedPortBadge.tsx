import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuExternalLink } from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { MergedPort } from "shared/types";
import { STROKE_WIDTH } from "../../../constants";

interface MergedPortBadgeProps {
	port: MergedPort;
	isCurrentWorkspace: boolean;
}

export function MergedPortBadge({
	port,
	isCurrentWorkspace,
}: MergedPortBadgeProps) {
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const setActiveMutation = trpc.workspaces.setActive.useMutation();
	const utils = trpc.useUtils();

	const portNumberColor = port.isActive
		? "text-muted-foreground"
		: "text-muted-foreground/80";

	const displayContent = port.label ? (
		<>
			{port.label}{" "}
			<span className={`font-mono font-normal ${portNumberColor}`}>
				{port.port}
			</span>
		</>
	) : (
		<span className={`font-mono ${portNumberColor}`}>{port.port}</span>
	);

	const canJumpToTerminal = port.isActive && port.paneId;

	const handleClick = async () => {
		if (!canJumpToTerminal || !port.paneId) return;

		if (!isCurrentWorkspace) {
			await setActiveMutation.mutateAsync({ id: port.workspaceId });
			await utils.workspaces.getActive.invalidate();
		}

		const pane = useTabsStore.getState().panes[port.paneId];
		if (!pane) return;

		setActiveTab(port.workspaceId, pane.tabId);
		setFocusedPane(pane.tabId, port.paneId);
	};

	const handleOpenInBrowser = () => {
		window.open(`http://localhost:${port.port}`, "_blank");
	};

	const badgeClasses = isCurrentWorkspace
		? "bg-primary/10 text-primary hover:bg-primary/20"
		: "bg-muted/50 text-muted-foreground hover:bg-muted";

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div
					className={`group relative inline-flex items-center gap-1 rounded-md text-xs transition-colors mb-1 ${badgeClasses}`}
				>
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
						className="opacity-0 group-hover:opacity-100 pr-1 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none"
					>
						<LuExternalLink className="size-3" strokeWidth={STROKE_WIDTH} />
					</button>
				</div>
			</TooltipTrigger>
			<TooltipContent side="top" showArrow={false}>
				<div className="text-xs space-y-1">
					{port.label && <div className="font-medium">{port.label}</div>}
					<div
						className={`font-mono ${port.label ? "text-muted-foreground" : "font-medium"}`}
					>
						localhost:{port.port}
					</div>
					{port.isActive && (
						<>
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
						</>
					)}
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
