import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { LuLayers, LuPlus } from "react-icons/lu";
import {
	STROKE_WIDTH,
	STROKE_WIDTH_THICK,
} from "renderer/screens/main/components/WorkspaceSidebar/constants";
import {
	useEffectiveHotkeysMap,
	useHotkeysStore,
} from "renderer/stores/hotkeys";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import { formatHotkeyText } from "shared/hotkeys";

interface DashboardSidebarHeaderProps {
	isCollapsed?: boolean;
}

export function DashboardSidebarHeader({
	isCollapsed = false,
}: DashboardSidebarHeaderProps) {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const openModal = useOpenNewWorkspaceModal();
	const platform = useHotkeysStore((state) => state.platform);
	const effective = useEffectiveHotkeysMap();
	const shortcutText = formatHotkeyText(effective.NEW_WORKSPACE, platform);
	const isWorkspacesPageOpen = !!matchRoute({ to: "/v2-workspaces" });

	const handleWorkspacesClick = () => {
		navigate({ to: "/v2-workspaces" });
	};

	if (isCollapsed) {
		return (
			<div className="flex flex-col items-center gap-2 border-b border-border py-2">
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleWorkspacesClick}
							className={cn(
								"flex size-8 items-center justify-center rounded-md transition-colors",
								isWorkspacesPageOpen
									? "bg-accent text-foreground"
									: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
							)}
						>
							<LuLayers className="size-4" strokeWidth={STROKE_WIDTH} />
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">Workspaces</TooltipContent>
				</Tooltip>

				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => openModal()}
							className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
						>
							<LuPlus className="size-4" strokeWidth={STROKE_WIDTH_THICK} />
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">
						New Workspace ({shortcutText})
					</TooltipContent>
				</Tooltip>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-1 border-b border-border px-2 pt-2 pb-2">
			<button
				type="button"
				onClick={handleWorkspacesClick}
				className={cn(
					"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
					isWorkspacesPageOpen
						? "bg-accent text-foreground"
						: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
				)}
			>
				<div className="flex size-5 items-center justify-center">
					<LuLayers className="size-4" strokeWidth={STROKE_WIDTH} />
				</div>
				<span className="flex-1 text-left">Workspaces</span>
			</button>

			<button
				type="button"
				onClick={() => openModal()}
				className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
			>
				<LuPlus className="size-4 shrink-0" strokeWidth={STROKE_WIDTH_THICK} />
				<span className="flex-1 text-left">New Workspace</span>
				<span
					className={cn(
						"shrink-0 text-[10px] font-mono tabular-nums text-muted-foreground/60",
						"opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
					)}
				>
					{shortcutText}
				</span>
			</button>
		</div>
	);
}
