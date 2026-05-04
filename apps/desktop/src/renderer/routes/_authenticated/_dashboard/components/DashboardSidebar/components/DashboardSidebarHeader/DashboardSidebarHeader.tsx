import { FEATURE_FLAGS } from "@superset/shared/constants";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { HiMiniPlus, HiOutlineClipboardDocumentList } from "react-icons/hi2";
import {
	LuClock,
	LuFolderInput,
	LuFolderPlus,
	LuLayers,
	LuPlus,
} from "react-icons/lu";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import { NavigationControls } from "renderer/routes/_authenticated/_dashboard/components/NavigationControls";
import { SidebarToggle } from "renderer/routes/_authenticated/_dashboard/components/SidebarToggle";
import { OrganizationDropdown } from "renderer/routes/_authenticated/_dashboard/components/TopBar/components/OrganizationDropdown";
import { useTasksFilterStore } from "renderer/routes/_authenticated/_dashboard/tasks/stores/tasks-filter-state";
import { STROKE_WIDTH_THICK } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import { useOpenNewProjectModal } from "renderer/stores/add-repository-modal";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";

interface DashboardSidebarHeaderProps {
	isCollapsed?: boolean;
}

export function DashboardSidebarHeader({
	isCollapsed = false,
}: DashboardSidebarHeaderProps) {
	const openModal = useOpenNewWorkspaceModal();
	const openNewProject = useOpenNewProjectModal();
	const navigate = useNavigate();
	const folderImport = useFolderFirstImport({
		onError: (message) => {
			toast.error(`Import failed: ${message}`);
		},
		onMultipleProjects: ({ candidates }) => {
			toast.error("Import failed", {
				description: `Multiple projects use this repository (${candidates.length}). Choose the project in settings to set it up on this device.`,
				action: {
					label: "Open Projects",
					onClick: () => navigate({ to: "/settings/projects" }),
				},
			});
		},
	});

	const handleImportFolder = async () => {
		const result = await folderImport.start();
		if (result) {
			toast.success("Project ready — open it from the sidebar.");
		}
	};
	const shortcutText = useHotkeyDisplay("NEW_WORKSPACE").text;
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	// Default to Mac while loading so we don't briefly cover the traffic lights.
	const isMac = platform === undefined || platform === "darwin";
	const matchRoute = useMatchRoute();
	const { gateFeature } = usePaywall();
	const isWorkspacesListOpen = !!matchRoute({ to: "/v2-workspaces" });
	const isTasksOpen = !!matchRoute({ to: "/tasks", fuzzy: true });
	const isAutomationsOpen = !!matchRoute({ to: "/automations", fuzzy: true });

	const showAutomations = useFeatureFlagEnabled(
		FEATURE_FLAGS.AUTOMATIONS_ACCESS,
	);

	const {
		tab: lastTab,
		assignee: lastAssignee,
		search: lastSearch,
	} = useTasksFilterStore();

	const handleWorkspacesClick = () => {
		navigate({ to: "/v2-workspaces" });
	};

	const handleAutomationsClick = () => {
		gateFeature(GATED_FEATURES.AUTOMATIONS, () => {
			navigate({ to: "/automations" });
		});
	};

	const handleTasksClick = () => {
		gateFeature(GATED_FEATURES.TASKS, () => {
			const search: Record<string, string> = {};
			if (lastTab !== "all") search.tab = lastTab;
			if (lastAssignee) search.assignee = lastAssignee;
			if (lastSearch) search.search = lastSearch;
			navigate({ to: "/tasks", search });
		});
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

				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={handleTasksClick}
							className={cn(
								"flex size-8 items-center justify-center rounded-md transition-colors",
								isTasksOpen
									? "bg-accent text-foreground"
									: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
							)}
						>
							<HiOutlineClipboardDocumentList className="size-4" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">Tasks</TooltipContent>
				</Tooltip>

				{showAutomations && (
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={handleAutomationsClick}
								className={cn(
									"flex size-8 items-center justify-center rounded-md transition-colors",
									isAutomationsOpen
										? "bg-accent text-foreground"
										: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
								)}
							>
								<LuClock className="size-4" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="right">Automations</TooltipContent>
					</Tooltip>
				)}

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

				<DropdownMenu>
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									aria-label="Add repository"
									className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
								>
									<LuFolderPlus className="size-4" />
								</button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent side="right">Add repository</TooltipContent>
					</Tooltip>
					<DropdownMenuContent align="start">
						<DropdownMenuItem onSelect={() => openNewProject()}>
							<HiMiniPlus className="size-4" />
							Create new project
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={handleImportFolder}>
							<LuFolderInput className="size-4" />
							Import project
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-1 border-b border-border px-2 pt-2 pb-2">
			{/* -mx-2 cancels the parent's px-2 so this row owns its own
			    horizontal inset — keeps traffic-light alignment matching the
			    TopBar's 80px pad regardless of parent padding changes. */}
			<div
				className="drag -mx-2 flex h-8 items-center gap-1.5"
				style={{ paddingLeft: isMac ? "80px" : "8px" }}
			>
				<SidebarToggle />
				<NavigationControls />
			</div>
			<OrganizationDropdown variant="expanded" />

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

			{showAutomations && (
				<button
					type="button"
					onClick={handleAutomationsClick}
					className={cn(
						"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
						isAutomationsOpen
							? "bg-accent text-foreground"
							: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
					)}
				>
					<LuClock className="size-4 shrink-0" />
					<span className="flex-1 text-left">Automations</span>
				</button>
			)}

			<button
				type="button"
				onClick={handleTasksClick}
				className={cn(
					"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
					isTasksOpen
						? "bg-accent text-foreground"
						: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
				)}
			>
				<HiOutlineClipboardDocumentList className="size-4 shrink-0" />
				<span className="flex-1 text-left">Tasks</span>
			</button>

			<div className="flex items-center gap-1">
				<button
					type="button"
					onClick={() => openModal()}
					className="group flex flex-1 min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
				>
					<LuPlus
						className="size-4 shrink-0"
						strokeWidth={STROKE_WIDTH_THICK}
					/>
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
				<DropdownMenu>
					<Tooltip delayDuration={300}>
						<TooltipTrigger asChild>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									aria-label="Add repository"
									className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
								>
									<LuFolderPlus className="size-4" />
								</button>
							</DropdownMenuTrigger>
						</TooltipTrigger>
						<TooltipContent side="right">Add repository</TooltipContent>
					</Tooltip>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onSelect={() => openNewProject()}>
							<HiMiniPlus className="size-4" />
							Create new project
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={handleImportFolder}>
							<LuFolderInput className="size-4" />
							Import project
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
