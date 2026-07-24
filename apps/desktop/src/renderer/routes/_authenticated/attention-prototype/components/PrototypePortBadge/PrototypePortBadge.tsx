import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import {
	LuEllipsisVertical,
	LuExternalLink,
	LuSquareTerminal,
	LuX,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { DashboardSidebarWorkspaceHostType } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/types";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import type { PrototypePort } from "../../model/types";

interface PrototypePortBadgeProps {
	port: PrototypePort;
	hostType: DashboardSidebarWorkspaceHostType;
	/** Prototype analogue of "Go to Workspace" — activates the fixture row. */
	onGoToWorkspace: () => void;
	/** Removes the fixture port (real app kills the process). */
	onClose: () => void;
}

/**
 * Fixture-driven copy of DashboardSidebarPortBadge: same pill/tooltip/dropdown
 * presentation, with actions remapped to the prototype store — no ports
 * provider, kill hook, or user preferences.
 */
export function PrototypePortBadge({
	port,
	hostType,
	onGoToWorkspace,
	onClose,
}: PrototypePortBadgeProps) {
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const canOpenInBrowser = hostType === "local-device";
	const hostLabel =
		hostType === "local-device" ? "Local device" : "Remote host";
	const portUrl = `http://localhost:${port.port}`;

	const handleOpenExternal = () => {
		if (!canOpenInBrowser || openUrl.isPending) return;
		openUrl.mutate(portUrl);
	};

	// Opening the port is the primary action; remote ports can't open a local
	// browser tab, so clicking those jumps to the workspace instead.
	const handlePrimaryClick = canOpenInBrowser
		? handleOpenExternal
		: onGoToWorkspace;

	return (
		<div
			className={cn(
				"group flex max-w-44 shrink-0 items-center rounded",
				"bg-muted/60 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
			)}
		>
			<Tooltip delayDuration={700}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={handlePrimaryClick}
						className="flex min-w-0 items-center gap-1 rounded-l py-0.5 pl-1.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					>
						{port.label ? (
							<>
								<span className="min-w-0 truncate">{port.label}</span>
								<span className="shrink-0 font-mono text-[10px] text-muted-foreground/60 tabular-nums">
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
						<div className="text-background/70">
							{port.processName} (pid {port.pid})
						</div>
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
						className="flex shrink-0 items-center self-stretch rounded-r px-1 text-muted-foreground/50 opacity-0 transition-[opacity,color] hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover:opacity-100 data-[state=open]:text-foreground data-[state=open]:opacity-100"
					>
						<LuEllipsisVertical className="size-3" strokeWidth={STROKE_WIDTH} />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					onCloseAutoFocus={(event) => event.preventDefault()}
				>
					{canOpenInBrowser && (
						<DropdownMenuItem
							onSelect={handleOpenExternal}
							disabled={openUrl.isPending}
						>
							<LuExternalLink />
							Open in External Browser
						</DropdownMenuItem>
					)}
					<DropdownMenuItem onSelect={onGoToWorkspace}>
						<LuSquareTerminal />
						Go to Workspace
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem variant="destructive" onSelect={onClose}>
						<LuX />
						Close Port
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
