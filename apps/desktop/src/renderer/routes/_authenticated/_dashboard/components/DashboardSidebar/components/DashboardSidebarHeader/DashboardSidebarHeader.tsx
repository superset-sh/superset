import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { LuFolderPlus, LuPlus } from "react-icons/lu";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { OrganizationDropdown } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/OrganizationDropdown";
import { STROKE_WIDTH_THICK } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";

interface DashboardSidebarHeaderProps {
	isCollapsed?: boolean;
}

export function DashboardSidebarHeader({
	isCollapsed = false,
}: DashboardSidebarHeaderProps) {
	const openModal = useOpenNewWorkspaceModal();
	const shortcutText = useHotkeyDisplay("NEW_WORKSPACE").text;

	if (isCollapsed) {
		return (
			<div className="flex flex-col items-center gap-2 border-b border-border py-2">
				<OrganizationDropdown variant="collapsed" />

				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
						>
							<LuFolderPlus className="size-4" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">Add Repository</TooltipContent>
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
			<div className="flex items-center gap-1">
				<div className="flex-1 min-w-0">
					<OrganizationDropdown variant="expanded" />
				</div>
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
						>
							<LuFolderPlus className="size-4" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">Add Repository</TooltipContent>
				</Tooltip>
			</div>

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
