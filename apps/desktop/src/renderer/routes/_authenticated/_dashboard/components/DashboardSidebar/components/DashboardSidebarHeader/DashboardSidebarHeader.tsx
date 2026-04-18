import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { HiMiniPlus } from "react-icons/hi2";
import { LuFolderInput, LuFolderPlus, LuLayers, LuPlus } from "react-icons/lu";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { OrganizationDropdown } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/OrganizationDropdown";
import { STROKE_WIDTH_THICK } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import {
	useOpenNewProjectModal,
	useTriggerFolderImport,
} from "renderer/stores/add-repository-modal";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";

interface DashboardSidebarHeaderProps {
	isCollapsed?: boolean;
}

export function DashboardSidebarHeader({
	isCollapsed = false,
}: DashboardSidebarHeaderProps) {
	const openModal = useOpenNewWorkspaceModal();
	const openNewProject = useOpenNewProjectModal();
	const triggerFolderImport = useTriggerFolderImport();
	const shortcutText = useHotkeyDisplay("NEW_WORKSPACE").text;
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const isWorkspacesListOpen = !!matchRoute({ to: "/v2-workspaces" });

	const handleWorkspacesClick = () => {
		navigate({ to: "/v2-workspaces" });
	};

	if (isCollapsed) {
		return (
			<div className="flex flex-col items-center gap-2 border-b border-border py-2">
				<OrganizationDropdown variant="collapsed" />

				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleWorkspacesClick}
							className={cn(
								"flex size-8 items-center justify-center rounded-md transition-colors",
								isWorkspacesListOpen
									? "bg-accent text-foreground"
									: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
							)}
						>
							<LuLayers className="size-4" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">Workspaces</TooltipContent>
				</Tooltip>

				<DropdownMenu>
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
								>
									<LuFolderPlus className="size-4" />
								</button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent side="right">Add repository</TooltipContent>
					</Tooltip>
					<DropdownMenuContent align="start">
						<DropdownMenuItem onSelect={openNewProject}>
							<HiMiniPlus className="size-4" />
							New project
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={triggerFolderImport}>
							<LuFolderInput className="size-4" />
							Import existing folder
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>

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
				<DropdownMenu>
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
								>
									<LuFolderPlus className="size-4" />
								</button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent side="right">Add repository</TooltipContent>
					</Tooltip>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onSelect={openNewProject}>
							<HiMiniPlus className="size-4" />
							New project
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={triggerFolderImport}>
							<LuFolderInput className="size-4" />
							Import existing folder
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<button
				type="button"
				onClick={handleWorkspacesClick}
				className={cn(
					"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
					isWorkspacesListOpen
						? "bg-accent text-foreground"
						: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
				)}
			>
				<LuLayers className="size-4 shrink-0" />
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
