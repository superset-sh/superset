import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { LuExternalLink, LuLoaderCircle, LuX } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
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
	const openInBrowserPane = useTabsStore((s) => s.openInBrowserPane);
	const { data: openLinksInApp } =
		electronTrpc.settings.getOpenLinksInApp.useQuery();
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const { isPending, killPort } = useKillPort();

	const handleClick = () => {
		navigateToWorkspace(port.workspaceId, navigate);
	};

	const handleOpenInBrowser = () => {
		if (openUrl.isPending) return;
		const url = `http://localhost:${port.port}`;

		if (openLinksInApp) {
			navigateToWorkspace(port.workspaceId, navigate);
			openInBrowserPane(port.workspaceId, url);
			return;
		}

		openUrl.mutate(url);
	};

	const handleClose = () => {
		if (isPending) return;
		void killPort(port);
	};

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div
					className={cn(
						"group relative mb-1 inline-flex max-w-full items-center gap-1 rounded-md",
						"bg-primary/10 text-xs text-primary transition-colors hover:bg-primary/20",
						isPending && "opacity-70",
					)}
				>
					<button
						type="button"
						onClick={handleClick}
						className="flex max-w-40 min-w-0 items-center gap-1 rounded-md px-2 py-1 font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					>
						{port.label ? (
							<>
								<span className="min-w-0 truncate">{port.label}</span>
								<span className="shrink-0 font-mono font-normal text-muted-foreground">
									{port.port}
								</span>
							</>
						) : (
							<span className="font-mono text-muted-foreground">
								{port.port}
							</span>
						)}
					</button>
					<button
						type="button"
						onClick={handleOpenInBrowser}
						disabled={openUrl.isPending}
						aria-label={`Open ${port.label || `port ${port.port}`} in browser`}
						className="text-muted-foreground opacity-0 transition-opacity hover:text-primary focus-visible:opacity-100 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 group-hover:opacity-100"
					>
						<LuExternalLink className="size-3.5" strokeWidth={STROKE_WIDTH} />
					</button>
					<button
						type="button"
						onClick={handleClose}
						disabled={isPending}
						aria-busy={isPending}
						aria-label={`Close ${port.label || `port ${port.port}`}`}
						className="pr-1 text-muted-foreground opacity-0 transition-opacity hover:text-primary focus-visible:opacity-100 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-70 group-hover:opacity-100"
					>
						{isPending ? (
							<LuLoaderCircle
								className="size-3.5 animate-spin"
								strokeWidth={STROKE_WIDTH}
							/>
						) : (
							<LuX className="size-3.5" strokeWidth={STROKE_WIDTH} />
						)}
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
					<div className="text-[10px] text-muted-foreground/70">
						Click to open workspace
					</div>
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
