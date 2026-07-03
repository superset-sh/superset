import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import {
	LuAppWindow,
	LuEllipsisVertical,
	LuExternalLink,
	LuLoaderCircle,
	LuSquareTerminal,
	LuX,
} from "react-icons/lu";
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

	const portUrl = `http://localhost:${port.port}`;

	const handleOpenExternal = () => {
		if (!canOpenInBrowser || openUrl.isPending) return;
		openUrl.mutate(portUrl);
	};

	const handleOpenInApp = (target: "new-tab" | "current-tab") => {
		if (!canOpenInBrowser) return;
		void navigateToV2Workspace(port.workspaceId, navigate, {
			search: {
				openUrl: portUrl,
				openUrlTarget: target,
				openUrlRequestId: crypto.randomUUID(),
			},
		});
	};

	// Where a plain click opens the port is configurable under
	// Settings → Links → Ports.
	const handleOpenInBrowser = () => {
		if (preferences.portOpenAction === "external") {
			handleOpenExternal();
			return;
		}
		handleOpenInApp(
			preferences.portOpenAction === "newTab" ? "new-tab" : "current-tab",
		);
	};

	// Opening the port is the primary action; remote ports can't open a local
	// browser tab, so clicking those jumps to the workspace instead.
	const handlePrimaryClick = canOpenInBrowser
		? handleOpenInBrowser
		: handleWorkspaceClick;

	const handleClose = () => {
		if (isPending) return;
		void killPort(port);
	};

	return (
		<div
			className={cn(
				"group flex max-w-44 shrink-0 items-center rounded",
				"bg-muted/60 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
				isPending && "opacity-70",
			)}
		>
			<Tooltip delayDuration={700}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={handlePrimaryClick}
						disabled={isPending}
						aria-busy={isPending}
						className="flex min-w-0 items-center gap-1 rounded-l py-0.5 pl-1.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
					</button>
				</TooltipTrigger>
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
						<div className="text-[10px] text-background/60">
							{canOpenInBrowser
								? "Click to open in browser"
								: "Click to open workspace"}
						</div>
					</div>
				</TooltipContent>
			</Tooltip>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						aria-label={`Actions for ${port.label || `port ${port.port}`}`}
						disabled={isPending}
						className="flex shrink-0 items-center self-stretch rounded-r px-1 text-muted-foreground/50 opacity-0 transition-[opacity,color] hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:opacity-100 data-[state=open]:text-foreground data-[state=open]:opacity-100"
					>
						{isPending ? (
							<LuLoaderCircle
								className="size-3 animate-spin"
								strokeWidth={STROKE_WIDTH}
							/>
						) : (
							<LuEllipsisVertical
								className="size-3"
								strokeWidth={STROKE_WIDTH}
							/>
						)}
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					onCloseAutoFocus={(event) => event.preventDefault()}
				>
					{canOpenInBrowser && (
						<>
							<DropdownMenuItem
								onSelect={handleOpenExternal}
								disabled={openUrl.isPending}
							>
								<LuExternalLink />
								Open in External Browser
							</DropdownMenuItem>
							<DropdownMenuItem
								onSelect={() =>
									handleOpenInApp(
										preferences.portOpenAction === "pane"
											? "current-tab"
											: "new-tab",
									)
								}
							>
								<LuAppWindow />
								Open in Superset Browser
							</DropdownMenuItem>
						</>
					)}
					<DropdownMenuItem onSelect={handleWorkspaceClick}>
						<LuSquareTerminal />
						Go to Workspace
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						onSelect={handleClose}
						disabled={isPending}
					>
						<LuX />
						Close Port
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
